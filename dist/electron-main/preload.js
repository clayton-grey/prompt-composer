"use strict";
/**
 * @file preload.ts
 * @description
 * Runs in the Electron preload script context. We define window.electronAPI with relevant
 * methods for the renderer, including reading/writing .prompt-composer files.
 *
 * Update (Step 4: PromptResponseBlock):
 *  - Expose a new "writePromptComposerFile(relativeFilename, content)" method for saving
 *    the prompt response text to a dedicated file in .prompt-composer.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
console.log('[Preload] Preload script initialized. Exposing electronAPI...');
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
    listDirectory: async (dirPath) => {
        return electron_1.ipcRenderer.invoke('list-directory', dirPath);
    },
    readFile: (filePath) => electron_1.ipcRenderer.invoke('read-file', filePath),
    exportXml: async (args) => {
        return electron_1.ipcRenderer.invoke('export-xml', args);
    },
    openXml: async () => {
        return electron_1.ipcRenderer.invoke('import-xml');
    },
    showOpenDialog: (options) => electron_1.ipcRenderer.invoke('show-open-dialog', options),
    createFolder: (args) => {
        return electron_1.ipcRenderer.invoke('create-folder', args);
    },
    verifyFileExistence: (filePath) => {
        return electron_1.ipcRenderer.invoke('verify-file-existence', filePath);
    },
    getHomeDirectory: async () => {
        return electron_1.ipcRenderer.invoke('get-home-directory');
    },
    listAllTemplateFiles: async (args) => {
        return electron_1.ipcRenderer.invoke('list-all-template-files', args);
    },
    readGlobalPromptComposerFile: async (fileName) => {
        return electron_1.ipcRenderer.invoke('read-global-prompt-composer-file', fileName);
    },
    readPromptComposerFile: async (relativeFilename) => {
        return electron_1.ipcRenderer.invoke('read-prompt-composer-file', relativeFilename);
    },
    /**
     * Step 4: New method for writing to a prompt-composer file (PromptResponseBlock editing).
     */
    writePromptComposerFile: async (relativeFilename, content) => {
        return electron_1.ipcRenderer.invoke('write-prompt-composer-file', { relativeFilename, content });
    }
});
