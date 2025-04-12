/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

/**
 * Type-safe utility functions for accessing Electron IPC API
 * This file provides wrapper functions that handle type checking and error handling
 * for interacting with the electronAPI.
 */

// Define a comprehensive ElectronAPI interface
export interface ElectronAPI {
  // Basic IPC
  sendMessage: (channel: string, data?: any) => void;
  onMessage: (channel: string, callback: (event: any, data: any) => void) => void;
  removeChannelListener: (channel: string, callback: (event: any, data: any) => void) => void;

  // File operations
  showOpenDialog: (options: any) => Promise<{ canceled: boolean; filePaths: string[] }>;
  listDirectory: (
    dirPath: string,
    options?: { shallow?: boolean; addToProjectDirectories?: boolean }
  ) => Promise<any>;
  readFile: (filePath: string) => Promise<string>;
  verifyFileExistence: (filePath: string) => Promise<boolean>;

  // XML handling
  exportXml: (args: { defaultFileName?: string; xmlContent: string }) => Promise<boolean>;
  openXml: () => Promise<string | null>;

  // Folder operations
  createFolder: (args: { parentPath: string; folderName: string }) => Promise<string | null>;

  // Template and prompt-composer file handling
  readPromptComposerFile: (fileName: string, subDirectory?: string) => Promise<string | null>;
  readGlobalPromptComposerFile: (fileName: string, subDirectory?: string) => Promise<string | null>;
  writePromptComposerFile: (args: {
    relativeFilename: string;
    content: string;
  }) => Promise<boolean | { error: string }>;
  listAllTemplateFiles: (args: {
    projectFolders: string[];
  }) => Promise<Array<{ fileName: string; source: 'global' | 'project' }>>;
  readTemplateFile: (templateName: string) => Promise<string | null>;
  getTemplatePaths: (templateName: string) => Promise<string[] | Record<string, any>>;

  // Project management
  removeProjectDirectory: (folderPath: string) => Promise<boolean>;
  getHomeDirectory: () => Promise<string | null>;

  // Debug tools
  isDevToolsOpen: () => Promise<boolean>;
  checkPermissions: () => Promise<any>;
  checkFilesystemPermissions: () => Promise<any>;
}

/**
 * Safely access the electronAPI, returning null if it's not available
 */
export function getElectronAPI(): ElectronAPI | null {
  if (typeof window !== 'undefined' && window.electronAPI) {
    return window.electronAPI as unknown as ElectronAPI;
  }
  return null;
}

/**
 * Safely call an electronAPI method without TypeScript errors
 * @param methodName The name of the method to call
 * @param args Arguments to pass to the method
 * @returns Promise with the result or null if the method doesn't exist
 */
export async function callElectronAPI<T>(
  methodName: keyof ElectronAPI,
  ...args: any[]
): Promise<T | null> {
  const api = getElectronAPI();
  if (!api) return null;

  try {
    // Use a type assertion to bypass TypeScript's checks
    const method = (api as any)[methodName];
    if (typeof method !== 'function') {
      console.warn(`[electronUtils] Method ${methodName} not found on electronAPI`);
      return null;
    }

    return await method(...args);
  } catch (error) {
    console.error(`[electronUtils] Error calling ${methodName}:`, error);
    return null;
  }
}

/**
 * Type-safe helper for showOpenDialog
 */
export async function showOpenDialog(
  options: any
): Promise<{ canceled: boolean; filePaths: string[] } | null> {
  return callElectronAPI<{ canceled: boolean; filePaths: string[] }>('showOpenDialog', options);
}

/**
 * Type-safe helper for listDirectory
 */
export async function listDirectory(
  dirPath: string,
  options?: { shallow?: boolean; addToProjectDirectories?: boolean }
): Promise<any | null> {
  return callElectronAPI('listDirectory', dirPath, options);
}

/**
 * Type-safe helper for readFile
 */
export async function readFile(filePath: string): Promise<string | null> {
  return callElectronAPI<string>('readFile', filePath);
}

/**
 * Type-safe helper for verifyFileExistence
 */
export async function verifyFileExistence(filePath: string): Promise<boolean> {
  const result = await callElectronAPI<boolean>('verifyFileExistence', filePath);
  return result === true;
}

/**
 * Type-safe helper for removeProjectDirectory
 */
export async function removeProjectDirectory(folderPath: string): Promise<boolean> {
  const result = await callElectronAPI<boolean>('removeProjectDirectory', folderPath);
  return result === true;
}

/**
 * Type-safe helper for listAllTemplateFiles
 */
export async function listAllTemplateFiles(args: {
  projectFolders: string[];
}): Promise<Array<{ fileName: string; source: 'global' | 'project' }> | null> {
  return callElectronAPI<Array<{ fileName: string; source: 'global' | 'project' }>>(
    'listAllTemplateFiles',
    args
  );
}

/**
 * Add IPC event listener safely
 */
export function addIpcListener(
  channel: string,
  callback: (event: any, data: any) => void
): boolean {
  const api = getElectronAPI();
  if (!api) return false;

  try {
    (api as any).onMessage(channel, callback);
    return true;
  } catch (e) {
    console.error(`[electronUtils] Error adding listener for ${channel}:`, e);
    return false;
  }
}

/**
 * Remove IPC event listener safely
 */
export function removeIpcListener(
  channel: string,
  callback: (event: any, data: any) => void
): boolean {
  const api = getElectronAPI();
  if (!api) return false;

  try {
    (api as any).removeChannelListener(channel, callback);
    return true;
  } catch (e) {
    console.error(`[electronUtils] Error removing listener for ${channel}:`, e);
    return false;
  }
}

/**
 * Type-safe helper for createFolder
 */
export async function createFolder(args: {
  parentPath: string;
  folderName: string;
}): Promise<string | null> {
  return callElectronAPI<string>('createFolder', args);
}

/**
 * Type-safe helper for readPromptComposerFile
 */
export async function readPromptComposerFile(
  fileName: string,
  subDirectory?: string
): Promise<string | null> {
  return callElectronAPI<string>('readPromptComposerFile', fileName, subDirectory);
}

/**
 * Type-safe helper for readGlobalPromptComposerFile
 */
export async function readGlobalPromptComposerFile(
  fileName: string,
  subDirectory?: string
): Promise<string | null> {
  return callElectronAPI<string>('readGlobalPromptComposerFile', fileName, subDirectory);
}

/**
 * Type-safe helper for writePromptComposerFile
 */
export async function writePromptComposerFile(args: {
  relativeFilename: string;
  content: string;
}): Promise<boolean | { error: string } | null> {
  return callElectronAPI<boolean | { error: string }>('writePromptComposerFile', args);
}

/**
 * Type-safe helper for readTemplateFile
 */
export async function readTemplateFile(templateName: string): Promise<string | null> {
  return callElectronAPI<string>('readTemplateFile', templateName);
}

/**
 * Type-safe helper for getTemplatePaths
 */
export async function getTemplatePaths(
  templateName: string
): Promise<string[] | Record<string, any> | null> {
  return callElectronAPI<string[] | Record<string, any>>('getTemplatePaths', templateName);
}

/**
 * Type-safe helper for isDevToolsOpen
 */
export async function isDevToolsOpen(): Promise<boolean> {
  const result = await callElectronAPI<boolean>('isDevToolsOpen');
  return result === true;
}

/**
 * Check filesystem permissions in various directories
 * @returns Permission results for home, global config, and temp directories
 */
export async function checkPermissions(): Promise<any> {
  return callElectronAPI('checkPermissions');
}

/**
 * Check filesystem permissions specifically for filesystem operations
 * @returns Permission results for filesystem operations
 */
export async function checkFilesystemPermissions(): Promise<any> {
  return callElectronAPI('checkFilesystemPermissions');
}

/**
 * Type-safe helper for sendMessage
 */
export function sendMessage(channel: string, data?: any): void {
  const api = getElectronAPI();
  if (!api) return;

  try {
    (api as any).sendMessage(channel, data);
  } catch (e) {
    console.error(`[electronUtils] Error sending message on channel ${channel}:`, e);
  }
}
