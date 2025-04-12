/**
 * @file global.d.ts
 * @description
 * Global type declarations for the Prompt Composer application.
 * Contains interface declarations for window.electronAPI.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

interface DirectoryPermission {
  dir: string;
  canRead: boolean;
  canWrite: boolean;
}

interface PermissionsResult {
  home?: DirectoryPermission;
  globalPromptComposer?: DirectoryPermission;
  projectPromptComposer?: DirectoryPermission;
  temp?: DirectoryPermission;
  error?: string;
}

interface ElectronAPI {
  // File system operations
  listDirectory: (
    path: string,
    options?: {
      shallow?: boolean;
      addToProjectDirectories?: boolean;
      forceAllExtensions?: boolean;
    }
  ) => Promise<any>;
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
  createFolder: (path: string) => Promise<void>;
  deleteFile: (path: string) => Promise<void>;
  readGlobalPromptComposerFile: (fileName: string, subDirectory?: string) => Promise<string | null>;
  readPromptComposerFile: (fileName: string, subDirectory?: string) => Promise<string | null>;
  readTemplateFile: (templateName: string) => Promise<string | null>;
  resolveTemplatePath: (path: string) => Promise<string>;

  // Template operations
  listAllTemplateFiles: () => Promise<string[]>;
  writePromptComposerFile: (path: string, content: string) => Promise<void>;
  writeGlobalPromptComposerFile: (path: string, content: string) => Promise<void>;

  // Dialog operations
  showOpenDialog: (options: any) => Promise<{ canceled: boolean; filePaths: string[] }>;
  exportXml: (path: string, content: string) => Promise<void>;
  exportJson: (path: string, content: string) => Promise<void>;

  // Utility operations
  getHomeDirectory: () => Promise<string>;
  checkPermissions: () => Promise<any>;
  checkFilesystemPermissions: () => Promise<PermissionsResult>;
  getTemplatePaths: (templateName: string) => Promise<string[]>;
  removeProjectDirectory: (folderPath: string) => Promise<boolean>;

  // IPC operations
  sendMessage: (channel: string, message: any) => void;
  onMessage: (channel: string, callback: (message: any) => void) => void;
}

// Extend the Window interface
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

// This export makes this file a module
export {};
