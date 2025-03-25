"use strict";
/**
 * @file ipcHandlers.ts
 * @description
 * This file registers IPC handlers for interacting with the local file system
 * and other tasks, including "export-xml" for saving the XML file and now
 * "import-xml" for loading it.
 *
 * Key Responsibilities:
 *  - "list-directory": returns { absolutePath, baseName, children } for the given dirPath
 *  - "read-file": returns the content of a file as a string
 *  - "export-xml": opens a save dialog, writes the XML file if confirmed
 *  - "import-xml": opens an open dialog for .xml, reads file content if confirmed, returns it
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
 * Registers all IPC handlers used by the renderer process.
 */
function registerIpcHandlers() {
    // list-directory
    electron_1.ipcMain.handle('list-directory', async (_event, dirPath) => {
        let targetPath = dirPath;
        if (!path_1.default.isAbsolute(dirPath)) {
            targetPath = path_1.default.join(process.cwd(), dirPath);
        }
        const gitignorePath = path_1.default.join(process.cwd(), '.gitignore');
        let ig = (0, ignore_1.default)();
        if (fs_1.default.existsSync(gitignorePath)) {
            const gitignoreContent = fs_1.default.readFileSync(gitignorePath, 'utf-8');
            ig = ig.add(gitignoreContent.split('\n'));
        }
        const tree = readDirectoryRecursive(targetPath, ig);
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
    /**
     * export-xml
     * Input: { defaultFileName: string, xmlContent: string }
     * Output: boolean (true if saved successfully, false if canceled or error)
     */
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
    /**
     * import-xml
     * Opens a file dialog for selecting an XML file, reads its content,
     * and returns the string to the renderer. If canceled, returns null.
     */
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
}
exports.registerIpcHandlers = registerIpcHandlers;
