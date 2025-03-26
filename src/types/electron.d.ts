
/**
 * @file electron.d.ts
 * @description
 * Type definitions for the Electron API that is exposed to the renderer process
 * via the preload script. We now add a `readPromptComposerFile` method for loading
 * template files from the `.prompt-composer` folder.
 *
 * Exports:
 * - ElectronAPI interface: Methods available on window.electronAPI
 */

export interface ListDirectoryResult {
  path: string;
  name: string;
  type: 'file' | 'directory';
  children?: ListDirectoryResult[];
}

interface ElectronAPI {
  /**
   * Send a message to the main process
   */
  sendMessage: (channel: string, data?: any) => void;

  /**
   * Register a callback for messages from the main process
   */
  onMessage: (channel: string, callback: (data: any) => void) => void;

  /**
   * Show the Open Dialog to select files/folders
   */
  showOpenDialog: (options: Electron.OpenDialogOptions) => Promise<Electron.OpenDialogReturnValue>;

  /**
   * List the contents of a directory
   */
  listDirectory: (dirPath: string) => Promise<any>;

  /**
   * Read the contents of a file from disk
   */
  readFile: (filePath: string) => Promise<string>;

  /**
   * Remove a listener for a given channel
   */
  removeChannelListener: (channel: string, callback: (event: any, data: any) => void) => void;

  /**
   * Creates a new folder in the specified parent directory
   */
  createFolder: (args: { parentPath: string; folderName: string }) => Promise<string | null>;

  /**
   * Verify if the specified file path exists on the local disk.
   */
  verifyFileExistence: (filePath: string) => Promise<boolean>;

  /**
   * Opens a dialog to export an XML file, returns true if successful
   */
  exportXml: (args: { defaultFileName?: string; xmlContent: string }) => Promise<boolean>;

  /**
   * Opens a dialog to import an XML file, returns the file content or null
   */
  openXml: () => Promise<string | null>;

  /**
   * Reads a file from the `.prompt-composer` folder using the given relative filename.
   * Returns the file content as a string if found, or null if not found.
   */
  readPromptComposerFile: (relativeFilename: string) => Promise<string | null>;
}

// Add electronAPI to Window interface
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
