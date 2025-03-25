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
 *
 * @notes
 *  - The preload script is referenced in main.ts via the BrowserWindow
 *    'preload' option.
 *  - Below is a minimal example exposing a placeholder API. Add more as needed
 *    for your file system operations, token estimation, etc.
 */

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Example method for receiving synchronous or asynchronous messages.
   * You can define your own IPC handlers here or in the main process and
   * call them from the renderer.
   */
  sendMessage: (channel: string, data: any) => {
    ipcRenderer.send(channel, data);
  },

  onMessage: (channel: string, func: (...args: any[]) => void) => {
    ipcRenderer.on(channel, (_event, ...args) => func(...args));
  }
});
