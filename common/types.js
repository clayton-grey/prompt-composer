"use strict";
/**
 * @file common/types.ts
 * @description
 * Shared type definitions used across the Electron main process (ipcHandlers.ts),
 * ProjectContext, and electron.d.ts. This unifies the `TreeNode` and `DirectoryListing`
 * interfaces to avoid duplication.
 *
 * This common location can be imported by both the Electron main process code
 * and the React renderer code without TypeScript rootDir issues.
 */
Object.defineProperty(exports, "__esModule", { value: true });
