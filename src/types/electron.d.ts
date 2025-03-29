/**
 * @file electron.d.ts
 * @description
 * Type definitions for our Electron IPC bridge API. These methods match the ones exposed
 * via the preload script in `preload.ts`.
 *
 * In this update, we import types from the common/types.ts module to unify usage.
 */

import { DirectoryListing } from '../../electron-main/types';

declare global {
  interface Window {
    electronAPI: {
      /**
       * Send a message to the main process over a generic channel
       */
      sendMessage: (channel: string, data?: any) => void;

      /**
       * Register a callback for messages from the main process
       */
      onMessage: (channel: string, callback: (event: any, data: any) => void) => void;

      /**
       * Remove a channel listener
       */
      removeChannelListener: (channel: string, callback: (event: any, data: any) => void) => void;

      /**
       * Show the Open Dialog to select files/folders
       */
      showOpenDialog: (options: any) => Promise<{ canceled: boolean; filePaths: string[] }>;

      /**
       * Lists the contents of a directory, returning a DirectoryListing object
       */
      listDirectory: (dirPath: string) => Promise<DirectoryListing>;

      /**
       * Reads the contents of a file from disk (UTF-8)
       */
      readFile: (filePath: string) => Promise<string>;

      /**
       * Export XML content to a file, returning true if user confirmed, false if canceled or error
       */
      exportXml: (args: { defaultFileName?: string; xmlContent: string }) => Promise<boolean>;

      /**
       * Import XML content from a file, returning the file's XML contents or null on cancel/error
       */
      openXml: () => Promise<string | null>;

      /**
       * Displays a system dialog to create a new folder
       */
      createFolder: (args: { parentPath: string; folderName: string }) => Promise<string | null>;

      /**
       * Verifies if a file path exists
       */
      verifyFileExistence: (filePath: string) => Promise<boolean>;

      /**
       * Reads a file from the project's .prompt-composer folder
       */
      readPromptComposerFile: (relativeFilename: string) => Promise<string | null>;

      /**
       * Writes a file to the project's .prompt-composer folder
       * Returns true on success, or { error: string } on failure
       */
      writePromptComposerFile: (args: {
        relativeFilename: string;
        content: string;
      }) => Promise<boolean | { error: string }>;

      /**
       * Get the user's home directory (may not be used in final code)
       */
      getHomeDirectory: () => Promise<string | null>;

      /**
       * Lists all template files from global and project .prompt-composer directories
       * The argument is an object with { projectFolders: string[] }
       */
      listAllTemplateFiles: (args: {
        projectFolders: string[];
      }) => Promise<Array<{ fileName: string; source: 'global' | 'project' }>>;

      /**
       * Reads a template file from the global ~/.prompt-composer directory
       */
      readGlobalPromptComposerFile: (fileName: string) => Promise<string | null>;
    };
  }
}

export {};
