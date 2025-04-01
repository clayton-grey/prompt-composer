"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
console.log('[Preload] Preload script initialized. Exposing electronAPI...');
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    /**
     * Send a message to the main process over a generic channel, with arbitrary data
     */
    sendMessage: (channel, data) => {
        electron_1.ipcRenderer.send(channel, data);
    },
    /**
     * Register a callback for messages from the main process
     */
    onMessage: (channel, callback) => {
        electron_1.ipcRenderer.on(channel, callback);
    },
    /**
     * Remove a channel listener
     */
    removeChannelListener: (channel, callback) => {
        electron_1.ipcRenderer.removeListener(channel, callback);
    },
    /**
     * Lists the contents of a directory, returning a DirectoryListing object
     */
    listDirectory: async (dirPath, options) => {
        return electron_1.ipcRenderer.invoke('list-directory', dirPath, options);
    },
    /**
     * Reads the contents of a file from disk (UTF-8)
     */
    readFile: (filePath) => electron_1.ipcRenderer.invoke('read-file', filePath),
    /**
     * Exports XML content to a file
     */
    exportXml: async (args) => {
        return electron_1.ipcRenderer.invoke('export-xml', args);
    },
    /**
     * Opens a dialog to import an XML file
     */
    openXml: async () => {
        return electron_1.ipcRenderer.invoke('import-xml');
    },
    /**
     * Show a system 'Open' dialog with specified options
     */
    showOpenDialog: (options) => electron_1.ipcRenderer.invoke('show-open-dialog', options),
    /**
     * Creates a new folder inside the specified parent path with a given name
     */
    createFolder: (args) => {
        return electron_1.ipcRenderer.invoke('create-folder', args);
    },
    /**
     * Verifies if a file path exists
     */
    verifyFileExistence: (filePath) => {
        return electron_1.ipcRenderer.invoke('verify-file-existence', filePath);
    },
    /**
     * Get the user's home directory (if needed)
     */
    getHomeDirectory: async () => {
        return electron_1.ipcRenderer.invoke('get-home-directory');
    },
    /**
     * Lists all template files from global and project .prompt-composer directories
     */
    listAllTemplateFiles: async (args) => {
        return electron_1.ipcRenderer.invoke('list-all-template-files', args);
    },
    /**
     * Reads a file from the global ~/.prompt-composer directory
     */
    readGlobalPromptComposerFile: async (fileName) => {
        return electron_1.ipcRenderer.invoke('read-global-prompt-composer-file', fileName);
    },
    /**
     * Reads a file from the project's .prompt-composer folder
     */
    readPromptComposerFile: async (relativeFilename) => {
        return electron_1.ipcRenderer.invoke('read-prompt-composer-file', relativeFilename);
    },
    /**
     * Reads a template file from either global or project templates
     * This is a simplified method that handles all the path resolution internally
     */
    readTemplateFile: async (templateName) => {
        return electron_1.ipcRenderer.invoke('read-template-file', templateName);
    },
    /**
     * Writes a file to the project's .prompt-composer folder
     */
    writePromptComposerFile: async (args) => {
        return electron_1.ipcRenderer.invoke('write-prompt-composer-file', args);
    },
    /**
     * Tests filesystem permissions and reports results
     */
    checkPermissions: async () => {
        return electron_1.ipcRenderer.invoke('check-permissions');
    },
    /**
     * Checks filesystem permissions for various directories
     */
    checkFilesystemPermissions: () => {
        return electron_1.ipcRenderer.invoke('check-filesystem-permissions');
    },
    /**
     * Gets possible template paths for debugging
     */
    getTemplatePaths: (templateName) => {
        return electron_1.ipcRenderer.invoke('get-template-paths', templateName);
    }
});
