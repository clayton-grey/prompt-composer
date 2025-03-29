/**
 * @file electron-main/types.ts
 * @description
 * Shared type definitions used across the Electron main process (ipcHandlers.ts),
 * ProjectContext, and electron.d.ts. This unifies the `TreeNode` and `DirectoryListing`
 * interfaces to avoid duplication.
 */

export interface TreeNode {
  /**
   * Display name of the file or directory
   */
  name: string;

  /**
   * Full absolute path to the file or directory
   */
  path: string;

  /**
   * Whether this node is a file or directory
   */
  type: 'file' | 'directory';

  /**
   * If a directory, potentially holds a list of children TreeNodes
   */
  children?: TreeNode[];
}

/**
 * DirectoryListing
 * Represents the result of listing a single folder (i.e. for 'list-directory').
 * Contains a root path (absolutePath), a baseName, and an array of TreeNodes.
 */
export interface DirectoryListing {
  /**
   * Full absolute path to the directory
   */
  absolutePath: string;
  
  /**
   * The name of the directory (without path)
   */
  baseName: string;
  
  /**
   * Array of TreeNode children in this directory
   */
  children: TreeNode[];
} 