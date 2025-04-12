'use strict';
/**
 * @file shared.ts
 * @description
 * Shared type definitions used across the Electron main process (ipcHandlers.ts),
 * ProjectContext, and electron.d.ts. This unifies the `TreeNode` and `DirectoryListing`
 * interfaces to avoid duplication.
 *
 * Usage:
 *  - Import { TreeNode, DirectoryListing } in the main process code or React contexts
 *  - Also used in electron.d.ts for the global interface definition of listDirectory, etc.
 *
 * Example:
 *  import { TreeNode, DirectoryListing } from '@/types/shared';
 */

// Re-export these types from electron-main/types
export type { TreeNode, DirectoryListing } from '../../electron-main/types';
