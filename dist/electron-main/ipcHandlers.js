"use strict";
/**
 * @file ipcHandlers.ts
 * @description
 * This file registers IPC handlers for interacting with the local file system.
 * - We parse and respect .gitignore rules
 * - We skip the .git folder
 * - We only return allowed text-based file extensions
 * - We also now return an object that includes the 'absolutePath', 'baseName', and 'children'
 *   so that the React code doesn't need to call any Node.js path methods.
 *
 * IPC Handler: "list-directory"
 *  - Input: dirPath (could be relative or absolute)
 *  - Returns: {
 *      absolutePath: string,
 *      baseName: string,
 *      children: Array<{ name, path, type, children? }>
 *    }
 *
 * IPC Handler: "read-file"
 *  - Input: filePath (absolute path)
 *  - Returns: string (file content)
 *
 * @dependencies
 *  - electron (ipcMain)
 *  - fs, path (Node.js)
 *  - ignore (to parse .gitignore)
 *
 * @notes
 *  - .git folder is explicitly skipped
 *  - .gitignore is loaded from the project root (cwd) in this MVP
 *  - The returned object helps the front-end avoid usage of Node modules (like path)
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
/**
 * Allowed file extensions for text-based files.
 * We can expand this list if needed.
 */
const ALLOWED_EXTENSIONS = [
    '.txt', '.md', '.js', '.ts', '.tsx', '.jsx', '.json', '.py', '.css', '.html'
];
/**
 * Recursively reads the directory contents, filters out ignored paths,
 * and returns a nested JSON structure of directories/files.
 *
 * @param dirPath The absolute path to list
 * @param ig An instance of ignore.Ignore containing .gitignore patterns
 * @return A list of file/directory TreeNode objects (children)
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
    // Sort entries (folders then files, purely alphabetical)
    dirEntries.sort((a, b) => a.localeCompare(b));
    for (const entry of dirEntries) {
        // Explicitly skip .git folder
        if (entry === '.git') {
            continue;
        }
        const fullPath = path_1.default.join(dirPath, entry);
        const relPath = path_1.default.relative(process.cwd(), fullPath);
        // Check if the path matches .gitignore patterns
        if (ig.ignores(relPath)) {
            continue;
        }
        let stats;
        try {
            stats = fs_1.default.statSync(fullPath);
        }
        catch {
            continue; // skip if can't stat
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
 * Registers all IPC handlers needed for file system operations.
 * Currently:
 *   "list-directory": returns { absolutePath, baseName, children } for the given dirPath
 *   "read-file": returns the content of a file as a string
 */
function registerIpcHandlers() {
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
    // The "show-open-dialog" handler is removed per user request (outside the spec).
}
exports.registerIpcHandlers = registerIpcHandlers;
