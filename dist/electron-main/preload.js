"use strict";
/**
 * @file preload.ts
 * @description
 * This file is the Electron preload script. It runs before the renderer
 * process is loaded, allowing you to safely expose selective APIs to the
 * renderer via the contextBridge.
 *
 * Key Responsibilities:
 *  - Provide an isolated bridge between Node.js and the browser environment
 *    (renderer). This helps maintain security (contextIsolation).
 *  - Expose specific IPC functions (listDirectory, loadFile, etc.) to the renderer.
 *
 * @notes
 *  - The preload script is referenced in main.ts via the BrowserWindow
 *    'preload' option.
 *  - We add "listDirectory" so the renderer can fetch a nested directory tree.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
// Define the API that will be exposed to the renderer process
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    /**
     * Example method for receiving messages from the main process.
     */
    sendMessage: (channel, data) => {
        electron_1.ipcRenderer.send(channel, data);
    },
    /**
     * Example listener for main process messages.
     */
    onMessage: (channel, func) => {
        electron_1.ipcRenderer.on(channel, (_event, ...args) => func(...args));
    },
    /**
     * Lists the directory contents at the given path, ignoring .gitignore patterns.
     *
     * @param dirPath The path to list. If relative, it's joined with process.cwd()
     * @returns A Promise resolving to an array of directory/file objects
     */
    listDirectory: async (dirPath) => {
        return electron_1.ipcRenderer.invoke('list-directory', dirPath);
    },
    // File system operations
    readDirectory: (path) => electron_1.ipcRenderer.invoke('read-directory', path),
    readFile: (path) => electron_1.ipcRenderer.invoke('read-file', path),
    writeFile: (path, content) => electron_1.ipcRenderer.invoke('write-file', path, content),
    // Path operations
    isAbsolute: (path) => electron_1.ipcRenderer.invoke('is-absolute', path),
    join: (...paths) => electron_1.ipcRenderer.invoke('join-paths', ...paths),
    basename: (path) => electron_1.ipcRenderer.invoke('basename', path),
    dirname: (path) => electron_1.ipcRenderer.invoke('dirname', path),
    // Event listeners
    onFileChange: (callback) => {
        electron_1.ipcRenderer.on('file-change', callback);
    },
    // Remove event listeners
    removeFileChangeListener: (callback) => {
        electron_1.ipcRenderer.removeListener('file-change', callback);
    }
});
//# sourceMappingURL=preload.js.map