"use strict";
/**
 * @file ipcHandlers.ts
 * @description
 * Consolidated directory reading logic + asynchronous FS operations for Prompt Composer.
 *
 * Step 5 (Centralize & Enhance Error Handling):
 *  - We introduced a local logError helper function to unify console logging in dev mode,
 *    removing raw console.error/warn calls in production.
 *  - We still rely on console messages only in dev because the main process cannot
 *    directly trigger React toasts. For user-visible errors in the frontend, the renderer
 *    must show them after receiving the error or null data from these handlers.
 *  - The code is otherwise the same as before, with try/catch blocks around file operations
 *    to handle errors. We removed direct console.warn/error calls and replaced them with `logError`.
 *
 * Step 1 (Debug/Perf enhancements):
 *  - Added a logDebug function that logs debug/performance info in dev mode, or if DEBUG_PROD
 *    environment variable is set to '1' (or truthy).
 *  - Instrumented the 'list-directory' and 'read-file' handlers to measure performance timing.
 *  - Added an IPC handler 'check-permissions' to test read/write in the user's home directory,
 *    helping to diagnose disk permission issues in packaged builds.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerIpcHandlers = void 0;
const electron_1 = require("electron");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const ignore_1 = __importDefault(require("ignore"));
const ALLOWED_EXTENSIONS = [
    '.txt',
    '.md',
    '.js',
    '.ts',
    '.tsx',
    '.jsx',
    '.json',
    '.py',
    '.css',
    '.html',
    '.sql',
];
/**
 * Helper function to unify error logging in the main process.
 * In production, we omit console.error to reduce noise (unless in debug).
 */
function logError(context, err) {
    const isDev = process.env.NODE_ENV === 'development';
    const debugProd = process.env.DEBUG_PROD === '1' || process.env.DEBUG_PROD === 'true';
    if (isDev || debugProd) {
        if (err instanceof Error) {
            console.error(`[ipcHandlers] ${context}: ${err.message}`);
        }
        else {
            console.error(`[ipcHandlers] ${context}:`, err);
        }
    }
}
/**
 * Helper function to unify debug logging in the main process.
 * We log debug info in dev mode or if the user sets DEBUG_PROD=1.
 */
function logDebug(context, message) {
    const isDev = process.env.NODE_ENV === 'development';
    const debugProd = process.env.DEBUG_PROD === '1' || process.env.DEBUG_PROD === 'true';
    if (isDev || debugProd) {
        console.log(`[ipcHandlers DEBUG] ${context}: ${message}`);
    }
}
/**
 * Lists .txt or .md files in a .prompt-composer folder
 */
async function listPromptComposerFiles(folderPath) {
    try {
        const stat = await fs_1.default.promises.stat(folderPath);
        if (!stat.isDirectory()) {
            return [];
        }
    }
    catch {
        return [];
    }
    const dirEntries = await fs_1.default.promises.readdir(folderPath, { withFileTypes: true });
    const results = [];
    for (const dirent of dirEntries) {
        if (!dirent.isFile())
            continue;
        const ext = path_1.default.extname(dirent.name).toLowerCase();
        if (ext === '.txt' || ext === '.md') {
            results.push(dirent.name);
        }
    }
    return results;
}
/**
 * Creates an ignore object for a given path, reading .gitignore and .promptignore files
 * @param pathToList The directory path to create ignore rules for
 * @param projectRoot The project root path (if available)
 * @returns Ignore object with configured rules
 */
async function createIgnoreForPath(pathToList, projectRoot) {
    // Create a new ignore instance
    const ig = (0, ignore_1.default)();
    // Always ignore .git and .DS_Store
    ig.add(['.git/**', '.DS_Store']);
    // Helper function to read an ignore file
    const readIgnoreFile = async (filePath, ignoreType) => {
        try {
            const content = await fs_1.default.promises.readFile(filePath, 'utf8');
            logDebug('createIgnoreForPath', `Successfully read ${ignoreType} from ${filePath}`);
            return content.split('\n').filter(line => line.trim() !== '' && !line.startsWith('#'));
        }
        catch (err) {
            logDebug('createIgnoreForPath', `No ${ignoreType} found at ${filePath} or couldn't read it`);
            return [];
        }
    };
    // Path-specific ignore rules (if we're in a project)
    if (projectRoot) {
        // Check for .gitignore in project root
        const gitIgnorePath = path_1.default.join(projectRoot, '.gitignore');
        const gitIgnoreRules = await readIgnoreFile(gitIgnorePath, '.gitignore');
        if (gitIgnoreRules.length > 0) {
            ig.add(gitIgnoreRules);
            logDebug('createIgnoreForPath', `Added ${gitIgnoreRules.length} rules from .gitignore in project root`);
        }
        // Check for .promptignore in project root
        const promptIgnorePath = path_1.default.join(projectRoot, '.promptignore');
        const promptIgnoreRules = await readIgnoreFile(promptIgnorePath, '.promptignore');
        if (promptIgnoreRules.length > 0) {
            ig.add(promptIgnoreRules);
            logDebug('createIgnoreForPath', `Added ${promptIgnoreRules.length} rules from .promptignore in project root`);
        }
        // Also check for .promptignore in .prompt-composer directory (legacy location)
        const legacyPromptIgnorePath = path_1.default.join(projectRoot, '.prompt-composer', '.promptignore');
        const legacyPromptIgnoreRules = await readIgnoreFile(legacyPromptIgnorePath, '.promptignore (legacy location)');
        if (legacyPromptIgnoreRules.length > 0) {
            ig.add(legacyPromptIgnoreRules);
            logDebug('createIgnoreForPath', `Added ${legacyPromptIgnoreRules.length} rules from .promptignore in legacy location`);
        }
    }
    // If pathToList is not project root, check for ignore files in that directory too
    if (pathToList !== projectRoot) {
        // Check for .gitignore in the target directory
        const localGitIgnorePath = path_1.default.join(pathToList, '.gitignore');
        const localGitIgnoreRules = await readIgnoreFile(localGitIgnorePath, '.gitignore');
        if (localGitIgnoreRules.length > 0) {
            ig.add(localGitIgnoreRules);
            logDebug('createIgnoreForPath', `Added ${localGitIgnoreRules.length} rules from .gitignore in target directory`);
        }
        // Check for .promptignore in the target directory
        const localPromptIgnorePath = path_1.default.join(pathToList, '.promptignore');
        const localPromptIgnoreRules = await readIgnoreFile(localPromptIgnorePath, '.promptignore');
        if (localPromptIgnoreRules.length > 0) {
            ig.add(localPromptIgnoreRules);
            logDebug('createIgnoreForPath', `Added ${localPromptIgnoreRules.length} rules from .promptignore in target directory`);
        }
        // Also check for .promptignore in .prompt-composer subdirectory (legacy location)
        const localLegacyPromptIgnorePath = path_1.default.join(pathToList, '.prompt-composer', '.promptignore');
        const localLegacyPromptIgnoreRules = await readIgnoreFile(localLegacyPromptIgnorePath, '.promptignore (legacy location)');
        if (localLegacyPromptIgnoreRules.length > 0) {
            ig.add(localLegacyPromptIgnoreRules);
            logDebug('createIgnoreForPath', `Added ${localLegacyPromptIgnoreRules.length} rules from .promptignore in legacy subdirectory`);
        }
    }
    // Always ignore some common large directories
    ig.add(['node_modules/**', 'dist/**', 'build/**', 'release/**', 'coverage/**']);
    return ig;
}
/**
 * Recursively (or shallowly) reads a directory, returning an array of TreeNodes
 * @param dirPath The directory path
 * @param ig The ignore rules instance
 * @param isProjectDir Whether this path is within the recognized project root
 * @param projectRoot The project root path
 * @param shallow If true, only read immediate children (skip recursion)
 * @returns TreeNode[]
 */
async function readDirectoryTree(dirPath, ig, isProjectDir, projectRoot, shallow = false) {
    const results = [];
    let entries = [];
    try {
        entries = await fs_1.default.promises.readdir(dirPath);
    }
    catch (err) {
        logError(`[list-directory] Failed to read dir (async) [${dirPath}]`, err);
        return results;
    }
    entries.sort((a, b) => a.localeCompare(b));
    // Skip heavy directories immediately for better performance
    const basename = path_1.default.basename(dirPath);
    if (basename === 'node_modules' || basename === '.git' || basename === 'release') {
        logDebug('readDirectoryTree', `Skipping heavy directory: ${dirPath}`);
        return results;
    }
    for (const entry of entries) {
        // Skip common heavy directories immediately
        if (entry === 'node_modules' || entry === '.git' || entry === 'release' ||
            entry === '.DS_Store' || entry === 'dist' || entry === 'build' ||
            entry === 'coverage') {
            continue;
        }
        const fullPath = path_1.default.join(dirPath, entry);
        // Get path relative to project root (for ignore patterns)
        const relPath = isProjectDir
            ? path_1.default.relative(projectRoot, fullPath)
            : path_1.default.relative(path_1.default.dirname(dirPath), fullPath);
        // Check if this path matches any ignore patterns
        if (ig.ignores(relPath)) {
            logDebug('readDirectoryTree', `Ignoring path due to ignore patterns: ${relPath}`);
            continue;
        }
        let stats;
        try {
            stats = await fs_1.default.promises.stat(fullPath);
        }
        catch (statErr) {
            // skip this entry if we can't stat
            logDebug('[list-directory]', `Could not stat: ${fullPath}. Skipping.`);
            continue;
        }
        if (stats.isDirectory()) {
            if (shallow) {
                // Provide an empty children array
                results.push({
                    name: entry,
                    path: fullPath,
                    type: 'directory',
                    children: [],
                });
            }
            else {
                // Recursively read its children
                const children = await readDirectoryTree(fullPath, ig, isProjectDir, projectRoot, false);
                results.push({
                    name: entry,
                    path: fullPath,
                    type: 'directory',
                    children,
                });
            }
        }
        else {
            // File
            const ext = path_1.default.extname(entry).toLowerCase();
            if (ALLOWED_EXTENSIONS.includes(ext)) {
                results.push({
                    name: entry,
                    path: fullPath,
                    type: 'file',
                });
            }
        }
    }
    return results;
}
// Add debug logging for production builds
const DEBUG_PROD = process.env.DEBUG_PROD === '1';
const log = (message, ...args) => {
    if (DEBUG_PROD || process.env.NODE_ENV !== 'production') {
        console.log(`[main] ${message}`, ...args);
    }
};
// Improve error handling in file operations
const safeReadFile = (filePath) => {
    try {
        if (fs_1.default.existsSync(filePath)) {
            log(`Reading file: ${filePath}`);
            return fs_1.default.readFileSync(filePath, 'utf8');
        }
        log(`File not found: ${filePath}`);
        return null;
    }
    catch (error) {
        console.error(`Error reading file ${filePath}:`, error);
        return null;
    }
};
// Safely create directories if they don't exist
const ensureDirectoryExists = (dirPath) => {
    try {
        if (!fs_1.default.existsSync(dirPath)) {
            log(`Creating directory: ${dirPath}`);
            fs_1.default.mkdirSync(dirPath, { recursive: true });
        }
        return true;
    }
    catch (error) {
        console.error(`Error creating directory ${dirPath}:`, error);
        return false;
    }
};
/**
 * registerIpcHandlers
 *
 * The 'list-directory' channel now accepts:
 *   (dirPath: string, options?: { shallow?: boolean })
 * We default shallow=false if not provided.
 */
function registerIpcHandlers() {
    log('Setting up IPC handlers');
    // list-directory
    electron_1.ipcMain.handle('list-directory', async (_event, dirPath, options) => {
        const startTime = performance.now();
        const shallow = options?.shallow ?? false;
        logDebug('[list-directory]', `Invoked for path=${dirPath}, shallow=${shallow}`);
        try {
            let targetPath = dirPath;
            if (!path_1.default.isAbsolute(dirPath)) {
                targetPath = path_1.default.join(process.cwd(), dirPath);
            }
            // Update the project root to the opened directory when a user opens a directory
            // This allows us to prioritize templates in the opened project
            try {
                const stats = await fs_1.default.promises.stat(targetPath);
                if (stats.isDirectory()) {
                    // Check if we can access the directory
                    await fs_1.default.promises.access(targetPath, fs_1.default.constants.R_OK);
                    // Log current project root for debugging
                    console.log(`[list-directory] Current project root: ${global.projectRoot}`);
                    console.log(`[list-directory] Target directory: ${targetPath}`);
                    // Always update project root when a directory is explicitly opened
                    // Don't require the name to include "prompt-composer"
                    if (targetPath !== global.projectRoot) {
                        console.log(`[list-directory] Setting project root to opened directory: ${targetPath}`);
                        global.projectRoot = targetPath;
                        // Verify the new project root was set
                        console.log(`[list-directory] New project root set: ${global.projectRoot}`);
                        // Reset template cache if global was tracking a different path
                        // @ts-ignore - Ignore the type check for the global templateCache
                        global.templateCache = {};
                    }
                }
            }
            catch (err) {
                logError('[list-directory] Error updating project root', err);
            }
            const projectRoot = global.projectRoot || process.cwd();
            const ig = await createIgnoreForPath(targetPath, projectRoot);
            const treeNodes = await readDirectoryTree(targetPath, ig, targetPath === projectRoot, projectRoot, shallow);
            const baseName = path_1.default.basename(targetPath);
            const endTime = performance.now();
            logDebug('[list-directory]', `Completed in ${Math.round(endTime - startTime)}ms for path=${dirPath}`);
            return {
                absolutePath: targetPath,
                baseName,
                children: treeNodes,
            };
        }
        catch (err) {
            logError('[list-directory] Async error', err);
            return {
                absolutePath: dirPath,
                baseName: path_1.default.basename(dirPath),
                children: [],
            };
        }
    });
    // read-file
    electron_1.ipcMain.handle('read-file', async (_event, filePath) => {
        const startTime = performance.now();
        logDebug('[read-file]', `Invoked for file=${filePath}`);
        try {
            const content = await fs_1.default.promises.readFile(filePath, 'utf-8');
            const endTime = performance.now();
            logDebug('[read-file]', `Completed reading file=${filePath} in ${Math.round(endTime - startTime)}ms`);
            return content;
        }
        catch (err) {
            logError(`[read-file] Failed [${filePath}]`, err);
            throw err;
        }
    });
    // export-xml
    electron_1.ipcMain.handle('export-xml', async (_event, { defaultFileName, xmlContent }) => {
        try {
            const saveDialogOptions = {
                title: 'Export Prompt Composition as XML',
                defaultPath: defaultFileName || 'prompt_composition.xml',
                filters: [
                    { name: 'XML Files', extensions: ['xml'] },
                    { name: 'All Files', extensions: ['*'] },
                ],
            };
            const result = await electron_1.dialog.showSaveDialog(saveDialogOptions);
            if (result.canceled || !result.filePath) {
                return false;
            }
            await fs_1.default.promises.writeFile(result.filePath, xmlContent, 'utf-8');
            return true;
        }
        catch (err) {
            logError('[export-xml] Failed to save XML', err);
            return false;
        }
    });
    // import-xml
    electron_1.ipcMain.handle('import-xml', async () => {
        try {
            const openDialogOptions = {
                title: 'Import Prompt Composition from XML',
                filters: [
                    { name: 'XML Files', extensions: ['xml'] },
                    { name: 'All Files', extensions: ['*'] },
                ],
                properties: ['openFile'],
            };
            const result = await electron_1.dialog.showOpenDialog(openDialogOptions);
            if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
                return null;
            }
            const filePath = result.filePaths[0];
            const content = await fs_1.default.promises.readFile(filePath, 'utf-8');
            return content;
        }
        catch (err) {
            logError('[import-xml] Failed to import XML', err);
            return null;
        }
    });
    // show-open-dialog
    electron_1.ipcMain.handle('show-open-dialog', async (_event, options) => {
        return electron_1.dialog.showOpenDialog(options);
    });
    // create-folder
    electron_1.ipcMain.handle('create-folder', async (_event, { parentPath, folderName }) => {
        let baseName = folderName;
        let suffix = 1;
        let targetPath = path_1.default.join(parentPath, baseName);
        while (true) {
            try {
                const exists = await fs_1.default.promises.stat(targetPath);
                if (exists && exists.isDirectory()) {
                    suffix += 1;
                    baseName = `${folderName} (${suffix})`;
                    targetPath = path_1.default.join(parentPath, baseName);
                }
            }
            catch {
                break;
            }
        }
        try {
            await fs_1.default.promises.mkdir(targetPath);
            return targetPath;
        }
        catch (err) {
            logError('[create-folder] Error creating folder', err);
            return null;
        }
    });
    // verify-file-existence
    electron_1.ipcMain.handle('verify-file-existence', async (_event, filePath) => {
        try {
            await fs_1.default.promises.stat(filePath);
            return true;
        }
        catch {
            return false;
        }
    });
    // read-prompt-composer-file
    electron_1.ipcMain.handle('read-prompt-composer-file', async (_event, fileName, subDirectory) => {
        try {
            // Sanity check for very long filenames which are likely template content
            // This happens when template content is mistakenly passed instead of a filename
            if (fileName && (fileName.length > 100 || fileName.includes('\n'))) {
                logError('read-prompt-composer-file', 'Invalid filename: Received template content instead of a filename');
                return null;
            }
            const projectDir = global.projectRoot || process.cwd();
            let dirPath = path_1.default.join(projectDir, '.prompt-composer');
            // Log more details for debugging
            console.log(`[read-prompt-composer-file] Project root: ${projectDir}`);
            console.log(`[read-prompt-composer-file] Looking for file: ${fileName}`);
            console.log(`[read-prompt-composer-file] In .prompt-composer path: ${dirPath}`);
            // Check if the project directory and .prompt-composer directory exist and are readable
            try {
                await fs_1.default.promises.access(projectDir, fs_1.default.constants.R_OK);
                try {
                    await fs_1.default.promises.access(dirPath, fs_1.default.constants.F_OK);
                }
                catch (dirErr) {
                    // Directory doesn't exist, try to create it if we have write access
                    try {
                        await fs_1.default.promises.access(projectDir, fs_1.default.constants.W_OK);
                        await fs_1.default.promises.mkdir(dirPath, { recursive: true });
                        console.log(`[read-prompt-composer-file] Created directory: ${dirPath}`);
                    }
                    catch (createErr) {
                        console.warn(`[read-prompt-composer-file] Cannot create .prompt-composer directory: ${dirPath}`, createErr);
                        // Proceed anyway - we'll fail on the file read if needed
                    }
                }
                if (subDirectory) {
                    dirPath = path_1.default.join(dirPath, subDirectory);
                    console.log(`[read-prompt-composer-file] With subdirectory: ${dirPath}`);
                    // Ensure the subdirectory exists
                    try {
                        await fs_1.default.promises.access(dirPath, fs_1.default.constants.F_OK);
                    }
                    catch (subdirErr) {
                        // Subdirectory doesn't exist, try to create it
                        try {
                            await fs_1.default.promises.mkdir(dirPath, { recursive: true });
                            console.log(`[read-prompt-composer-file] Created subdirectory: ${dirPath}`);
                        }
                        catch (createSubdirErr) {
                            console.warn(`[read-prompt-composer-file] Cannot create subdirectory: ${dirPath}`, createSubdirErr);
                            // Proceed anyway - we'll fail on the file read if needed
                        }
                    }
                }
                const filePath = path_1.default.join(dirPath, fileName);
                console.log(`[read-prompt-composer-file] Full file path: ${filePath}`);
                // Try to read the file
                try {
                    const content = await fs_1.default.promises.readFile(filePath, 'utf-8');
                    console.log(`[read-prompt-composer-file] Successfully read file: ${filePath}`);
                    return content;
                }
                catch (fileErr) {
                    console.warn(`[read-prompt-composer-file] File not found or not readable: ${filePath}`, fileErr);
                    // If no extension was provided, try with extensions
                    if (!fileName.includes('.')) {
                        // Try with .txt extension
                        const txtPath = filePath + '.txt';
                        console.log(`[read-prompt-composer-file] Trying with .txt extension: ${txtPath}`);
                        try {
                            const txtContent = await fs_1.default.promises.readFile(txtPath, 'utf-8');
                            console.log(`[read-prompt-composer-file] Successfully read .txt file: ${txtPath}`);
                            return txtContent;
                        }
                        catch (txtErr) {
                            console.warn(`[read-prompt-composer-file] .txt file not found: ${txtPath}`);
                        }
                        // Try with .md extension
                        const mdPath = filePath + '.md';
                        console.log(`[read-prompt-composer-file] Trying with .md extension: ${mdPath}`);
                        try {
                            const mdContent = await fs_1.default.promises.readFile(mdPath, 'utf-8');
                            console.log(`[read-prompt-composer-file] Successfully read .md file: ${mdPath}`);
                            return mdContent;
                        }
                        catch (mdErr) {
                            console.warn(`[read-prompt-composer-file] .md file not found: ${mdPath}`);
                        }
                    }
                    // No file found with any extensions
                    console.log(`[read-prompt-composer-file] No file found for ${fileName} in project .prompt-composer directory`);
                    return null;
                }
            }
            catch (projectErr) {
                console.error(`[read-prompt-composer-file] Project directory not accessible: ${projectDir}`, projectErr);
                return null;
            }
        }
        catch (error) {
            console.error(`[read-prompt-composer-file] Error in read-prompt-composer-file (${fileName}):`, error);
            return null;
        }
    });
    // list-all-template-files
    electron_1.ipcMain.handle('list-all-template-files', async (_event, args) => {
        const { projectFolders } = args || { projectFolders: [] };
        const result = [];
        const globalDir = path_1.default.join(os_1.default.homedir(), '.prompt-composer');
        try {
            const globalFiles = await listPromptComposerFiles(globalDir);
            for (const gf of globalFiles) {
                result.push({ fileName: gf, source: 'global' });
            }
        }
        catch (err) {
            logError('[list-all-template-files] Could not list global .prompt-composer files', err);
        }
        for (const folder of projectFolders) {
            const localDir = path_1.default.join(folder, '.prompt-composer');
            try {
                const localFiles = await listPromptComposerFiles(localDir);
                for (const lf of localFiles) {
                    result.push({ fileName: lf, source: 'project' });
                }
            }
            catch (err) {
                logError(`[list-all-template-files] Could not list .prompt-composer in folder: ${folder}`, err);
            }
        }
        return result;
    });
    // read-global-prompt-composer-file
    electron_1.ipcMain.handle('read-global-prompt-composer-file', async (event, fileName, subDirectory) => {
        try {
            const homeDir = os_1.default.homedir();
            let dirPath = path_1.default.join(homeDir, '.prompt-composer');
            // Ensure the base directory exists
            ensureDirectoryExists(dirPath);
            if (subDirectory) {
                dirPath = path_1.default.join(dirPath, subDirectory);
                // Ensure the subdirectory exists
                ensureDirectoryExists(dirPath);
            }
            const filePath = path_1.default.join(dirPath, fileName);
            log(`Attempting to read global file: ${filePath}`);
            const content = safeReadFile(filePath);
            // If no content but no extension was provided, try with extensions
            if (!content && !fileName.includes('.')) {
                // Try with .txt extension
                const txtPath = filePath + '.txt';
                log(`Trying with .txt extension: ${txtPath}`);
                const txtContent = safeReadFile(txtPath);
                if (txtContent)
                    return txtContent;
                // Try with .md extension
                const mdPath = filePath + '.md';
                log(`Trying with .md extension: ${mdPath}`);
                const mdContent = safeReadFile(mdPath);
                if (mdContent)
                    return mdContent;
            }
            return content;
        }
        catch (error) {
            console.error(`Error in read-global-prompt-composer-file (${fileName}):`, error);
            return null;
        }
    });
    // write-prompt-composer-file
    electron_1.ipcMain.handle('write-prompt-composer-file', async (_event, args) => {
        try {
            const projectRoot = process.cwd();
            const promptComposerFolder = path_1.default.join(projectRoot, '.prompt-composer');
            try {
                await fs_1.default.promises.stat(promptComposerFolder);
            }
            catch {
                await fs_1.default.promises.mkdir(promptComposerFolder, { recursive: true });
            }
            const targetPath = path_1.default.join(promptComposerFolder, args.relativeFilename);
            await fs_1.default.promises.writeFile(targetPath, args.content, 'utf-8');
            return true;
        }
        catch (err) {
            logError(`[write-prompt-composer-file] Error writing file ${args.relativeFilename}`, err);
            if (err instanceof Error) {
                return { error: `Failed to write file ${args.relativeFilename}: ${err.message}` };
            }
            return { error: `Failed to write file ${args.relativeFilename}: Unknown error` };
        }
    });
    /**
     * check-permissions
     * Tests basic file system permissions to help diagnose access problems.
     */
    electron_1.ipcMain.handle('check-permissions', async (_event) => {
        const results = {
            home: { read: false, write: false, path: '' },
            promptComposerGlobal: { read: false, write: false, exists: false, path: '' },
            temp: { read: false, write: false, path: '' }
        };
        try {
            // Test home directory access
            const homeDir = os_1.default.homedir();
            results.home.path = homeDir;
            await fs_1.default.promises.access(homeDir, fs_1.default.constants.R_OK);
            results.home.read = true;
            await fs_1.default.promises.access(homeDir, fs_1.default.constants.W_OK);
            results.home.write = true;
            // Test .prompt-composer access
            const promptComposerDir = path_1.default.join(homeDir, '.prompt-composer');
            results.promptComposerGlobal.path = promptComposerDir;
            try {
                await fs_1.default.promises.access(promptComposerDir);
                results.promptComposerGlobal.exists = true;
                await fs_1.default.promises.access(promptComposerDir, fs_1.default.constants.R_OK);
                results.promptComposerGlobal.read = true;
                await fs_1.default.promises.access(promptComposerDir, fs_1.default.constants.W_OK);
                results.promptComposerGlobal.write = true;
            }
            catch (err) {
                // Directory doesn't exist or isn't accessible
                logError(`[check-permissions] .prompt-composer dir issue: ${promptComposerDir}`, err);
            }
            // Test temp directory access
            const tempDir = os_1.default.tmpdir();
            results.temp.path = tempDir;
            await fs_1.default.promises.access(tempDir, fs_1.default.constants.R_OK);
            results.temp.read = true;
            await fs_1.default.promises.access(tempDir, fs_1.default.constants.W_OK);
            results.temp.write = true;
            return results;
        }
        catch (err) {
            logError('[check-permissions] Error testing permissions', err);
            return { ...results, error: String(err) };
        }
    });
    // Add this new function to support path resolution in the renderer
    electron_1.ipcMain.handle('get-template-paths', async (event, templateName) => {
        try {
            const homeDir = os_1.default.homedir();
            const projectDir = global.projectRoot || process.cwd();
            const paths = [];
            // Project templates first
            paths.push(path_1.default.join(projectDir, '.prompt-composer', 'template', templateName));
            // Global templates second
            paths.push(path_1.default.join(homeDir, '.prompt-composer', 'template', templateName));
            // Add variants with extensions
            const extensions = ['.txt', '.md'];
            for (const ext of extensions) {
                paths.push(path_1.default.join(projectDir, '.prompt-composer', 'template', templateName + ext));
                paths.push(path_1.default.join(homeDir, '.prompt-composer', 'template', templateName + ext));
            }
            log(`Possible paths for ${templateName}:`, paths);
            return paths;
        }
        catch (error) {
            console.error(`Error in get-template-paths (${templateName}):`, error);
            return [];
        }
    });
    // Add a handler to check filesystem permissions
    electron_1.ipcMain.handle('check-filesystem-permissions', async () => {
        const result = {};
        try {
            console.log('Checking filesystem permissions...');
            // Check home directory
            const homeDir = electron_1.app.getPath('home');
            result.home = await checkDirPermissions(homeDir);
            // Check global .prompt-composer directory
            const globalPromptComposerDir = path_1.default.join(homeDir, '.prompt-composer');
            result.globalPromptComposer = await checkDirPermissions(globalPromptComposerDir);
            // Check project .prompt-composer directory
            const projectDir = global.projectRoot || process.cwd();
            const projectPromptComposerDir = path_1.default.join(projectDir, '.prompt-composer');
            // Log detailed information about the project directory checks
            console.log(`[check-permissions] Project root: ${projectDir}`);
            console.log(`[check-permissions] Project .prompt-composer: ${projectPromptComposerDir}`);
            // Try to check if the projectDir itself is accessible first
            try {
                await fs_1.default.promises.access(projectDir, fs_1.default.constants.R_OK);
                console.log(`[check-permissions] Project directory is readable: ${projectDir}`);
                result.projectPromptComposer = await checkDirPermissions(projectPromptComposerDir);
            }
            catch (projectDirErr) {
                console.error(`[check-permissions] Project directory is not accessible: ${projectDir}`, projectDirErr);
                // Still report on the directory, but mark it as not accessible
                result.projectPromptComposer = {
                    dir: projectPromptComposerDir,
                    canRead: false,
                    canWrite: false
                };
            }
            // Check temp directory
            const tempDir = electron_1.app.getPath('temp');
            result.temp = await checkDirPermissions(tempDir);
            console.log('Filesystem permissions result:', result);
            return result;
        }
        catch (error) {
            console.error('Error checking filesystem permissions:', error);
            if (error instanceof Error) {
                result.error = error.message;
            }
            else {
                result.error = String(error);
            }
            return result;
        }
    });
    // read-template-file
    electron_1.ipcMain.handle('read-template-file', async (_event, templateName) => {
        try {
            if (!templateName) {
                console.log('[read-template-file] No template name provided');
                return null;
            }
            // Clean up template name by trimming any whitespace
            const cleanTemplateName = templateName.trim();
            const homeDir = os_1.default.homedir();
            // For project root, check if it's been set properly
            let projectDir = global.projectRoot;
            // Debug logging to help diagnose project root issues
            console.log(`[read-template-file] Attempting to read template: "${cleanTemplateName}"`);
            console.log(`[read-template-file] Current global.projectRoot: ${projectDir}`);
            console.log(`[read-template-file] Home directory: ${homeDir}`);
            // If project directory is a parent of the home directory or the same, don't use it
            // This prevents using incorrect values like "/" as the project root
            if (projectDir && (homeDir.startsWith(projectDir) || projectDir === homeDir)) {
                console.log(`[read-template-file] Project directory (${projectDir}) contains home directory or is the same - ignoring it`);
                projectDir = null;
            }
            // Check if global.projectRoot is usable
            if (projectDir) {
                try {
                    await fs_1.default.promises.access(projectDir, fs_1.default.constants.R_OK);
                    console.log(`[read-template-file] Verified access to project root: ${projectDir}`);
                    // Create .prompt-composer subdirectory if not exists
                    const projectPromptDir = path_1.default.join(projectDir, '.prompt-composer');
                    if (!fs_1.default.existsSync(projectPromptDir)) {
                        try {
                            fs_1.default.mkdirSync(projectPromptDir, { recursive: true });
                            console.log(`[read-template-file] Created .prompt-composer directory in project: ${projectPromptDir}`);
                        }
                        catch (mkdirErr) {
                            console.error(`[read-template-file] Failed to create project .prompt-composer directory: ${projectPromptDir}`, mkdirErr);
                        }
                    }
                }
                catch (err) {
                    console.warn(`[read-template-file] Cannot access project root: ${projectDir}, error: ${err.message}`);
                    projectDir = null;
                }
            }
            else {
                console.log(`[read-template-file] No valid project root available, using only home directory templates`);
            }
            // Create the .prompt-composer directory if it doesn't exist
            const ensurePromptComposerDir = async (baseDir) => {
                try {
                    // Check if we can access the base directory first
                    try {
                        await fs_1.default.promises.access(baseDir, fs_1.default.constants.R_OK);
                        console.log(`[read-template-file] Base path is readable: ${baseDir}`);
                    }
                    catch (baseErr) {
                        console.error(`[read-template-file] Cannot read base path: ${baseDir}`, baseErr);
                        return false;
                    }
                    const promptComposerDir = path_1.default.join(baseDir, '.prompt-composer');
                    // Try to create or access .prompt-composer directory
                    try {
                        await fs_1.default.promises.access(promptComposerDir, fs_1.default.constants.F_OK);
                        console.log(`[read-template-file] .prompt-composer directory exists: ${promptComposerDir}`);
                    }
                    catch {
                        // Only create the directory if we have write access
                        try {
                            await fs_1.default.promises.access(baseDir, fs_1.default.constants.W_OK);
                            try {
                                await fs_1.default.promises.mkdir(promptComposerDir, { recursive: true });
                                console.log(`[read-template-file] Created .prompt-composer directory: ${promptComposerDir}`);
                            }
                            catch (mkdirErr) {
                                console.error(`[read-template-file] Failed to create .prompt-composer directory: ${promptComposerDir}`, mkdirErr);
                                return false;
                            }
                        }
                        catch (writeErr) {
                            console.warn(`[read-template-file] No write access to create .prompt-composer in: ${baseDir}`);
                        }
                    }
                    return true;
                }
                catch (err) {
                    console.error(`[read-template-file] Error initializing directories at ${baseDir}:`, err);
                    return false;
                }
            };
            // Try to ensure .prompt-composer directories exist
            if (projectDir && projectDir !== homeDir) {
                await ensurePromptComposerDir(projectDir);
            }
            await ensurePromptComposerDir(homeDir);
            // Define paths to check in order of priority
            const pathsToTry = [];
            // Project paths first (highest priority)
            if (projectDir && projectDir !== homeDir) {
                const promptComposerDir = path_1.default.join(projectDir, '.prompt-composer');
                const projectTemplatePath = path_1.default.join(promptComposerDir, cleanTemplateName);
                // Check if the directory exists
                try {
                    await fs_1.default.promises.access(promptComposerDir, fs_1.default.constants.R_OK);
                    pathsToTry.push(projectTemplatePath);
                    console.log(`[read-template-file] Added project template path (PRIORITY 1): ${projectTemplatePath}`);
                    // If no extension provided, try with .txt and .md extensions for project
                    if (!cleanTemplateName.includes('.')) {
                        const projectTxtPath = path_1.default.join(promptComposerDir, `${cleanTemplateName}.txt`);
                        const projectMdPath = path_1.default.join(promptComposerDir, `${cleanTemplateName}.md`);
                        pathsToTry.push(projectTxtPath);
                        pathsToTry.push(projectMdPath);
                        console.log(`[read-template-file] Added project template paths (PRIORITY 2):\n${projectTxtPath}\n${projectMdPath}`);
                    }
                }
                catch (err) {
                    console.log(`[read-template-file] Project .prompt-composer directory not accessible: ${promptComposerDir}`);
                }
            }
            // Then try global paths (lower priority)
            const globalPromptComposerDir = path_1.default.join(homeDir, '.prompt-composer');
            const globalTemplatePath = path_1.default.join(globalPromptComposerDir, cleanTemplateName);
            pathsToTry.push(globalTemplatePath);
            console.log(`[read-template-file] Added global template path (PRIORITY 3): ${globalTemplatePath}`);
            // Global paths with extensions (lowest priority)
            if (!cleanTemplateName.includes('.')) {
                const globalTxtPath = path_1.default.join(globalPromptComposerDir, `${cleanTemplateName}.txt`);
                const globalMdPath = path_1.default.join(globalPromptComposerDir, `${cleanTemplateName}.md`);
                pathsToTry.push(globalTxtPath);
                pathsToTry.push(globalMdPath);
                console.log(`[read-template-file] Added global template paths (PRIORITY 4):\n${globalTxtPath}\n${globalMdPath}`);
            }
            console.log(`[read-template-file] Search paths for "${cleanTemplateName}":\n${pathsToTry.join('\n')}`);
            // Try each path in order of priority
            for (const filePath of pathsToTry) {
                let fileExists = false;
                try {
                    // First check if the file exists at all
                    try {
                        const fileStats = await fs_1.default.promises.stat(filePath);
                        if (!fileStats.isFile()) {
                            console.log(`[read-template-file] Path exists but is not a file: ${filePath}`);
                            continue;
                        }
                        fileExists = true;
                    }
                    catch (statErr) {
                        if (statErr.code === 'ENOENT') {
                            console.log(`[read-template-file] File does not exist: ${filePath}`);
                        }
                        else {
                            console.error(`[read-template-file] Error checking file existence: ${filePath}`, statErr);
                        }
                        continue;
                    }
                    // If file exists, check if it's readable
                    try {
                        await fs_1.default.promises.access(filePath, fs_1.default.constants.R_OK);
                    }
                    catch (accessErr) {
                        console.error(`[read-template-file] File exists but is not readable: ${filePath}`, accessErr);
                        continue;
                    }
                    // File exists and is readable, now read its content
                    const content = await fs_1.default.promises.readFile(filePath, 'utf-8');
                    console.log(`[read-template-file] ✅ Found template at: ${filePath}`);
                    // If this is a project-specific template, make that clear in the logs
                    if (projectDir && filePath.startsWith(path_1.default.join(projectDir, '.prompt-composer'))) {
                        console.log(`[read-template-file] Using PROJECT-SPECIFIC template: ${filePath}`);
                    }
                    else {
                        console.log(`[read-template-file] Using GLOBAL template: ${filePath}`);
                    }
                    // Log the content for debugging (first 100 chars)
                    const previewContent = content.length > 100 ? content.substring(0, 100) + '...' : content;
                    console.log(`[read-template-file] Template content preview: ${previewContent}`);
                    // Check if content has nested templates
                    if (content.includes('{{') && content.includes('}}')) {
                        console.log(`[read-template-file] Template "${cleanTemplateName}" contains nested templates that will be processed by the renderer`);
                    }
                    return content;
                }
                catch (err) {
                    // General error handling for the entire operation
                    if (fileExists) {
                        console.error(`[read-template-file] ❌ Error reading template content: ${filePath}`, err);
                    }
                    else {
                        const errorCode = err.code || 'unknown';
                        console.error(`[read-template-file] ❌ Error accessing template at: ${filePath} (${errorCode})`, err);
                    }
                    continue;
                }
            }
            console.log(`[read-template-file] ❌ Template "${cleanTemplateName}" not found in any location`);
            // Template not found - suggest creating it for better user experience
            console.log(`[read-template-file] Templates should be placed in either:`);
            if (projectDir && projectDir !== homeDir) {
                console.log(`  - ${path_1.default.join(projectDir, '.prompt-composer')} (project-specific templates)`);
            }
            console.log(`  - ${path_1.default.join(homeDir, '.prompt-composer')} (global templates)`);
            return null;
        }
        catch (error) {
            console.error(`[read-template-file] Error reading template "${templateName}":`, error);
            return null;
        }
    });
}
exports.registerIpcHandlers = registerIpcHandlers;
/**
 * Helper function to check read/write permissions for a directory
 */
async function checkDirPermissions(dirPath) {
    const result = { dir: dirPath, canRead: false, canWrite: false };
    try {
        // Check if directory exists
        try {
            await fs_1.default.promises.access(dirPath, fs_1.default.constants.F_OK);
        }
        catch (error) {
            // Directory doesn't exist, try to create it
            try {
                await fs_1.default.promises.mkdir(dirPath, { recursive: true });
                console.log(`Created directory: ${dirPath}`);
            }
            catch (createError) {
                console.log(`Couldn't create directory: ${dirPath}`, createError);
                return result;
            }
        }
        // Check read permission
        try {
            await fs_1.default.promises.access(dirPath, fs_1.default.constants.R_OK);
            result.canRead = true;
        }
        catch (error) {
            console.log(`No read permission for: ${dirPath}`);
        }
        // Check write permission
        try {
            // Create a temp file to test write permissions
            const testFile = path_1.default.join(dirPath, `test-write-${Date.now()}.tmp`);
            await fs_1.default.promises.writeFile(testFile, 'test');
            await fs_1.default.promises.unlink(testFile);
            result.canWrite = true;
        }
        catch (error) {
            console.log(`No write permission for: ${dirPath}`);
        }
    }
    catch (error) {
        console.error(`Error checking permissions for ${dirPath}:`, error);
    }
    return result;
}
