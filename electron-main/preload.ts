/**
 * @file preload.ts
 * @description
 * Runs in the Electron preload script context. We define window.electronAPI with relevant
 * methods for the renderer, including reading/writing .prompt-composer files.
 *
 * Step 4 (Improve TypeScript Definitions):
 *  - Replaced any usage of `any` with more explicit typed or 'unknown'.
 *  - This clarifies that data can be arbitrary, but we track it as 'unknown'.
 */

import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

console.log('[Preload] Preload script initialized. Exposing electronAPI...');

type UnknownCallback = (event: IpcRendererEvent, data: unknown) => void;

contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Send a message to the main process over a generic channel, with arbitrary data
   */
  sendMessage: (channel: string, data: unknown) => {
    ipcRenderer.send(channel, data);
  },

  /**
   * Register a callback for messages from the main process
   */
  onMessage: (channel: string, callback: UnknownCallback) => {
    ipcRenderer.on(channel, callback);
  },

  /**
   * Remove a channel listener
   */
  removeChannelListener: (channel: string, callback: UnknownCallback) => {
    ipcRenderer.removeListener(channel, callback);
  },

  /**
   * Lists the contents of a directory, returning a DirectoryListing object
   */
  listDirectory: async (dirPath: string, options?: { shallow?: boolean; addToProjectDirectories?: boolean }) => {
    return ipcRenderer.invoke('list-directory', dirPath, options);
  },

  /**
   * Reads the contents of a file from disk (UTF-8)
   */
  readFile: (filePath: string) => ipcRenderer.invoke('read-file', filePath),

  /**
   * Exports XML content to a file
   */
  exportXml: async (args: { defaultFileName?: string; xmlContent: string }) => {
    return ipcRenderer.invoke('export-xml', args);
  },

  /**
   * Opens a dialog to import an XML file
   */
  openXml: async () => {
    return ipcRenderer.invoke('import-xml');
  },

  /**
   * Show a system 'Open' dialog with specified options
   */
  showOpenDialog: (options: any) => ipcRenderer.invoke('show-open-dialog', options),

  /**
   * Creates a new folder inside the specified parent path with a given name
   */
  createFolder: (args: { parentPath: string; folderName: string }) => {
    return ipcRenderer.invoke('create-folder', args);
  },

  /**
   * Verifies if a file path exists
   */
  verifyFileExistence: (filePath: string) => {
    return ipcRenderer.invoke('verify-file-existence', filePath);
  },

  /**
   * Get the user's home directory (if needed)
   */
  getHomeDirectory: async () => {
    return ipcRenderer.invoke('get-home-directory');
  },

  /**
   * Removes a directory from the projectDirectories list in the main process
   */
  removeProjectDirectory: (folderPath: string) => {
    return ipcRenderer.invoke('remove-project-directory', folderPath);
  },

  /**
   * Lists all template files from global and project .prompt-composer directories
   */
  listAllTemplateFiles: async (args: { projectFolders: string[] }) => {
    return ipcRenderer.invoke('list-all-template-files', args);
  },

  /**
   * Reads a file from the global ~/.prompt-composer directory
   */
  readGlobalPromptComposerFile: async (fileName: string) => {
    return ipcRenderer.invoke('read-global-prompt-composer-file', fileName);
  },

  /**
   * Reads a file from the project's .prompt-composer folder
   */
  readPromptComposerFile: async (relativeFilename: string) => {
    return ipcRenderer.invoke('read-prompt-composer-file', relativeFilename);
  },

  /**
   * Reads a template file from either global or project templates
   * This is a simplified method that handles all the path resolution internally
   */
  readTemplateFile: async (templateName: string) => {
    return ipcRenderer.invoke('read-template-file', templateName);
  },

  /**
   * Writes a file to the project's .prompt-composer folder
   */
  writePromptComposerFile: async (args: { 
    relativeFilename: string; 
    content: string; 
    originalPath?: string 
  }) => {
    return ipcRenderer.invoke('write-prompt-composer-file', args);
  },

  /**
   * Tests filesystem permissions and reports results
   */
  checkPermissions: async () => {
    return ipcRenderer.invoke('check-permissions');
  },

  /**
   * Checks filesystem permissions for various directories
   */
  checkFilesystemPermissions: () => {
    return ipcRenderer.invoke('check-filesystem-permissions');
  },

  /**
   * Gets possible template paths for debugging
   */
  getTemplatePaths: (templateName: string) => {
    return ipcRenderer.invoke('get-template-paths', templateName);
  },
  isDevToolsOpen: () => { return ipcRenderer.invoke("is-dev-tools-open"); }
});
      