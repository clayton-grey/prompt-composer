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

import { contextBridge, ipcRenderer } from 'electron';

console.log('[Preload] Preload script initialized. Exposing electronAPI...');

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

  listDirectory: async (dirPath: string) => {
    return ipcRenderer.invoke('list-directory', dirPath);
  },

  readFile: (filePath: string) => ipcRenderer.invoke('read-file', filePath),

  exportXml: async (args: { defaultFileName?: string; xmlContent: string }) => {
    return ipcRenderer.invoke('export-xml', args);
  },

  openXml: async () => {
    return ipcRenderer.invoke('import-xml');
  },

  showOpenDialog: (options: any) => ipcRenderer.invoke('show-open-dialog', options),

  createFolder: (args: { parentPath: string; folderName: string }) => {
    return ipcRenderer.invoke('create-folder', args);
  },

  verifyFileExistence: (filePath: string) => {
    return ipcRenderer.invoke('verify-file-existence', filePath);
  },

  getHomeDirectory: async () => {
    return ipcRenderer.invoke('get-home-directory');
  },

  listAllTemplateFiles: async (args: { projectFolders: string[] }) => {
    return ipcRenderer.invoke('list-all-template-files', args);
  },

  readGlobalPromptComposerFile: async (fileName: string) => {
    return ipcRenderer.invoke('read-global-prompt-composer-file', fileName);
  },

  readPromptComposerFile: async (relativeFilename: string) => {
    return ipcRenderer.invoke('read-prompt-composer-file', relativeFilename);
  },

  /**
   * Step 4: New method for writing to a prompt-composer file (PromptResponseBlock editing).
   */
  writePromptComposerFile: async (args: { relativeFilename: string, content: string }) => {
    return ipcRenderer.invoke('write-prompt-composer-file', args);
  }
});
