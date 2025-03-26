"use strict";
/**
 * @file ipcHandlers.ts
 * @description
 * Consolidated directory reading logic + Asynchronous FS operations.
 * We also register IPC handlers for reading/writing files, importing/exporting XML,
 * and verifying file existence for XML import validation.
 *
 * Final Cleanup (Step 11):
 * - Removed the export-file-map IPC handler because FileMapViewer is removed.
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
/** Allowed file extensions for text-based files */
const ALLOWED_EXTENSIONS = [
    '.txt', '.md', '.js', '.ts', '.tsx', '.jsx', '.json', '.py', '.css', '.html', '.sql'
];
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
 * Uses asynchronous fs.promises APIs to avoid blocking the main thread.
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
        // Distinguish path to ignore-check
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
            // If we fail to stat, skip
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
    /**
     * Previously, we had an 'export-file-map' IPC handler used by FileMapViewer.
     * That feature is now removed (FileMapViewer was deleted in final cleanup).
     * So we have removed that IPC handler here.
     */
    /**
     * show-open-dialog
     * Opens a dialog for selecting directories.
     */
    electron_1.ipcMain.handle('show-open-dialog', async (_event, options) => {
        return electron_1.dialog.showOpenDialog(options);
    });
    /**
     * create-folder
     * Creates a new folder with a unique name in the given parent directory.
     */
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
                // stat threw => doesn't exist, so we can mkdir
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
    /**
     * verify-file-existence
     * Checks if the given file path exists on the local file system.
     * Returns a boolean. Used for XML import validation.
     */
    electron_1.ipcMain.handle('verify-file-existence', async (_event, filePath) => {
        try {
            await fs_1.default.promises.stat(filePath);
            return true; // File exists
        }
        catch {
            return false; // File does not exist
        }
    });
}
exports.registerIpcHandlers = registerIpcHandlers;
