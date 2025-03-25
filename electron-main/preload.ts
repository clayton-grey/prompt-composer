
/**
 * @file preload.ts
 * @description
 * This file runs in the Electron main process before the renderer loads.
 * We define window.electronAPI with relevant methods (listDirectory, readFile, etc.).
 */

import { contextBridge, ipcRenderer } from 'electron';

/** 
 * If you do not see this log, your app is definitely NOT loading this updated file. 
 */
console.log('[Preload] This is the UPDATED preload.ts code! removeChannelListener is defined.');

// Expose the electronAPI object in the renderer
contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Example: Send a one-way message to main process
   */
  sendMessage: (channel: string, data: any) => {
    ipcRenderer.send(channel, data);
  },

  /**
   * Listen for messages on a particular channel from main
   */
  onMessage: (channel: string, callback: (event: any, data: any) => void) => {
    ipcRenderer.on(channel, callback);
  },

  /**
   * Removes the listener for a given channel
   */
  removeChannelListener: (channel: string, callback: (event: any, data: any) => void) => {
    ipcRenderer.removeListener(channel, callback);
  },

  /**
   * Lists the directory contents, ignoring .gitignore
   */
  listDirectory: async (dirPath: string) => {
    return ipcRenderer.invoke('list-directory', dirPath);
  },

  /**
   * Reads a file from disk
   */
  readFile: (filePath: string) => ipcRenderer.invoke('read-file', filePath),

  // Removed showOpenDialog property as requested
});
