"use strict";
/**
 * @file preload.ts
 * @description
 * Runs in the Electron main process before the renderer loads.
 * We define window.electronAPI with relevant methods (listDirectory, readFile, exportXml, openXml, etc.).
 */
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
console.log('[Preload] This is the UPDATED preload.ts code! removeChannelListener is defined.');
/**
 * Exposes a set of APIs to the renderer via contextBridge.
 * We add a new "openXml" method for the "import-xml" flow.
 */
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    sendMessage: (channel, data) => {
        electron_1.ipcRenderer.send(channel, data);
    },
    onMessage: (channel, callback) => {
        electron_1.ipcRenderer.on(channel, callback);
    },
    removeChannelListener: (channel, callback) => {
        electron_1.ipcRenderer.removeListener(channel, callback);
    },
    /**
     * Lists the directory contents, ignoring .gitignore
     */
    listDirectory: async (dirPath) => {
        return electron_1.ipcRenderer.invoke('list-directory', dirPath);
    },
    /**
     * Reads a file from disk
     */
    readFile: (filePath) => electron_1.ipcRenderer.invoke('read-file', filePath),
    /**
     * exportXml: Opens a save dialog for .xml, writes xmlContent to disk if confirmed
     */
    exportXml: async (args) => {
        return electron_1.ipcRenderer.invoke('export-xml', args);
    },
    /**
     * openXml: Opens a file dialog for .xml, returns file content or null if canceled
     */
    openXml: async () => {
        return electron_1.ipcRenderer.invoke('import-xml');
    },
    /**
     * showOpenDialog: Opens a dialog to select files/folders
     */
    showOpenDialog: (options) => electron_1.ipcRenderer.invoke('show-open-dialog', options),
    /**
     * createFolder: Creates a new folder in the parent directory
     */
    createFolder: (args) => {
        return electron_1.ipcRenderer.invoke('create-folder', args);
    }
});
