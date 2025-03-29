"use strict";
/**
 * @file ipcHandlers.ts
 * @description
 * Consolidated directory reading logic + asynchronous FS operations for Prompt Composer.
 * Now references shared types from electron-main/types.ts to reduce redundancy.
 *
 * Changes:
 *  - Removed local interface TreeNode and ListDirectoryResult
 *  - Imported { DirectoryListing, TreeNode } from ./types
 *  - Renamed references from ListDirectoryResult => DirectoryListing
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
 * createIgnoreForPath
 */
async function createIgnoreForPath(targetPath, projectRoot) {
    let igInstance = (0, ignore_1.default)();
    const isProjectDir = targetPath.startsWith(projectRoot);
    if (isProjectDir) {
        const gitignorePath = path_1.default.join(projectRoot, '.gitignore');
        try {
            const gitignoreContent = await fs_1.default.promises.readFile(gitignorePath, 'utf-8');
            igInstance = igInstance.add(gitignoreContent.split('\n'));
        }
        catch {
            // skip if .gitignore doesn't exist
        }
        const promptignorePath = path_1.default.join(projectRoot, '.prompt-composer', '.promptignore');
        try {
            const promptignoreContent = await fs_1.default.promises.readFile(promptignorePath, 'utf-8');
            igInstance = igInstance.add(promptignoreContent.split('\n'));
        }
        catch {
            // skip if .promptignore doesn't exist
        }
    }
    else {
        // external folder outside project root
        const externalGitignorePath = path_1.default.join(targetPath, '.gitignore');
        try {
            const gitignoreContent = await fs_1.default.promises.readFile(externalGitignorePath, 'utf-8');
            igInstance = igInstance.add(gitignoreContent.split('\n'));
        }
        catch {
            // minimal defaults
            igInstance = igInstance.add(['node_modules', '.git', '.DS_Store', '*.log']);
        }
    }
    return { ig: igInstance, isProjectDir };
}
/**
 * Recursively reads a directory, returning an array of TreeNodes
 */
async function readDirectoryTree(dirPath, ig, isProjectDir, projectRoot) {
    const results = [];
    let entries = [];
    try {
        entries = await fs_1.default.promises.readdir(dirPath);
    }
    catch (err) {
        console.error('[list-directory] Failed to read dir (async):', dirPath, err);
        return results;
    }
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
                children,
            });
        }
        else {
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
/**
 * registerIpcHandlers
 */
function registerIpcHandlers() {
    // list-directory
    electron_1.ipcMain.handle('list-directory', async (_event, dirPath) => {
        try {
            let targetPath = dirPath;
            if (!path_1.default.isAbsolute(dirPath)) {
                targetPath = path_1.default.join(process.cwd(), dirPath);
            }
            const projectRoot = process.cwd();
            const { ig, isProjectDir } = await createIgnoreForPath(targetPath, projectRoot);
            const treeNodes = await readDirectoryTree(targetPath, ig, isProjectDir, projectRoot);
            const baseName = path_1.default.basename(targetPath);
            return {
                absolutePath: targetPath,
                baseName,
                children: treeNodes,
            };
        }
        catch (err) {
            console.error('[list-directory] Async error:', err);
            return {
                absolutePath: dirPath,
                baseName: path_1.default.basename(dirPath),
                children: [],
            };
        }
    });
    // read-file
    electron_1.ipcMain.handle('read-file', async (_event, filePath) => {
        try {
            const content = await fs_1.default.promises.readFile(filePath, 'utf-8');
            return content;
        }
        catch (err) {
            console.error('[read-file] Failed:', filePath, err);
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
                break;
            }
        }
        try {
            await fs_1.default.promises.mkdir(targetPath);
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
            return true;
        }
        catch {
            return false;
        }
    });
    // read-prompt-composer-file
    electron_1.ipcMain.handle('read-prompt-composer-file', async (_event, relativeFilename) => {
        try {
            const projectRoot = process.cwd();
            const promptComposerFolder = path_1.default.join(projectRoot, '.prompt-composer');
            try {
                const folderStats = await fs_1.default.promises.stat(promptComposerFolder);
                if (!folderStats.isDirectory()) {
                    console.error(`[read-prompt-composer-file] .prompt-composer is not a directory: ${promptComposerFolder}`);
                    return null;
                }
            }
            catch (folderErr) {
                console.error(`[read-prompt-composer-file] .prompt-composer not found`, folderErr);
                return null;
            }
            const targetPath = path_1.default.join(promptComposerFolder, relativeFilename);
            const stats = await fs_1.default.promises.stat(targetPath);
            if (!stats.isFile()) {
                console.warn(`[read-prompt-composer-file] Not a file: ${targetPath}`);
                return null;
            }
            const content = await fs_1.default.promises.readFile(targetPath, 'utf-8');
            return content;
        }
        catch (err) {
            console.warn(`[read-prompt-composer-file] Could not read file: ${relativeFilename}`, err);
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
            console.warn('[list-all-template-files] Could not list global .prompt-composer files:', err);
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
                console.warn(`[list-all-template-files] Could not list .prompt-composer in folder: ${folder}`, err);
            }
        }
        return result;
    });
    // read-global-prompt-composer-file
    electron_1.ipcMain.handle('read-global-prompt-composer-file', async (_event, fileName) => {
        try {
            const globalFolder = path_1.default.join(os_1.default.homedir(), '.prompt-composer');
            const targetPath = path_1.default.join(globalFolder, fileName);
            const stats = await fs_1.default.promises.stat(targetPath);
            if (!stats.isFile()) {
                console.warn(`[read-global-prompt-composer-file] Not a file: ${targetPath}`);
                return null;
            }
            const content = await fs_1.default.promises.readFile(targetPath, 'utf-8');
            return content;
        }
        catch (err) {
            console.warn(`[read-global-prompt-composer-file] Could not read file: ${fileName}`, err);
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
            console.error(`[write-prompt-composer-file] Error writing file ${args.relativeFilename}:`, err);
            return { error: `Failed to write file ${args.relativeFilename}: ${err.message || 'Unknown error'}` };
        }
    });
}
exports.registerIpcHandlers = registerIpcHandlers;
