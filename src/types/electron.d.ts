export interface ListDirectoryResult {
  path: string;
  name: string;
  type: 'file' | 'directory';
  children?: ListDirectoryResult[];
}

export interface ElectronAPI {
  listDirectory: (path: string) => Promise<ListDirectoryResult>;
  readFile: (path: string) => Promise<string>;

  /**
   * Send an arbitrary message with data to the main process or other renderer listeners.
   * @param message The channel name
   * @param data The payload
   */
  sendMessage: (message: string, data: any) => void;

  /**
   * Listen for messages on a given channel
   * @param channel The channel name, e.g. 'add-file-block'
   * @param callback The function to call with (event, data)
   */
  onMessage: (channel: string, callback: (event: any, data: any) => void) => void;

  /**
   * Remove a listener for a given channel
   * @param channel The channel name
   * @param callback The exact same function reference used in onMessage
   */
  removeChannelListener: (channel: string, callback: (event: any, data: any) => void) => void;

  /**
   * Opens a dialog to select files or folders
   * @param options Options for the open dialog
   * @returns Promise resolving to the dialog result
   */
  showOpenDialog: (options: any) => Promise<{ canceled: boolean; filePaths: string[] }>;

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

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
