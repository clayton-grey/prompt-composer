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

import { contextBridge, ipcRenderer } from 'electron';

// Define the API that will be exposed to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Example method for receiving messages from the main process.
   */
  sendMessage: (channel: string, data: any) => {
    ipcRenderer.send(channel, data);
  },

  /**
   * Example listener for main process messages.
   */
  onMessage: (channel: string, func: (...args: any[]) => void) => {
    ipcRenderer.on(channel, (_event, ...args) => func(...args));
  },

  /**
   * Lists the directory contents at the given path, ignoring .gitignore patterns.
   *
   * @param dirPath The path to list. If relative, it's joined with process.cwd()
   * @returns A Promise resolving to an array of directory/file objects
   */
  listDirectory: async (dirPath: string) => {
    return ipcRenderer.invoke('list-directory', dirPath);
  },

  // File system operations
  readDirectory: (path: string) => ipcRenderer.invoke('read-directory', path),
  readFile: (path: string) => ipcRenderer.invoke('read-file', path),
  writeFile: (path: string, content: string) => ipcRenderer.invoke('write-file', path, content),
  
  // Path operations
  isAbsolute: (path: string) => ipcRenderer.invoke('is-absolute', path),
  join: (...paths: string[]) => ipcRenderer.invoke('join-paths', ...paths),
  basename: (path: string) => ipcRenderer.invoke('basename', path),
  dirname: (path: string) => ipcRenderer.invoke('dirname', path),
  
  // Event listeners
  onFileChange: (callback: (event: any, data: any) => void) => {
    ipcRenderer.on('file-change', callback);
  },
  
  // Remove event listeners
  removeFileChangeListener: (callback: (event: any, data: any) => void) => {
    ipcRenderer.removeListener('file-change', callback);
  }
});
