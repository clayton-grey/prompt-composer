"use strict";
/**
 * @file preload.ts
 * @description
 * This file runs in the Electron main process before the renderer loads.
 * We define window.electronAPI with relevant methods (listDirectory, readFile, etc.).
 */
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
/**
 * If you do not see this log, your app is definitely NOT loading this updated file.
 */
console.log('[Preload] This is the UPDATED preload.ts code! removeChannelListener is defined.');
// Expose the electronAPI object in the renderer
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    /**
     * Example: Send a one-way message to main process
     */
    sendMessage: (channel, data) => {
        electron_1.ipcRenderer.send(channel, data);
    },
    /**
     * Listen for messages on a particular channel from main
     */
    onMessage: (channel, callback) => {
        electron_1.ipcRenderer.on(channel, callback);
    },
    /**
     * Removes the listener for a given channel
     */
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
    // Removed showOpenDialog property as requested
});
