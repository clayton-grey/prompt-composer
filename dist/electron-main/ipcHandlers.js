"use strict";
/**
 * @file ipcHandlers.ts
 * @description
 * Consolidated directory reading logic + Asynchronous FS operations, plus
 * newly added IPC handlers for listing and reading template files from both
 * the global and project .prompt-composer directories.
 *
 * Step 2 Changes (Implement a consolidated "Add Template Block" pop-up):
 *  - Added 'list-all-template-files' handler to gather .txt/.md files from:
 *      (a) Global: ~/<.prompt-composer>
 *      (b) Project: <cwd>/.prompt-composer
 *  - Added 'read-global-prompt-composer-file' to read a file from the global directory
 *    if it exists. If not found, returns null.
 *
 * Implementation Details:
 *  - We import 'os' to find the user's home directory for the global .prompt-composer folder.
 *  - We define helper function `listPromptComposerFiles(folderPath: string)` that enumerates
 *    .txt and .md files if the folder exists, ignoring hidden items.
 *  - If the folder doesn't exist or is not a directory, we skip it.
 *
 * Edge Cases:
 *  - If neither folder exists, we return an empty list.
 *  - If the user does not have a global folder, that's fine, we skip it.
 *  - If the user has no .txt/.md files, we return an empty array.
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
    '.txt', '.md', '.js', '.ts', '.tsx', '.jsx', '.json', '.py', '.css', '.html', '.sql'
];
async function listPromptComposerFiles(folderPath) {
    // We only want .txt and .md files from the folder
    // If the folder doesn't exist or isn't a directory, we return an empty array
    try {
        const stat = await fs_1.default.promises.stat(folderPath);
        if (!stat.isDirectory()) {
            return [];
        }
    }
    catch {
        // folder doesn't exist
        return [];
    }
    const files = await fs_1.default.promises.readdir(folderPath, { withFileTypes: true });
    const results = [];
    for (const dirent of files) {
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
 * Creates an ignore object based on .gitignore or default patterns.
 */
async function createIgnoreForPath(targetPath, projectRoot) {
    let ig = (0, ignore_1.default)();
    const isProjectDir = targetPath.startsWith(projectRoot);
    if (isProjectDir) {
        const gitignorePath = path_1.default.join(projectRoot, '.gitignore');
        try {
            const gitignoreContent = await fs_1.default.promises.readFile(gitignorePath, 'utf-8');
            ig = ig.add(gitignoreContent.split('\n'));
        }
        catch {
            // If .gitignore doesn't exist, skip
        }
    }
    else {
        const externalGitignorePath = path_1.default.join(targetPath, '.gitignore');
        try {
            const gitignoreContent = await fs_1.default.promises.readFile(externalGitignorePath, 'utf-8');
            ig = ig.add(gitignoreContent.split('\n'));
        }
        catch {
            // If .gitignore doesn't exist, apply defaults
            ig = ig.add([
                'node_modules',
                '.git',
                '.DS_Store',
                '*.log'
            ]);
        }
    }
    return { ig, isProjectDir };
}
/**
 * Recursively reads a directory, applying .gitignore-like filters (via 'ignore').
 */
async function readDirectoryTree(dirPath, ig, isProjectDir, projectRoot) {
    const results = [];
    let entries = [];
    try {
        entries = await fs_1.default.promises.readdir(dirPath);
    }
    catch (err) {
        console.error('[list-directory] Failed to read dir (async):', dirPath, err);
        return results; // Return empty on failure
    }
    // Sort for consistent ordering
    entries.sort((a, b) => a.localeCompare(b));
    for (const entry of entries) {
        if (entry === '.git' || entry === '.DS_Store') {
            continue;
        }
        const fullPath = path_1.default.join(dirPath, entry);
        const relPath = isProjectDir
            ? path_1.default.relative(projectRoot, fullPath)
            : path_1.default.relative(dirPath, fullPath);
        if (ig.ignores(relPath)) {
            continue;
        }
        let stats;
        try {
            stats = await fs_1.default.promises.stat(fullPath);
        }
        catch {
            continue;
        }
        if (stats.isDirectory()) {
            const children = await readDirectoryTree(fullPath, ig, isProjectDir, projectRoot);
            results.push({
                name: entry,
                path: fullPath,
                type: 'directory',
                children
            });
        }
        else {
            const ext = path_1.default.extname(entry).toLowerCase();
            if (ALLOWED_EXTENSIONS.includes(ext)) {
                results.push({
                    name: entry,
                    path: fullPath,
                    type: 'file'
                });
            }
        }
    }
    return results;
}
function registerIpcHandlers() {
    // list-directory (async)
    electron_1.ipcMain.handle('list-directory', async (_event, dirPath) => {
        try {
            let targetPath = dirPath;
            if (!path_1.default.isAbsolute(dirPath)) {
                targetPath = path_1.default.join(process.cwd(), dirPath);
            }
            console.log('[list-directory] Processing directory (async):', targetPath);
            const projectRoot = process.cwd();
            const { ig, isProjectDir } = await createIgnoreForPath(targetPath, projectRoot);
            const tree = await readDirectoryTree(targetPath, ig, isProjectDir, projectRoot);
            const baseName = path_1.default.basename(targetPath);
            return {
                absolutePath: targetPath,
                baseName,
                children: tree
            };
        }
        catch (err) {
            console.error('[list-directory] Async error:', err);
            throw err;
        }
    });
    // read-file
    electron_1.ipcMain.handle('read-file', async (_event, filePath) => {
        try {
            console.log('[read-file] Reading file:', filePath);
            const content = await fs_1.default.promises.readFile(filePath, 'utf-8');
            console.log('[read-file] Content length:', content.length);
            return content;
        }
        catch (err) {
            console.error('[read-file] Failed to read file:', filePath, err);
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
                    { name: 'All Files', extensions: ['*'] }
                ]
            };
            const result = await electron_1.dialog.showSaveDialog(saveDialogOptions);
            if (result.canceled || !result.filePath) {
                console.log('[export-xml] Save dialog canceled');
                return false;
            }
            await fs_1.default.promises.writeFile(result.filePath, xmlContent, 'utf-8');
            console.log('[export-xml] Successfully saved XML to:', result.filePath);
            return true;
        }
        catch (err) {
            console.error('[export-xml] Failed to save XML:', err);
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
                    { name: 'All Files', extensions: ['*'] }
                ],
                properties: ['openFile']
            };
            const result = await electron_1.dialog.showOpenDialog(openDialogOptions);
            if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
                console.log('[import-xml] Open dialog canceled');
                return null;
            }
            const filePath = result.filePaths[0];
            const content = await fs_1.default.promises.readFile(filePath, 'utf-8');
            console.log('[import-xml] Successfully read XML from:', filePath);
            return content;
        }
        catch (err) {
            console.error('[import-xml] Failed to import XML:', err);
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
                // doesn't exist, so we can mkdir
                break;
            }
        }
        try {
            await fs_1.default.promises.mkdir(targetPath);
            console.log('[create-folder] Successfully created folder at:', targetPath);
            return targetPath;
        }
        catch (err) {
            console.error('[create-folder] Error creating folder:', err);
            return null;
        }
    });
    // verify-file-existence
    electron_1.ipcMain.handle('verify-file-existence', async (_event, filePath) => {
        try {
            await fs_1.default.promises.stat(filePath);
            return true; // File exists
        }
        catch {
            return false; // File does not exist
        }
    });
    // read-prompt-composer-file
    electron_1.ipcMain.handle('read-prompt-composer-file', async (_event, relativeFilename) => {
        try {
            const projectRoot = process.cwd();
            console.log(`[read-prompt-composer-file] Project root: ${projectRoot}`);
            const promptComposerFolder = path_1.default.join(projectRoot, '.prompt-composer');
            console.log(`[read-prompt-composer-file] Looking in folder: ${promptComposerFolder}`);
            // Check if the .prompt-composer directory exists
            try {
                const folderStats = await fs_1.default.promises.stat(promptComposerFolder);
                if (!folderStats.isDirectory()) {
                    console.error(`[read-prompt-composer-file] .prompt-composer is not a directory at: ${promptComposerFolder}`);
                    return null;
                }
            }
            catch (folderErr) {
                console.error(`[read-prompt-composer-file] .prompt-composer directory not found at: ${promptComposerFolder}`, folderErr);
                return null;
            }
            const targetPath = path_1.default.join(promptComposerFolder, relativeFilename);
            console.log(`[read-prompt-composer-file] Looking for file: ${targetPath}`);
            // Check if file exists
            const stats = await fs_1.default.promises.stat(targetPath);
            if (!stats.isFile()) {
                console.warn(`[read-prompt-composer-file] Not a file: ${targetPath}`);
                return null;
            }
            const content = await fs_1.default.promises.readFile(targetPath, 'utf-8');
            console.log(`[read-prompt-composer-file] Successfully read file: ${relativeFilename} (${content.length} bytes)`);
            return content;
        }
        catch (err) {
            console.warn(`[read-prompt-composer-file] Could not read file: ${relativeFilename}`, err);
            return null;
        }
    });
    /**
     * Step 2 addition: list-all-template-files
     * Gathers .txt/.md files from (a) global ~/.prompt-composer and (b) project .prompt-composer
     * Returns an array of objects { fileName: string, source: 'global' | 'project' }.
     */
    electron_1.ipcMain.handle('list-all-template-files', async () => {
        const result = [];
        const globalDir = path_1.default.join(os_1.default.homedir(), '.prompt-composer');
        const projectDir = path_1.default.join(process.cwd(), '.prompt-composer');
        try {
            const globalFiles = await listPromptComposerFiles(globalDir);
            for (const gf of globalFiles) {
                result.push({ fileName: gf, source: 'global' });
            }
        }
        catch (err) {
            console.warn('[list-all-template-files] Could not list global .prompt-composer files:', err);
        }
        try {
            const projectFiles = await listPromptComposerFiles(projectDir);
            for (const pf of projectFiles) {
                result.push({ fileName: pf, source: 'project' });
            }
        }
        catch (err) {
            console.warn('[list-all-template-files] Could not list project .prompt-composer files:', err);
        }
        return result;
    });
    /**
     * Step 2 addition: read-global-prompt-composer-file
     * Attempts to read a file from ~/.prompt-composer. If not found, returns null.
     */
    electron_1.ipcMain.handle('read-global-prompt-composer-file', async (_event, fileName) => {
        try {
            const globalFolder = path_1.default.join(os_1.default.homedir(), '.prompt-composer');
            const targetPath = path_1.default.join(globalFolder, fileName);
            console.log(`[read-global-prompt-composer-file] Looking for file at: ${targetPath}`);
            const stats = await fs_1.default.promises.stat(targetPath);
            if (!stats.isFile()) {
                console.warn(`[read-global-prompt-composer-file] Not a file: ${targetPath}`);
                return null;
            }
            const content = await fs_1.default.promises.readFile(targetPath, 'utf-8');
            console.log(`[read-global-prompt-composer-file] Successfully read file: ${fileName} (${content.length} bytes)`);
            return content;
        }
        catch (err) {
            console.warn(`[read-global-prompt-composer-file] Could not read file: ${fileName}`, err);
            return null;
        }
    });
}
exports.registerIpcHandlers = registerIpcHandlers;
