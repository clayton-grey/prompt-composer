/**
 * @file electron.d.ts
 * @description
 * Type definitions for the electron API that is exposed to the renderer process
 * via the preload script.
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
   * Show the Open Dialog to select directories
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
   * @param channel The channel name
   * @param callback The exact same function reference used in onMessage
   */
  removeChannelListener: (channel: string, callback: (event: any, data: any) => void) => void;

  /**
   * Old leftover from prior code:
   * removeFileChangeListener is still here if needed by the user, but not used for open dialog
   */
  removeFileChangeListener: (callback: (event: any, data: any) => void) => void;
  
  /**
   * Creates a new folder in the specified parent directory
   * @param args Object containing parentPath and folderName
   * @returns Promise resolving to the path of the created folder, or null if creation failed
   */
  createFolder: (args: { parentPath: string; folderName: string }) => Promise<string | null>;
}

// Add electronAPI to Window interface
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

// Re-export the global as a module
export {};
