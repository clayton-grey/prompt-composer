"use strict";
/**
 * @file ipcHandlers.ts
 * @description
 * This file registers IPC handlers for interacting with the local file system
 * and other tasks, including "export-xml" for saving the XML file,
 * "import-xml" for loading it, "list-directory" for reading directories,
 * "read-file" for reading file contents, "export-file-map" for saving a file map ASCII text file,
 * and now "create-folder" to create a new folder in the given parentPath.
 *
 * Key Responsibilities:
 *  - "list-directory": returns { absolutePath, baseName, children } for the given dirPath
 *  - "read-file": returns the content of a file as a string
 *  - "export-xml": opens a save dialog, writes the XML file if confirmed
 *  - "import-xml": opens a file dialog for .xml
 *  - "export-file-map": opens a save dialog, writes ASCII tree to a .txt if confirmed
 *  - "create-folder": creates a new folder in parentPath, ensuring no name collisions by appending "(1)", "(2)", etc.
 *
 * Dependencies:
 *  - electron (ipcMain, dialog)
 *  - fs, path (Node.js)
 *  - ignore (to parse .gitignore)
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerIpcHandlers = void 0;
const electron_1 = require("electron");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const ignore_1 = __importDefault(require("ignore"));
// Allowed file extensions for text-based files
const ALLOWED_EXTENSIONS = [
    '.txt', '.md', '.js', '.ts', '.tsx', '.jsx', '.json', '.py', '.css', '.html'
];
/**
 * Recursively reads directory contents, filters out ignored paths,
 * returns a nested JSON structure of directories/files.
 */
function readDirectoryRecursive(dirPath, ig) {
    let results = [];
    let dirEntries;
    try {
        dirEntries = fs_1.default.readdirSync(dirPath);
    }
    catch (err) {
        console.error('[list-directory] Failed to read dir:', dirPath, err);
        return results;
    }
    // Sort entries
    dirEntries.sort((a, b) => a.localeCompare(b));
    for (const entry of dirEntries) {
        // Skip .git folder
        if (entry === '.git') {
            continue;
        }
        else if (entry === '.DS_Store') {
            continue;
        }
        const fullPath = path_1.default.join(dirPath, entry);
        const relPath = path_1.default.relative(process.cwd(), fullPath);
        if (ig.ignores(relPath)) {
            continue;
        }
        let stats;
        try {
            stats = fs_1.default.statSync(fullPath);
        }
        catch {
            continue;
        }
        if (stats.isDirectory()) {
            results.push({
                name: entry,
                path: fullPath,
                type: 'directory',
                children: readDirectoryRecursive(fullPath, ig)
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
/**
 * Creates a new folder in the given parentPath. If a folder with the given name already
 * exists, we append "(1)", "(2)", etc., until we find a unique folder name.
 *
 * @param parentPath - The directory in which to create the folder
 * @param folderName - The desired name, e.g., "New Folder"
 * @returns The final folder path that was created, or null if creation failed
 */
function createFolder(parentPath, folderName) {
    let baseName = folderName;
    let suffix = 1;
    let targetPath = path_1.default.join(parentPath, baseName);
    while (fs_1.default.existsSync(targetPath)) {
        suffix += 1;
        baseName = `${folderName} (${suffix})`;
        targetPath = path_1.default.join(parentPath, baseName);
    }
    try {
        fs_1.default.mkdirSync(targetPath);
        console.log('[create-folder] Successfully created folder at:', targetPath);
        return targetPath;
    }
    catch (err) {
        console.error('[create-folder] Error creating folder:', err);
        return null;
    }
}
/**
 * Registers all IPC handlers used by the renderer process.
 */
function registerIpcHandlers() {
    // list-directory
    electron_1.ipcMain.handle('list-directory', async (_event, dirPath) => {
        let targetPath = dirPath;
        if (!path_1.default.isAbsolute(dirPath)) {
            targetPath = path_1.default.join(process.cwd(), dirPath);
        }
        console.log('[list-directory] Processing directory:', targetPath);
        // Create ignore instance specific to the targetPath
        let ig = (0, ignore_1.default)();
        // For the main project directory, use .gitignore
        if (targetPath.startsWith(process.cwd())) {
            const gitignorePath = path_1.default.join(process.cwd(), '.gitignore');
            if (fs_1.default.existsSync(gitignorePath)) {
                console.log('[list-directory] Using .gitignore from project root');
                const gitignoreContent = fs_1.default.readFileSync(gitignorePath, 'utf-8');
                ig = ig.add(gitignoreContent.split('\n'));
            }
        }
        else {
            // For external directories, check if they have their own .gitignore
            const externalGitignorePath = path_1.default.join(targetPath, '.gitignore');
            if (fs_1.default.existsSync(externalGitignorePath)) {
                console.log('[list-directory] Using .gitignore from external directory');
                const gitignoreContent = fs_1.default.readFileSync(externalGitignorePath, 'utf-8');
                ig = ig.add(gitignoreContent.split('\n'));
            }
            else {
                // Default ignore patterns for external directories
                console.log('[list-directory] Using default ignore patterns for external directory');
                ig = ig.add([
                    'node_modules',
                    '.git',
                    '.DS_Store',
                    '*.log'
                ]);
            }
        }
        // For external directories, we need to modify how we check if a path is ignored
        const isProjectDir = targetPath.startsWith(process.cwd());
        // Customized directory reading function for the specific target
        function readDirectoryForTarget(dirToRead, ignoreObj) {
            let results = [];
            let dirEntries;
            try {
                dirEntries = fs_1.default.readdirSync(dirToRead);
            }
            catch (err) {
                console.error('[list-directory] Failed to read dir:', dirToRead, err);
                return results;
            }
            // Sort entries
            dirEntries.sort((a, b) => a.localeCompare(b));
            for (const entry of dirEntries) {
                // Skip .git folder and .DS_Store files
                if (entry === '.git' || entry === '.DS_Store') {
                    continue;
                }
                const fullPath = path_1.default.join(dirToRead, entry);
                // Handle ignores differently for project vs external directories
                let shouldIgnore = false;
                if (isProjectDir) {
                    // For project directory, use relative path from project root
                    const relPath = path_1.default.relative(process.cwd(), fullPath);
                    shouldIgnore = ignoreObj.ignores(relPath);
                }
                else {
                    // For external directories, use relative path from the target directory
                    const relPath = path_1.default.relative(targetPath, fullPath);
                    shouldIgnore = ignoreObj.ignores(relPath);
                }
                if (shouldIgnore) {
                    continue;
                }
                let stats;
                try {
                    stats = fs_1.default.statSync(fullPath);
                }
                catch {
                    continue;
                }
                if (stats.isDirectory()) {
                    results.push({
                        name: entry,
                        path: fullPath,
                        type: 'directory',
                        children: readDirectoryForTarget(fullPath, ignoreObj)
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
        const tree = readDirectoryForTarget(targetPath, ig);
        const baseName = path_1.default.basename(targetPath);
        return {
            absolutePath: targetPath,
            baseName,
            children: tree
        };
    });
    // read-file
    electron_1.ipcMain.handle('read-file', async (_event, filePath) => {
        try {
            console.log('[read-file] Reading file:', filePath);
            const content = fs_1.default.readFileSync(filePath, 'utf-8');
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
            fs_1.default.writeFileSync(result.filePath, xmlContent, 'utf-8');
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
            const content = fs_1.default.readFileSync(filePath, 'utf-8');
            console.log('[import-xml] Successfully read XML from:', filePath);
            return content;
        }
        catch (err) {
            console.error('[import-xml] Failed to import XML:', err);
            return null;
        }
    });
    /**
     * export-file-map
     * Opens a save dialog for saving an ASCII file map.
     * Input: { defaultFileName: string, fileMapContent: string }
     * Returns: boolean (true if saved, false if canceled)
     */
    electron_1.ipcMain.handle('export-file-map', async (_event, { defaultFileName, fileMapContent }) => {
        try {
            const saveDialogOptions = {
                title: 'Export File Map',
                defaultPath: defaultFileName || 'file_map.txt',
                filters: [
                    { name: 'Text Files', extensions: ['txt'] },
                    { name: 'All Files', extensions: ['*'] }
                ]
            };
            const result = await electron_1.dialog.showSaveDialog(saveDialogOptions);
            if (result.canceled || !result.filePath) {
                console.log('[export-file-map] Save dialog canceled');
                return false;
            }
            fs_1.default.writeFileSync(result.filePath, fileMapContent, 'utf-8');
            console.log('[export-file-map] Successfully saved file map to:', result.filePath);
            return true;
        }
        catch (err) {
            console.error('[export-file-map] Failed to save file map:', err);
            return false;
        }
    });
    /**
     * show-open-dialog
     * Opens a dialog for selecting directories
     * Input: options object for dialog.showOpenDialog
     * Returns: { canceled: boolean, filePaths: string[] } - The result from the dialog
     */
    electron_1.ipcMain.handle('show-open-dialog', async (_event, options) => {
        return electron_1.dialog.showOpenDialog(options);
    });
    /**
     * create-folder
     * Creates a new folder with a unique name in the given parent directory.
     * Input: { parentPath: string, folderName: string }
     * Returns: string | null (path to created folder, or null if creation failed)
     */
    electron_1.ipcMain.handle('create-folder', async (_event, { parentPath, folderName }) => {
        return createFolder(parentPath, folderName);
    });
}
exports.registerIpcHandlers = registerIpcHandlers;
