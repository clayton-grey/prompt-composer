/**
 * @file preload.ts
 * @description
 * Runs in the Electron main process before the renderer loads.
 * We define window.electronAPI with relevant methods (listDirectory, readFile, exportXml, openXml, etc.).
 */

import { contextBridge, ipcRenderer } from 'electron';

console.log('[Preload] This is the UPDATED preload.ts code! removeChannelListener is defined.');

/**
 * Exposes a set of APIs to the renderer via contextBridge.
 * We add a new "openXml" method for the "import-xml" flow.
 */
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
  },

  /**
   * openXml: Opens a file dialog for .xml, returns file content or null if canceled
   */
  openXml: async () => {
    return ipcRenderer.invoke('import-xml');
  },
  
  /**
   * showOpenDialog: Opens a dialog to select files/folders
   */
  showOpenDialog: (options: any) => ipcRenderer.invoke('show-open-dialog', options),
  
  /**
   * createFolder: Creates a new folder in the parent directory
   */
  createFolder: (args: { parentPath: string; folderName: string }) => {
    return ipcRenderer.invoke('create-folder', args);
  }
});
