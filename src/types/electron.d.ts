/**
 * @file electron.d.ts
 * @description
 * Type definitions for our Electron IPC bridge API. These methods match the ones exposed
 * via the preload script. We now add a `readPromptComposerFile` method for loading
 * template files from the .prompt-composer folder.
 */

/**
 * Augment the global Window interface to include our electron API
 */
interface Window {
  electronAPI: {
    /**
     * Send a message to the main process
     */
    sendMessage: (channel: string, data?: any) => void;

    /**
     * Register a callback for messages from the main process
     */
    onMessage: (channel: string, callback: (data: any) => void) => void;

    /**
     * Remove a channel listener
     */
    removeChannelListener: (channel: string, callback: (event: any, data: any) => void) => void;

    /**
     * Show the Open Dialog to select files/folders
     */
    showOpenDialog: (
      options: Electron.OpenDialogOptions
    ) => Promise<Electron.OpenDialogReturnValue>;

    /**
     * List the contents of a directory
     */
    listDirectory: (dirPath: string) => Promise<any>;

    /**
     * Read the contents of a file from disk
     */
    readFile: (filePath: string) => Promise<string>;

    /**
     * Export XML content to a file
     */
    exportXml: (args: { defaultFileName?: string; xmlContent: string }) => Promise<boolean>;

    /**
     * Import XML content from a file
     */
    openXml: () => Promise<string | null>;

    /**
     * Create a new folder
     */
    createFolder: (args: { parentPath: string; folderName: string }) => Promise<string | null>;

    /**
     * Verify if a file exists
     */
    verifyFileExistence: (filePath: string) => Promise<boolean>;

    /**
     * Read a file from the .prompt-composer folder
     */
    readPromptComposerFile: (relativeFilename: string) => Promise<string | null>;

    /**
     * Get the user's home directory
     */
    getHomeDirectory: () => Promise<string | null>;

    /**
     * List all template files from global and project .prompt-composer directories
     */
    listAllTemplateFiles: () => Promise<Array<{ fileName: string; source: 'global' | 'project' }>>;

    /**
     * Read a template file from the global ~/.prompt-composer directory
     */
    readGlobalPromptComposerFile: (fileName: string) => Promise<string | null>;
  };
}

export interface ListDirectoryResult {
  path: string;
  name: string;
  type: 'file' | 'directory';
  children?: ListDirectoryResult[];
}
