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
    '.cs',
];
/**
 * Read additional extensions from a .promptextensions file
 * @param directoryPath The directory to look for .promptextensions file
 * @param includeParentDirs If true, also check parent directories for extensions
 * @returns Array of additional extensions to include
 */
async function readAdditionalExtensions(directoryPath, includeParentDirs = false) {
    // Log the directory we're checking
    logDebug('readAdditionalExtensions', `Checking for .promptextensions in directory: ${directoryPath}`);
    // Helper function to read a .promptextensions file
    const readExtensionsFile = async (filePath) => {
        try {
            const content = await fs_1.default.promises.readFile(filePath, 'utf8');
            logDebug('readAdditionalExtensions', `Found .promptextensions file at ${filePath}`);
            // Parse each line as an extension - ignore comments and empty lines
            const additionalExtensions = content
                .split('\n')
                .map(line => line.trim())
                .filter(line => line && !line.startsWith('#'))
                .map(ext => ext.startsWith('.') ? ext : `.${ext}`); // Ensure extensions start with a dot
            logDebug('readAdditionalExtensions', `Loaded ${additionalExtensions.length} custom extensions from ${filePath}: ${additionalExtensions.join(', ')}`);
            return additionalExtensions;
        }
        catch (err) {
            // File doesn't exist or can't be read - this is normal
            logDebug('readAdditionalExtensions', `No .promptextensions file found at ${filePath} or error reading it: ${err instanceof Error ? err.message : String(err)}`);
            return [];
        }
    };
    // Check for .promptextensions in the target directory
    const rootExtensionsPath = path_1.default.join(directoryPath, '.promptextensions');
    const rootExtensions = await readExtensionsFile(rootExtensionsPath);
    // Also check for .promptextensions in .prompt-composer subdirectory (preferred location)
    const composerExtensionsPath = path_1.default.join(directoryPath, '.prompt-composer', '.promptextensions');
    const composerExtensions = await readExtensionsFile(composerExtensionsPath);
    // Combine both sources, prioritizing .prompt-composer location
    let combinedExtensions = [...new Set([...rootExtensions, ...composerExtensions])];
    // Check parent directories if requested
    if (includeParentDirs) {
        const parentDir = path_1.default.dirname(directoryPath);
        // Stop at root directory
        if (parentDir && parentDir !== directoryPath) {
            const parentExtensions = await readAdditionalExtensions(parentDir, true);
            // Combine with parent extensions
            combinedExtensions = [...new Set([...combinedExtensions, ...parentExtensions])];
        }
    }
    logDebug('readAdditionalExtensions', `Final combined extensions for ${directoryPath}: ${combinedExtensions.join(', ')}`);
    return combinedExtensions;
}
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
        if ((ext === '.txt' || ext === '.md') && !dirent.name.startsWith('.promptignore')) {
            results.push(dirent.name);
        }
    }
    return results;
}
/**
 * Creates an ignore object for a given path, reading .gitignore and .promptignore files
 * @param pathToList The directory path to create ignore rules for
 * @returns Ignore object with configured rules
 */
async function createIgnoreForPath(pathToList) {
    // Create a new ignore instance
    const ig = (0, ignore_1.default)();
    // Always ignore .git and .DS_Store
    ig.add(['.git/**', '.DS_Store', '.prompt-composer/**']);
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
    // Only check the directory that is actively being scanned
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
 * @param customExtensions Array of custom extensions to include
 * @param forceAllExtensions If true, include ALL file extensions, bypassing filtering
 * @returns TreeNode[]
 */
async function readDirectoryTree(dirPath, ig, isProjectDir, projectRoot, shallow = false, customExtensions = [], forceAllExtensions = false) {
    const results = [];
    let entries = [];
    // Log allowed extensions for this directory
    logDebug('readDirectoryTree', `Starting to read directory: ${dirPath} with custom extensions: ${customExtensions.join(', ')}`);
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
    // Check for .promptextensions file in the current directory and parent directories
    const directoryExtensions = await readAdditionalExtensions(dirPath, true);
    if (directoryExtensions.length > 0) {
        // Merge with existing custom extensions
        customExtensions = [...new Set([...customExtensions, ...directoryExtensions])];
        logDebug('readDirectoryTree', `Using ${customExtensions.length} custom extensions for directory ${dirPath}`);
    }
    // Create combined extensions list for this directory
    const allowedExtensions = [...ALLOWED_EXTENSIONS, ...customExtensions];
    // If forceAllExtensions is true, log that we're bypassing extension filtering
    if (forceAllExtensions) {
        logDebug('readDirectoryTree', `Extension filtering DISABLED for ${dirPath} (forceAllExtensions=true) - DEBUG ONLY`);
    }
    for (const entry of entries) {
        // Skip common heavy directories immediately
        if (entry === 'node_modules' ||
            entry === '.git' ||
            entry === 'release' ||
            entry === '.DS_Store' ||
            entry === 'dist' ||
            entry === 'build' ||
            entry === 'coverage' ||
            entry === '.prompt-composer' || // Always skip .prompt-composer folder in file tree
            entry === '.promptignore' || // Always skip .promptignore files
            entry === '.gitignore' || // Always skip .gitignore files
            entry === '.promptextensions' // Always skip .promptextensions files
        ) {
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
                const children = await readDirectoryTree(fullPath, ig, isProjectDir, projectRoot, false, customExtensions, forceAllExtensions);
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
            // Log extension filtering decisions 
            const shouldIncludeFile = forceAllExtensions || allowedExtensions.includes(ext);
            if (ext === '.meta') {
                logDebug('readDirectoryTree', `META file: ${fullPath} - Will ${shouldIncludeFile ? 'INCLUDE' : 'EXCLUDE'} (forceAll=${forceAllExtensions}, inAllowed=${allowedExtensions.includes(ext)})`);
            }
            // Include file if forceAllExtensions is true OR the extension is allowed
            if (shouldIncludeFile) {
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
 *   (dirPath: string, options?: { shallow?: boolean; addToProjectDirectories?: boolean; forceAllExtensions?: boolean })
 * We default shallow=false, addToProjectDirectories=false, and forceAllExtensions=false if not provided.
 */
function registerIpcHandlers() {
    // IPC handler to check if DevTools are open
    electron_1.ipcMain.handle('is-dev-tools-open', () => {
        return global.isDevToolsOpen === true;
    });
    log('Setting up IPC handlers');
    // Initialize the global project directories list if it doesn't exist
    if (!global.projectDirectories) {
        global.projectDirectories = [];
    }
    // list-directory
    electron_1.ipcMain.handle('list-directory', async (_event, dirPath, options) => {
        const startTime = performance.now();
        const shallow = options?.shallow ?? false;
        const addToProjectDirectories = options?.addToProjectDirectories ?? false;
        // forceAllExtensions is only for debugging purposes, default to false
        const forceAllExtensions = options?.forceAllExtensions ?? false;
        logDebug('[list-directory]', `Invoked for path=${dirPath}, shallow=${shallow}, addToProjectDirectories=${addToProjectDirectories}, forceAllExtensions=${forceAllExtensions}`);
        try {
            let targetPath = dirPath;
            if (!path_1.default.isAbsolute(dirPath)) {
                targetPath = path_1.default.join(process.cwd(), dirPath);
            }
            // When a user explicitly wants to add a directory, add it to project directories
            // so that templates in this directory can be found
            try {
                const stats = await fs_1.default.promises.stat(targetPath);
                if (stats.isDirectory()) {
                    // Check if we can access the directory
                    await fs_1.default.promises.access(targetPath, fs_1.default.constants.R_OK);
                    // Initialize projectDirectories if it doesn't exist
                    if (!global.projectDirectories) {
                        global.projectDirectories = [];
                        logDebug('[list-directory]', 'Initialized empty projectDirectories array');
                    }
                    // The first directory opened by the user becomes the "current" project root
                    // but all directories are treated equally for template searching
                    if (!global.projectRoot) {
                        global.projectRoot = targetPath;
                        logDebug('[list-directory]', `Set initial project root to: ${global.projectRoot}`);
                    }
                    // Normalize path for consistent comparison
                    const normalizedTargetPath = path_1.default.normalize(targetPath);
                    // Log current project directories
                    logDebug('[list-directory]', `Current project directories (${global.projectDirectories.length}): ${global.projectDirectories.join(', ') || 'none'}`);
                    logDebug('[list-directory]', `Current project root: ${global.projectRoot || 'not set'}`);
                    logDebug('[list-directory]', `Target directory being opened: ${targetPath}`);
                    // Only add to projectDirectories if explicitly requested
                    if (addToProjectDirectories) {
                        // Check if it's already in the projectDirectories list using normalized paths
                        const alreadyInList = global.projectDirectories.some(dir => path_1.default.normalize(dir) === normalizedTargetPath);
                        if (!alreadyInList) {
                            // Add it to the list of project directories for template search
                            global.projectDirectories.push(targetPath);
                            logDebug('[list-directory]', `User opened a new directory - added to project directories list. Now tracking ${global.projectDirectories.length} directories:`);
                            global.projectDirectories.forEach((dir, i) => {
                                logDebug('[list-directory]', `  [${i}] ${dir}`);
                            });
                            // Reset template cache when adding a new directory
                            global.templateCache = {};
                            logDebug('[list-directory]', 'Template cache cleared due to new directory being added');
                        }
                        else {
                            logDebug('[list-directory]', `Directory ${targetPath} is already in the project directories list`);
                        }
                    }
                    else {
                        logDebug('[list-directory]', `Directory ${targetPath} opened but not added to project directories (addToProjectDirectories=false)`);
                    }
                }
            }
            catch (err) {
                logError('[list-directory] Error tracking opened directory', err);
            }
            const projectRoot = global.projectRoot || process.cwd();
            const ig = await createIgnoreForPath(targetPath);
            // Read additional extensions from this directory
            const customExtensions = await readAdditionalExtensions(targetPath, true);
            if (customExtensions.length > 0) {
                logDebug('[list-directory]', `Found ${customExtensions.length} custom extensions in ${targetPath}: ${customExtensions.join(', ')}`);
            }
            // If forceAllExtensions is true, pass an empty function for extension checking
            // that will accept all file extensions
            const readOptions = {
                shallow,
                customExtensions,
                forceAllExtensions // Pass the flag to readDirectoryTree
            };
            const treeNodes = await readDirectoryTree(targetPath, ig, targetPath === projectRoot, projectRoot, shallow, customExtensions, forceAllExtensions);
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
            // Create a list of search directories - start with project directories list
            const searchDirectories = [];
            // First, add all explicitly opened project directories in the order they were added
            if (global.projectDirectories && global.projectDirectories.length > 0) {
                searchDirectories.push(...global.projectDirectories);
                logDebug('read-prompt-composer-file', `Searching in ${global.projectDirectories.length} project directories`);
            }
            else {
                logDebug('read-prompt-composer-file', 'No project directories available - user has not opened any folders yet');
            }
            // Add home directory as fallback (always available)
            const homeDir = os_1.default.homedir();
            if (!searchDirectories.some(dir => path_1.default.normalize(dir) === path_1.default.normalize(homeDir))) {
                searchDirectories.push(homeDir);
                logDebug('read-prompt-composer-file', `Added home directory to search path: ${homeDir}`);
            }
            // Log the search paths
            logDebug('read-prompt-composer-file', `Search paths (${searchDirectories.length}): ${searchDirectories.join(', ')}`);
            // Try to find the file in each directory in order
            for (const baseDir of searchDirectories) {
                let dirPath = path_1.default.join(baseDir, '.prompt-composer');
                // Log search details
                logDebug('read-prompt-composer-file', `Looking in directory: ${dirPath}`);
                // Check if this directory exists and is readable
                try {
                    await fs_1.default.promises.access(dirPath, fs_1.default.constants.R_OK);
                }
                catch (dirErr) {
                    logDebug('read-prompt-composer-file', `Directory not accessible, skipping: ${dirPath}`);
                    continue; // Skip to next directory
                }
                if (subDirectory) {
                    dirPath = path_1.default.join(dirPath, subDirectory);
                    // Check if subdirectory exists
                    try {
                        await fs_1.default.promises.access(dirPath, fs_1.default.constants.R_OK);
                    }
                    catch (subdirErr) {
                        logDebug('read-prompt-composer-file', `Subdirectory not accessible, skipping: ${dirPath}`);
                        continue; // Skip to next directory
                    }
                }
                const filePath = path_1.default.join(dirPath, fileName);
                logDebug('read-prompt-composer-file', `Trying path: ${filePath}`);
                // Try to read the file
                try {
                    const content = await fs_1.default.promises.readFile(filePath, 'utf-8');
                    logDebug('read-prompt-composer-file', `Successfully read file: ${filePath}`);
                    return { content, path: filePath };
                }
                catch (fileErr) {
                    // If no extension was provided, try with extensions
                    if (!fileName.includes('.')) {
                        // Try with .txt extension
                        const txtPath = filePath + '.txt';
                        logDebug('read-prompt-composer-file', `Trying with .txt extension: ${txtPath}`);
                        try {
                            const txtContent = await fs_1.default.promises.readFile(txtPath, 'utf-8');
                            logDebug('read-prompt-composer-file', `Successfully read .txt file: ${txtPath}`);
                            return { content: txtContent, path: txtPath };
                        }
                        catch (txtErr) {
                            // Continue to next extension
                        }
                        // Try with .md extension
                        const mdPath = filePath + '.md';
                        logDebug('read-prompt-composer-file', `Trying with .md extension: ${mdPath}`);
                        try {
                            const mdContent = await fs_1.default.promises.readFile(mdPath, 'utf-8');
                            logDebug('read-prompt-composer-file', `Successfully read .md file: ${mdPath}`);
                            return { content: mdContent, path: mdPath };
                        }
                        catch (mdErr) {
                            // Continue to next directory
                        }
                    }
                }
            }
            // If we got here, no file was found in any location
            logDebug('read-prompt-composer-file', `No file found for ${fileName} in any location`);
            return null;
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
            try {
                const content = await fs_1.default.promises.readFile(filePath, 'utf-8');
                return { content, path: filePath };
            }
            catch (fileErr) {
                // If no extension was provided, try with extensions
                if (!fileName.includes('.')) {
                    // Try with .txt extension
                    const txtPath = filePath + '.txt';
                    log(`Trying with .txt extension: ${txtPath}`);
                    try {
                        const txtContent = await fs_1.default.promises.readFile(txtPath, 'utf-8');
                        return { content: txtContent, path: txtPath };
                    }
                    catch (txtErr) {
                        // Continue to next extension
                    }
                    // Try with .md extension
                    const mdPath = filePath + '.md';
                    log(`Trying with .md extension: ${mdPath}`);
                    try {
                        const mdContent = await fs_1.default.promises.readFile(mdPath, 'utf-8');
                        return { content: mdContent, path: mdPath };
                    }
                    catch (mdErr) {
                        // No file found with any extension
                    }
                }
                return null;
            }
        }
        catch (error) {
            console.error(`Error in read-global-prompt-composer-file (${fileName}):`, error);
            return null;
        }
    });
    // write-prompt-composer-file
    electron_1.ipcMain.handle('write-prompt-composer-file', async (_event, args) => {
        try {
            // If originalPath is provided, use that directly
            if (args.originalPath) {
                try {
                    // Get the directory from the original path
                    const dirPath = path_1.default.dirname(args.originalPath);
                    logDebug('[write-prompt-composer-file]', `Writing to original path: ${args.originalPath}`);
                    // Ensure the directory exists
                    try {
                        await fs_1.default.promises.stat(dirPath);
                    }
                    catch {
                        logDebug('[write-prompt-composer-file]', `Creating directory: ${dirPath}`);
                        await fs_1.default.promises.mkdir(dirPath, { recursive: true });
                    }
                    // Write the file to the original path
                    await fs_1.default.promises.writeFile(args.originalPath, args.content, 'utf-8');
                    return true;
                }
                catch (err) {
                    logError(`[write-prompt-composer-file] Error writing to original path ${args.originalPath}`, err);
                    if (err instanceof Error) {
                        return { error: `Failed to write file to original path: ${err.message}` };
                    }
                    return { error: `Failed to write file to original path: Unknown error` };
                }
            }
            // Use homeDir as base path for global files (fallback for backward compatibility)
            const homeDir = os_1.default.homedir();
            const promptComposerFolder = path_1.default.join(homeDir, '.prompt-composer');
            // Log the path for debugging
            logDebug('[write-prompt-composer-file]', `Writing to ${promptComposerFolder}/${args.relativeFilename}`);
            try {
                await fs_1.default.promises.stat(promptComposerFolder);
            }
            catch {
                logDebug('[write-prompt-composer-file]', `Creating directory: ${promptComposerFolder}`);
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
            temp: { read: false, write: false, path: '' },
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
    // get-template-paths
    electron_1.ipcMain.handle('get-template-paths', async (_event, templateName) => {
        try {
            // Special diagnostic info request
            if (templateName === '_diagnostic_info_') {
                return {
                    projectDirectories: global.projectDirectories || [],
                    projectRoot: global.projectRoot || null,
                    home: os_1.default.homedir(),
                    templateCacheSize: Object.keys(global.templateCache || {}).length,
                    cwd: process.cwd(),
                    timestamp: new Date().toISOString(),
                    appPath: electron_1.app.getAppPath(),
                    resourcePath: process.resourcesPath,
                    isProduction: process.env.NODE_ENV !== 'development',
                };
            }
            const searchPaths = [];
            // Project-specific templates (multiple project directories)
            if (global.projectDirectories && global.projectDirectories.length > 0) {
                for (const projectDir of global.projectDirectories) {
                    if (projectDir) {
                        const projectTemplate = path_1.default.join(projectDir, '.prompt-composer', 'template', templateName);
                        searchPaths.push(projectTemplate);
                    }
                }
            }
            // Global templates (in home directory)
            const homeDir = os_1.default.homedir();
            if (homeDir) {
                const globalTemplate = path_1.default.join(homeDir, '.prompt-composer', 'template', templateName);
                searchPaths.push(globalTemplate);
            }
            return searchPaths;
        }
        catch (err) {
            logError('[get-template-paths] Error getting template paths', err);
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
                    canWrite: false,
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
                logDebug('read-template-file', 'No template name provided');
                return null;
            }
            // Clean up template name by trimming any whitespace
            const cleanTemplateName = templateName.trim();
            // Initialize projectDirectories if needed
            if (!global.projectDirectories) {
                global.projectDirectories = [];
                logDebug('read-template-file', 'Initialized empty projectDirectories array');
            }
            // Define search directories in priority order
            const searchDirectories = [];
            // First, add all project directories that have been explicitly opened by the user
            // These are searched in the order they were added
            if (global.projectDirectories && global.projectDirectories.length > 0) {
                searchDirectories.push(...global.projectDirectories);
                logDebug('read-template-file', `Added ${global.projectDirectories.length} project directories to search paths`);
            }
            else {
                logDebug('read-template-file', 'No project directories in list - user has not opened any folders yet');
            }
            // Last, add the home directory for user global templates (always available)
            const homeDir = os_1.default.homedir();
            if (!searchDirectories.includes(homeDir)) {
                searchDirectories.push(homeDir);
                logDebug('read-template-file', `Added home directory to search paths: ${homeDir}`);
            }
            // Log the search order with more details
            logDebug('read-template-file', `Template search paths (${searchDirectories.length}): ${searchDirectories.join(', ')}`);
            // Check if we have this template in cache already
            if (global.templateCache && global.templateCache[cleanTemplateName]) {
                logDebug('read-template-file', `Using cached template: ${cleanTemplateName}`);
                return global.templateCache[cleanTemplateName];
            }
            // Clear cache if paths were removed or changed
            if (templateName.startsWith('_cache_invalidated')) {
                logDebug('read-template-file', 'Cache invalidation requested');
                global.templateCache = {};
                return null;
            }
            // Generate all possible file paths for the template in priority order
            const allPaths = [];
            for (const baseDir of searchDirectories) {
                try {
                    // Skip if directory isn't accessible
                    await fs_1.default.promises.access(baseDir, fs_1.default.constants.R_OK).catch(() => {
                        logDebug('read-template-file', `Directory not readable, skipping: ${baseDir}`);
                        return; // Skip to next directory
                    });
                    const promptComposerDir = path_1.default.join(baseDir, '.prompt-composer');
                    // Direct path in .prompt-composer
                    allPaths.push(path_1.default.join(promptComposerDir, cleanTemplateName));
                    // If no extension provided, add .txt and .md variants
                    if (!path_1.default.extname(cleanTemplateName)) {
                        allPaths.push(path_1.default.join(promptComposerDir, `${cleanTemplateName}.txt`));
                        allPaths.push(path_1.default.join(promptComposerDir, `${cleanTemplateName}.md`));
                    }
                }
                catch (err) {
                    logError('read-template-file', `Error processing directory ${baseDir}: ${err}`);
                }
            }
            logDebug('read-template-file', `Generated ${allPaths.length} search paths for "${cleanTemplateName}"`);
            // Try each path in priority order
            for (const filePath of allPaths) {
                try {
                    if (fs_1.default.existsSync(filePath)) {
                        logDebug('read-template-file', `✅ Found template at: ${filePath}`);
                        const content = fs_1.default.readFileSync(filePath, 'utf8');
                        // Cache the template by name for future use
                        if (!global.templateCache) {
                            global.templateCache = {};
                        }
                        global.templateCache[cleanTemplateName] = content;
                        return content;
                    }
                }
                catch (err) {
                    logError('read-template-file', `Error reading template file ${filePath}: ${err.message}`);
                }
            }
            logDebug('read-template-file', `Template "${cleanTemplateName}" not found in any location`);
            return null;
        }
        catch (error) {
            logError('read-template-file', `Error in read-template-file: ${error}`);
            return null;
        }
    });
    // This handler is called when a folder is removed from the UI
    electron_1.ipcMain.handle('remove-project-directory', async (_event, folderPath) => {
        try {
            logDebug('remove-project-directory', `Removing directory from templates list: ${folderPath}`);
            // Initialize if needed
            if (!global.projectDirectories) {
                global.projectDirectories = [];
                logDebug('remove-project-directory', 'Initialized empty projectDirectories array');
                return true; // Nothing to remove
            }
            // Log current directories to help debug
            logDebug('remove-project-directory', `Current directories before removal (${global.projectDirectories.length}): ${global.projectDirectories.join(', ')}`);
            // Normalize path to handle slash differences
            const normalizedRequestedPath = path_1.default.normalize(folderPath);
            // Find and remove the directory from the list (using normalized paths for comparison)
            const index = global.projectDirectories.findIndex(dir => path_1.default.normalize(dir) === normalizedRequestedPath);
            if (index !== -1) {
                global.projectDirectories.splice(index, 1);
                logDebug('remove-project-directory', `Removed directory at index ${index}: ${folderPath}`);
                logDebug('remove-project-directory', `Remaining directories (${global.projectDirectories.length}): ${global.projectDirectories.join(', ')}`);
                // Clear template cache when removing a directory
                global.templateCache = {};
                logDebug('remove-project-directory', 'Template cache cleared');
                // If this was the current project root, reset it to the first available directory
                if (global.projectRoot === folderPath) {
                    global.projectRoot =
                        global.projectDirectories.length > 0 ? global.projectDirectories[0] : null;
                    logDebug('remove-project-directory', `Reset project root to: ${global.projectRoot || 'null'}`);
                    // Note: This is important because some operations still use global.projectRoot
                    // for backward compatibility, but we're moving toward using the entire
                    // projectDirectories list for template searching
                }
                return true;
            }
            logDebug('remove-project-directory', `Directory not found in list: ${folderPath}`);
            return true; // Not in list, return success anyway
        }
        catch (err) {
            logError('remove-project-directory', `Error removing directory: ${err}`);
            return false;
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
        return result;
    }
    catch (error) {
        console.error(`Error checking directory permissions for ${dirPath}:`, error);
        return result;
    }
}
