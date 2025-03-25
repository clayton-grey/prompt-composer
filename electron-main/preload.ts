
/**
 * @file preload.ts
 * @description
 * Runs in the Electron main process before the renderer loads.
 * We define window.electronAPI with relevant methods (listDirectory, readFile, exportXml, etc.).
 */

import { contextBridge, ipcRenderer } from 'electron';

console.log('[Preload] This is the UPDATED preload.ts code! removeChannelListener is defined.');

contextBridge.exposeInMainWorld('electronAPI', {
  sendMessage: (channel: string, data: any) => {
    ipcRenderer.send(channel, data);
  },

  onMessage: (channel: string, callback: (event: any, data: any) => void) => {
    ipcRenderer.on(channel, callback);
  },

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

  /**
   * exportXml: Opens a save dialog for .xml, writes xmlContent to disk if confirmed
   */
  exportXml: async (args: { defaultFileName?: string; xmlContent: string }) => {
    return ipcRenderer.invoke('export-xml', args);
  }
});
