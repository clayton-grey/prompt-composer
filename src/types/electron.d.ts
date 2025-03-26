
/**
 * @file electron.d.ts
 * @description
 * Type definitions for the electron API that is exposed to the renderer process
 * via the preload script. We update this file to include verifyFileExistence 
 * for XML import validation.
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
   * Read the contents of a file
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
}

// Add electronAPI to Window interface
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

// Re-export the global as a module
export {};
