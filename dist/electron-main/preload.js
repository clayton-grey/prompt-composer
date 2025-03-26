"use strict";
/**
 * @file preload.ts
 * @description
 * Runs in the Electron preload script context. We define window.electronAPI with relevant
 * methods. We have now added `readPromptComposerFile` to support reading templates from
 * the `.prompt-composer` folder in the user’s project.
 *
 * Note: Because this is the 'preload' script, it must not rely on Node integration. Instead,
 * we communicate with the main process via IPC calls (`ipcRenderer.invoke`, etc.).
 */
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
console.log('[Preload] Preload script initialized. Exposing electronAPI...');
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    /**
     * Basic message sending
     */
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
    },
    /**
     * Verify file existence on disk
     */
    verifyFileExistence: (filePath) => {
        return electron_1.ipcRenderer.invoke('verify-file-existence', filePath);
    },
    /**
     * Reads a file from the .prompt-composer folder.
     * If the file does not exist, returns null.
     */
    readPromptComposerFile: async (relativeFilename) => {
        return electron_1.ipcRenderer.invoke('read-prompt-composer-file', relativeFilename);
    }
});
