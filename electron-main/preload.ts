/**
 * @file preload.ts
 * @description
 * Runs in the Electron preload script context. We define window.electronAPI with relevant
 * methods. We now add:
 *  - listAllTemplateFiles()
 *  - readGlobalPromptComposerFile()
 *
 * These allow the renderer to retrieve a combined listing of .prompt-composer files from
 * both global (~/.prompt-composer) and project-based (cwd/.prompt-composer), and to read
 * global template files specifically.
 */

import { contextBridge, ipcRenderer } from 'electron';

console.log('[Preload] Preload script initialized. Exposing electronAPI...');

contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Basic message sending
   */
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
  },

  /**
   * Verify file existence on disk
   */
  verifyFileExistence: (filePath: string) => {
    return ipcRenderer.invoke('verify-file-existence', filePath);
  },

  /**
   * Get the user's home directory
   */
  getHomeDirectory: async () => {
    return ipcRenderer.invoke('get-home-directory');
  },

  /**
   * List all template files from global and project .prompt-composer directories
   */
  listAllTemplateFiles: async () => {
    return ipcRenderer.invoke('list-all-template-files');
  },

  /**
   * Read a template file from the global ~/.prompt-composer directory
   */
  readGlobalPromptComposerFile: async (fileName: string) => {
    return ipcRenderer.invoke('read-global-prompt-composer-file', fileName);
  },

  /**
   * Reads a file from the .prompt-composer folder. 
   * If the file does not exist, returns null.
   */
  readPromptComposerFile: async (relativeFilename: string) => {
    return ipcRenderer.invoke('read-prompt-composer-file', relativeFilename);
  }
});
