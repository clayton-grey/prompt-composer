/**
 * @file projectActions.ts
 * @description
 * Provides helper functions ("actions") that manipulate the ProjectContext state:
 *  - toggleNodeSelection (tri-state logic)
 *  - refreshFolders
 *  - addProjectFolder
 *  - removeProjectFolder
 *  - readFile
 *  - getDirectoryListing
 *  - setNodeStateRecursive, recalcSubtreeState, collectAllFilePaths, etc.
 *
 * Step 4 (Improve TypeScript Definitions):
 *  - Catch blocks changed to (err: unknown), with instance checks for logging.
 *  - Verified typed signatures for each action function.
 *
 * Edge Cases:
 *  - If the user re-collapses and re-expands a folder, we rely on the in-memory cache
 *    unless refreshFolders is called.
 */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-non-null-asserted-optional-chain */
/* eslint-disable @typescript-eslint/no-unsafe-return */

// @ts-ignore
import { TreeNode, DirectoryListing } from '../../electron-main/types';
import { clearTemplateCaches } from './readTemplateFile';
import { generateAsciiTree } from './asciiTreeGenerator';

export interface ProjectActionsParams {
  directoryCache: Record<string, DirectoryListing>;
  setDirectoryCache: React.Dispatch<React.SetStateAction<Record<string, DirectoryListing>>>;

  nodeStates: Record<string, 'none' | 'all' | 'partial'>;
  setNodeStates: React.Dispatch<React.SetStateAction<Record<string, 'none' | 'all' | 'partial'>>>;

  expandedPaths: Record<string, boolean>;
  setExpandedPaths: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;

  selectedFileContents: Record<string, string>;
  setSelectedFileContents: React.Dispatch<React.SetStateAction<Record<string, string>>>;

  projectFolders: string[];
  setProjectFolders: React.Dispatch<React.SetStateAction<string[]>>;
}

/**
 * getDirectoryListing
 * Retrieves the directory listing from cache if available, otherwise calls electronAPI
 * and stores the result in directoryCache. You can pass an {shallow:true} option if you only
 * want the immediate children (lazy loading).
 */
export async function getDirectoryListing(
  dirPath: string,
  params: ProjectActionsParams,
  options?: { shallow?: boolean; addToProjectDirectories?: boolean }
): Promise<DirectoryListing | null> {
  if (params.directoryCache[dirPath] && !options?.shallow) {
    // Return from cache
    return params.directoryCache[dirPath];
  }

  // @ts-ignore - Suppressing type checking for electronAPI access
  if (!window?.electronAPI?.listDirectory) {
    console.warn('[projectActions] No electronAPI.listDirectory found.');
    return null;
  }

  try {
    // @ts-ignore - Suppressing type checking for electronAPI methods
    const result = await window.electronAPI.listDirectory(dirPath, {
      shallow: options?.shallow ?? false,
      addToProjectDirectories: options?.addToProjectDirectories ?? false,
    });
    params.setDirectoryCache(prev => ({ ...prev, [dirPath]: result }));
    return result;
  } catch (err: unknown) {
    if (err instanceof Error) {
      console.error('[projectActions] Failed to list directory:', dirPath, err.message);
    } else {
      console.error('[projectActions] Failed to list directory:', dirPath, err);
    }
    return null;
  }
}

/**
 * readFile
 * Reads the file content from disk using electronAPI.readFile
 */
export async function readFile(filePath: string): Promise<string> {
  // @ts-ignore - Suppressing type checking for electronAPI access
  if (!window?.electronAPI?.readFile) {
    console.warn('[projectActions] readFile: no electronAPI.readFile found');
    return '';
  }
  try {
    // @ts-ignore - Suppressing type checking for electronAPI methods
    const content = await window.electronAPI.readFile(filePath);
    return content;
  } catch (err: unknown) {
    if (err instanceof Error) {
      console.error('[projectActions] readFile error for', filePath, err.message);
    } else {
      console.error('[projectActions] readFile error for', filePath, err);
    }
    return '';
  }
}

/**
 * setNodeStateRecursive
 * Recursively applies a new node state to a node and all of its descendants.
 */
export function setNodeStateRecursive(
  node: TreeNode,
  newState: 'none' | 'all' | 'partial',
  updated: Record<string, 'none' | 'all' | 'partial'>
): void {
  updated[(node as TreeNode).path] = newState;
  if ((node as TreeNode).type === 'directory' && (node as TreeNode).children) {
    (node as TreeNode).children!.forEach(child => {
      setNodeStateRecursive(child, newState, updated);
    });
  }
}

/**
 * recalcSubtreeState
 * Recomputes the tri-state selection for a directory node based on its children.
 */
export function recalcSubtreeState(
  node: TreeNode,
  updated: Record<string, 'none' | 'all' | 'partial'>
): 'none' | 'all' | 'partial' {
  const currentState = updated[(node as TreeNode).path] || 'none';
  if ((node as TreeNode).type === 'file') {
    return currentState;
  }
  if (!(node as TreeNode).children || (node as TreeNode).children!.length === 0) {
    return currentState;
  }

  let childAllCount = 0;
  let childNoneCount = 0;
  const totalChildren = (node as TreeNode).children!.length;

  for (const child of (node as TreeNode).children!) {
    const childState = recalcSubtreeState(child, updated);
    if (childState === 'all') childAllCount++;
    if (childState === 'none') childNoneCount++;
  }

  if (childAllCount === totalChildren) {
    updated[(node as TreeNode).path] = 'all';
  } else if (childNoneCount === totalChildren) {
    updated[(node as TreeNode).path] = 'none';
  } else {
    updated[(node as TreeNode).path] = 'partial';
  }
  return updated[(node as TreeNode).path];
}

/**
 * recalcAllRootStates
 * Recomputes the tri-state for all root folders in directoryCache.
 */
export function recalcAllRootStates(
  params: ProjectActionsParams,
  updated: Record<string, 'none' | 'all' | 'partial'>
): void {
  for (const key in params.directoryCache) {
    const listing = params.directoryCache[key];
    if (!listing) continue;
    const rootNode: TreeNode = {
      name: (listing as DirectoryListing).baseName,
      path: (listing as DirectoryListing).absolutePath,
      type: 'directory',
      children: (listing as DirectoryListing).children,
    };
    recalcSubtreeState(rootNode, updated);
  }
}

/**
 * collectAllFilePaths
 * Recursively collects the file paths in a node's subtree that have tri-state = 'all'.
 */
export function collectAllFilePaths(
  node: TreeNode,
  updatedStates: Record<string, 'none' | 'all' | 'partial'>,
  results: string[]
): void {
  // Get the state for this node
  const st = updatedStates[(node as TreeNode).path] || 'none';

  // If it's a file and its state is 'all', add it to results
  if ((node as TreeNode).type === 'file' && st === 'all') {
    results.push((node as TreeNode).path);
  }

  // If it's a directory, recursively check all its children
  if ((node as TreeNode).type === 'directory' && (node as TreeNode).children) {
    (node as TreeNode).children!.forEach(child => {
      collectAllFilePaths(child, updatedStates, results);
    });
  }
}

/**
 * toggleNodeSelection
 * Implements the tri-state toggling for a node (file or directory).
 * If it's 'none' or 'partial', set to 'all'; if it's 'all', set to 'none'.
 */
export async function toggleNodeSelection(
  node: TreeNode,
  params: ProjectActionsParams
): Promise<void> {
  params.setNodeStates(prev => {
    const updated = { ...prev };
    const current = updated[node.path] || 'none';
    const newState = current === 'all' ? 'none' : 'all';

    // Make sure we set the state for this node and ALL its children recursively
    setNodeStateRecursive(node, newState, updated);
    recalcAllRootStates(params, updated);

    // Queue file reading updates
    queueMicrotask(() => {
      (async () => {
        // Collect all file paths with state 'all'
        const allFilePaths: string[] = [];
        for (const key in params.directoryCache) {
          const listing = params.directoryCache[key];
          if (!listing) continue;
          const rootNode: TreeNode = {
            name: (listing as DirectoryListing).baseName,
            path: (listing as DirectoryListing).absolutePath,
            type: 'directory',
            children: (listing as DirectoryListing).children,
          };
          collectAllFilePaths(rootNode, updated, allFilePaths);
        }

        const oldFileContents = params.selectedFileContents;
        const newFileContents = { ...oldFileContents };

        // Remove unselected - ensure all files that are not in allFilePaths are removed
        // This ensures consistent selection state for all visible files
        for (const pathKey of Object.keys(newFileContents)) {
          if (!allFilePaths.includes(pathKey)) {
            delete newFileContents[pathKey];
          }
        }

        // Add newly selected files
        for (const fileP of allFilePaths) {
          if (!(fileP in newFileContents)) {
            const content = await readFile(fileP);
            newFileContents[fileP] = content;
          }
        }

        params.setSelectedFileContents(newFileContents);
      })();
    });

    return updated;
  });
}

/**
 * toggleExpansion
 * Toggles a directory's expanded/collapsed state in expandedPaths.
 * If expanding, and we do not yet have children for that folder (or have an empty array),
 * we fetch them shallowly from the main process.
 */
export function toggleExpansion(nodePath: string, params: ProjectActionsParams): void {
  const currentlyExpanded = params.expandedPaths[nodePath] || false;
  const newVal = !currentlyExpanded;

  if (newVal) {
    const listing = params.directoryCache[nodePath];
    const noChildrenKnown = !listing || (listing as DirectoryListing).children.length === 0;

    if (noChildrenKnown) {
      queueMicrotask(() => {
        (async () => {
          await getDirectoryListing(nodePath, params, { shallow: true });
        })();
      });
    }
  }

  params.setExpandedPaths(prev => ({
    ...prev,
    [nodePath]: newVal,
  }));
}

/**
 * collapseSubtree
 * Recursively collapses the subtree under a directory.
 */
export function collapseSubtree(node: TreeNode, params: ProjectActionsParams): void {
  if ((node as TreeNode).type !== 'directory') return;
  const stack: TreeNode[] = [node];
  const newExpanded = { ...params.expandedPaths };

  while (stack.length > 0) {
    const curr = stack.pop()!;
    newExpanded[(curr as TreeNode).path] = false;
    if ((curr as TreeNode).children) {
      (curr as TreeNode).children!.forEach(c => {
        if ((c as TreeNode).type === 'directory') stack.push(c);
      });
    }
  }
  params.setExpandedPaths(newExpanded);
}

/**
 * refreshFolders
 * Reloads each folder path in directoryCache. Then merges or removes selected files accordingly.
 */
export async function refreshFolders(
  folderPaths: string[],
  params: ProjectActionsParams
): Promise<void> {
  // Clear template caches to ensure fresh data
  clearTemplateCaches();

  // Store the old node states before refresh
  const oldNodeStates = { ...params.nodeStates };

  // Keep track of all paths that existed before refresh
  const oldFilePaths: string[] = [];
  for (const key in params.directoryCache) {
    const listing = params.directoryCache[key];
    if (!listing) continue;
    const rootNode: TreeNode = {
      name: listing.baseName,
      path: listing.absolutePath,
      type: 'directory',
      children: listing.children,
    };
    collectAllFilePaths(rootNode, oldNodeStates, oldFilePaths);
  }

  console.log(`[projectActions] Found ${oldFilePaths.length} selected files before refresh`);

  // Refresh directories
  for (const fPath of folderPaths) {
    // @ts-ignore - Suppressing type checking for electronAPI access
    if (!window.electronAPI?.listDirectory) {
      console.warn('[projectActions] refreshFolders: electronAPI.listDirectory is unavailable');
      continue;
    }
    try {
      // @ts-ignore - Suppressing type checking for electronAPI methods
      const freshListing = await window.electronAPI.listDirectory(fPath, {
        shallow: false,
        addToProjectDirectories: true,
      });
      if (freshListing) {
        // Update the cache immediately to ensure updated file tree
        params.setDirectoryCache(prev => ({
          ...prev,
          [fPath]: freshListing,
        }));
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        console.error(`[projectActions] Failed to refresh folder: ${fPath}`, err.message);
      } else {
        console.error(`[projectActions] Failed to refresh folder: ${fPath}`, err);
      }
    }
  }

  // Create an updated node states object
  const updatedNodeStates = { ...params.nodeStates };

  // Apply selection states to any new files/directories found after refresh
  for (const fPath of folderPaths) {
    const listing = params.directoryCache[fPath];
    if (!listing) continue;

    const rootNode: TreeNode = {
      name: listing.baseName,
      path: listing.absolutePath,
      type: 'directory',
      children: listing.children,
    };

    // First check if this root directory was fully selected
    if (oldNodeStates[rootNode.path] === 'all') {
      // Make sure all children inherit the selection state
      setNodeStateRecursive(rootNode, 'all', updatedNodeStates);
    } else {
      // Otherwise let's process each item individually
      updateSelectionStatesForNewNodes(rootNode, oldNodeStates, updatedNodeStates);
      // Recalculate the states for this root folder
      recalcSubtreeState(rootNode, updatedNodeStates);
    }
  }

  // Update the node states in React state
  params.setNodeStates(updatedNodeStates);

  // Now collect all selected file paths based on updated node states
  const allFilePaths: string[] = [];
  for (const key in params.directoryCache) {
    const listing = params.directoryCache[key];
    if (!listing) continue;
    const rootNode: TreeNode = {
      name: listing.baseName,
      path: listing.absolutePath,
      type: 'directory',
      children: listing.children,
    };
    // This will collect paths of all selected files
    collectAllFilePaths(rootNode, updatedNodeStates, allFilePaths);
  }

  console.log(`[projectActions] Collected ${allFilePaths.length} file paths after refresh`);

  // Find files that were selected before but no longer exist after refresh
  const deletedFiles = oldFilePaths.filter(
    path => !allFilePaths.includes(path) && path in params.selectedFileContents
  );

  if (deletedFiles.length > 0) {
    console.log(`[projectActions] Detected ${deletedFiles.length} files that have been deleted:`);
    deletedFiles.forEach(path => console.log(`  - ${path}`));
  }

  const oldFileContents = params.selectedFileContents;
  const newFileContents: Record<string, string> = {};

  // Remove files that are no longer selected or no longer exist
  for (const path in oldFileContents) {
    if (allFilePaths.includes(path)) {
      newFileContents[path] = oldFileContents[path];
    } else {
      console.log(
        `[projectActions] Removing ${path} from content map (no longer selected or exists)`
      );
    }
  }

  // Add newly selected files
  const readPromises: Promise<void>[] = [];
  for (const fileP of allFilePaths) {
    if (!(fileP in newFileContents)) {
      const readPromise = readFile(fileP).then(content => {
        newFileContents[fileP] = content;
        console.log(`[projectActions] Added new file to content map: ${fileP}`);
      });
      readPromises.push(readPromise);
    }
  }

  // Wait for all file reads to complete
  await Promise.all(readPromises);

  // Update the selected file contents
  params.setSelectedFileContents(newFileContents);

  // Log summary
  console.log(
    `[projectActions] Refresh complete: ${Object.keys(newFileContents).length} files in content map`
  );
}

/**
 * Helper function to get parent path (browser-compatible replacement for path.dirname)
 */
function getParentPath(filePath: string): string {
  // Handle both Unix and Windows paths
  const lastSlashIndex = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  if (lastSlashIndex === -1) {
    return '';
  }
  return filePath.substring(0, lastSlashIndex);
}

/**
 * Helper function to update selection states for new nodes after refresh
 * Ensures new files/directories inherit the selection state from their parent directory
 */
function updateSelectionStatesForNewNodes(
  node: TreeNode,
  oldNodeStates: Record<string, 'none' | 'all' | 'partial'>,
  updatedNodeStates: Record<string, 'none' | 'all' | 'partial'>
): void {
  const nodePath = node.path;

  // If this is a directory that was already in the tree
  if (oldNodeStates[nodePath] === 'all') {
    // If this directory was previously fully selected, ensure all children are selected too
    setNodeStateRecursive(node, 'all', updatedNodeStates);
    return; // No need to process children individually
  } else if (oldNodeStates[nodePath] === 'partial') {
    // For partially selected directories, we need to check each child
    updatedNodeStates[nodePath] = 'partial';
  } else if (oldNodeStates[nodePath] === 'none') {
    // If this directory was not selected, ensure it's still not selected
    updatedNodeStates[nodePath] = 'none';
  } else {
    // This is a new node, check parent directory
    const parentPath = getParentPath(nodePath);
    if (oldNodeStates[parentPath] === 'all') {
      // If parent was fully selected, inherit that state
      updatedNodeStates[nodePath] = 'all';
    } else {
      // Default to 'none' for new nodes if parent wasn't fully selected
      updatedNodeStates[nodePath] = 'none';
    }
  }

  // Recursively process children (only needed for directories)
  if (node.type === 'directory' && node.children) {
    for (const child of node.children) {
      updateSelectionStatesForNewNodes(child, oldNodeStates, updatedNodeStates);
    }
  }
}

/**
 * addProjectFolder
 * Adds a new folderPath to the projectFolders array if not already present,
 * then refreshes its listing (fully), expands it, and sets it to 'all' tri-state selection by default.
 */
export async function addProjectFolder(
  folderPath: string,
  params: ProjectActionsParams
): Promise<void> {
  params.setProjectFolders(prev => {
    if (!prev.includes(folderPath)) {
      clearTemplateCaches();
      return [...prev, folderPath];
    }
    return prev;
  });

  await refreshFolders([folderPath], params);

  let listing = params.directoryCache[folderPath];
  if (!listing) {
    const result = await getDirectoryListing(folderPath, params, {
      shallow: false,
      addToProjectDirectories: true,
    });
    if (result) {
      listing = result;
    }
  }
  if (!listing) {
    console.warn('[projectActions] addProjectFolder: listing not found after refresh', folderPath);
    return;
  }

  params.setExpandedPaths(prev => ({
    ...prev,
    [listing.absolutePath]: true,
  }));

  params.setNodeStates(prev => {
    const updated = { ...prev };
    const rootNode: TreeNode = {
      name: listing.baseName,
      path: listing.absolutePath,
      type: 'directory',
      children: listing.children,
    };
    setNodeStateRecursive(rootNode, 'all', updated);
    recalcAllRootStates(params, updated);

    queueMicrotask(() => {
      (async () => {
        const allFilePaths: string[] = [];
        collectAllFilePaths(rootNode, updated, allFilePaths);

        const oldFileContents = params.selectedFileContents;
        const newFileContents = { ...oldFileContents };

        for (const p of Object.keys(newFileContents)) {
          if (!allFilePaths.includes(p)) {
            delete newFileContents[p];
          }
        }

        for (const fileP of allFilePaths) {
          if (!(fileP in newFileContents)) {
            const content = await readFile(fileP);
            newFileContents[fileP] = content;
          }
        }

        params.setSelectedFileContents(newFileContents);
      })();
    });

    return updated;
  });
}

/**
 * removeProjectFolder
 * Removes a folder from the projectFolders list. We do not remove from nodeStates or directoryCache
 * unless further cleanup is explicitly needed by the UI logic.
 */
/**
 * removeProjectFolder
 * Removes a folder from the project, **and** purges anything
 * (cache, node states, file contents, expansions) that lives underneath it.
 */
export async function removeProjectFolder(
  folderPath: string,
  params: ProjectActionsParams
): Promise<void> {
  /* 1 ────────────────────────────────────────────────────────────
     Drop from the list that drives the UI
  ─────────────────────────────────────────────────────────────── */
  params.setProjectFolders(prev => prev.filter(p => p !== folderPath));

  /* 2 ────────────────────────────────────────────────────────────
     Nuke every cache/state entry whose path starts with folderPath
  ─────────────────────────────────────────────────────────────── */
  params.setDirectoryCache(prev => {
    const updated: typeof prev = {};
    for (const [path, listing] of Object.entries(prev)) {
      if (!path.startsWith(folderPath)) updated[path] = listing;
    }
    return updated;
  });

  params.setExpandedPaths(prev => {
    const updated: typeof prev = {};
    for (const [path, val] of Object.entries(prev)) {
      if (!path.startsWith(folderPath)) updated[path] = val;
    }
    return updated;
  });

  params.setNodeStates(prev => {
    const updated: typeof prev = {};
    for (const [path, val] of Object.entries(prev)) {
      if (!path.startsWith(folderPath)) updated[path] = val;
    }
    return updated;
  });

  params.setSelectedFileContents(prev => {
    const updated: typeof prev = {};
    for (const [path, content] of Object.entries(prev)) {
      if (!path.startsWith(folderPath)) updated[path] = content;
    }
    return updated;
  });

  /* 3 ────────────────────────────────────────────────────────────
     Tell the main process (optional helper)
  ─────────────────────────────────────────────────────────────── */
  // @ts-ignore – electron preload typing
  if (window?.electronAPI?.removeProjectDirectory) {
    try {
      // @ts-ignore
      await window.electronAPI.removeProjectDirectory(folderPath);
    } catch (err) {
      console.warn('[projectActions] Failed to inform main process:', err);
    }
  }
}

/**
 * Helper function to debug the current file paths
 */
function debugSelectedFiles(params: ProjectActionsParams, message: string): void {
  try {
    // Get current file paths
    const allFilePaths: string[] = [];
    for (const key in params.directoryCache) {
      const listing = params.directoryCache[key];
      if (!listing) continue;
      const rootNode: TreeNode = {
        name: listing.baseName,
        path: listing.absolutePath,
        type: 'directory',
        children: listing.children,
      };
      collectAllFilePaths(rootNode, params.nodeStates, allFilePaths);
    }

    // Check which files are in the content map
    const contentMapKeys = Object.keys(params.selectedFileContents);
    console.log(`[projectActions] ${message}:`);
    console.log(`- Selected paths: ${allFilePaths.length}`);
    console.log(`- Content map entries: ${contentMapKeys.length}`);

    // Find any discrepancies
    const missingFromContents = allFilePaths.filter(path => !contentMapKeys.includes(path));
    const unexpectedInContents = contentMapKeys.filter(path => !allFilePaths.includes(path));

    if (missingFromContents.length > 0) {
      console.log(`- Missing from content map: ${missingFromContents.length} files`);
      missingFromContents.slice(0, 3).forEach(path => console.log(`  - ${path}`));
    }

    if (unexpectedInContents.length > 0) {
      console.log(`- Unexpected in content map: ${unexpectedInContents.length} files`);
    }
  } catch (err) {
    console.error('[projectActions] Error in debugSelectedFiles:', err);
  }
}

/**
 * Force synchronize the file contents with the currently selected files
 * This is a more direct approach to ensure the file map is up-to-date
 */
export async function syncSelectedFileContents(
  params: ProjectActionsParams
): Promise<Array<{ path: string; content: string; language: string }>> {
  // ❶ single declaration – visible to entire function
  const newFileContents: Record<string, string> = {};

  try {
    console.log('[projectActions] Beginning synchronization of selected file contents');

    /* ------------------------------------------------------------
       1. Gather the list of file paths that are currently selected
    ------------------------------------------------------------ */
    const allFilePaths: string[] = [];
    for (const key in params.directoryCache) {
      const listing = params.directoryCache[key];
      if (!listing) continue;
      const rootNode: TreeNode = {
        name: listing.baseName,
        path: listing.absolutePath,
        type: 'directory',
        children: listing.children,
      };
      collectAllFilePaths(rootNode, params.nodeStates, allFilePaths);
    }
    console.log(`[projectActions] Found ${allFilePaths.length} files with 'all' selection state`);

    /* ------------------------------------------------------------
       2. Read every file fresh from disk (batched)
    ------------------------------------------------------------ */
    const missingFilePaths: string[] = [];
    const batchSize = 5;
    let successfulReads = 0;

    for (let i = 0; i < allFilePaths.length; i += batchSize) {
      const batch = allFilePaths.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async path => {
          try {
            // Optional existence check
            // @ts-ignore
            if (window.electronAPI?.verifyFileExistence) {
              // @ts-ignore
              const exists = await window.electronAPI.verifyFileExistence(path);
              if (!exists) {
                console.log(`[projectActions] File no longer exists: ${path}`);
                missingFilePaths.push(path);
                return;
              }
            }

            const content = await readFile(path);
            if (content) {
              newFileContents[path] = content;
              successfulReads++;
            } else {
              console.warn(`[projectActions] Empty content for file: ${path}`);
              missingFilePaths.push(path);
            }
          } catch (err) {
            console.error(`[projectActions] Error reading file ${path}:`, err);
            missingFilePaths.push(path);
          }
        })
      );
    }

    /* ------------------------------------------------------------
       3. Update nodeStates if some files vanished
    ------------------------------------------------------------ */
    if (missingFilePaths.length > 0) {
      console.log(
        `[projectActions] Removing ${missingFilePaths.length} missing files from selection state`
      );
      const updatedNodeStates = { ...params.nodeStates };
      for (const path of missingFilePaths) {
        updatedNodeStates[path] = 'none';
      }
      // Re-compute directory tri-states
      for (const key in params.directoryCache) {
        const listing = params.directoryCache[key];
        if (!listing) continue;
        recalcSubtreeState(
          {
            name: listing.baseName,
            path: listing.absolutePath,
            type: 'directory',
            children: listing.children,
          },
          updatedNodeStates
        );
      }
      params.setNodeStates(updatedNodeStates);
    }

    /* ------------------------------------------------------------
       4. Commit the fresh content map  +  build/return freshEntries
    ------------------------------------------------------------ */
    params.setSelectedFileContents(newFileContents);

    const freshEntries: Array<{ path: string; content: string; language: string }> = (
      Object.entries(newFileContents) as [string, string][]
    ).map(([path, content]) => ({
      path,
      content,
      language: getLanguageFromPath(path),
    }));

    console.log(
      `[projectActions] Finished synchronization. ${successfulReads} files read; ${freshEntries.length} in final map`
    );
    return freshEntries;
  } catch (err) {
    console.error('[projectActions] Error syncing selected file contents:', err);
    // ensure the function still returns the promised type on failure
    return [];
  }
}

/**
 * Simplified version of generateFileBlockOutput that works with just the exported context functions
 */
export async function generateFileBlockOutputSimple(
  projectFolders: string[],
  getSelectedFileEntries: () => Array<{ path: string; content: string; language: string }>,
  refreshFoldersFunc: (folderPaths: string[]) => Promise<void>
): Promise<string> {
  // We no longer refresh here since we're now refreshing just before calling this function
  // This avoids duplicate refresh operations and race conditions

  let finalOutput = '';

  // For each project folder, generate the ASCII tree
  for (const folder of projectFolders) {
    const ascii = await generateAsciiTree([folder]);
    if (ascii) {
      finalOutput += ascii.trim() + '\n\n';
    }
  }

  // Get the selected file entries using the provided function
  // IMPORTANT: We get the entries directly here to ensure we have the most recent state
  const selectedEntries = getSelectedFileEntries();
  console.log(
    `[projectActions] Processing ${selectedEntries.length} selected file entries for output`
  );

  // Make sure we actually have files to include
  if (selectedEntries.length === 0) {
    console.warn('[projectActions] No files selected for output');
    return '';
  }

  // Sort entries to ensure consistent ordering
  selectedEntries.sort((a, b) => a.path.localeCompare(b.path));

  // ADDITIONAL SAFETY CHECK: Verify files exist and have content before proceeding
  const verifiedEntries = selectedEntries.filter(entry => {
    if (!entry.path || !entry.content) {
      console.warn(
        `[projectActions] Skipping entry with missing path or content: ${entry.path || 'unknown path'}`
      );
      return false;
    }
    // Check if content looks valid (not just whitespace)
    if (entry.content.trim() === '') {
      console.warn(`[projectActions] Skipping entry with empty content: ${entry.path}`);
      return false;
    }
    return true;
  });

  if (verifiedEntries.length !== selectedEntries.length) {
    console.warn(
      `[projectActions] Filtered out ${selectedEntries.length - verifiedEntries.length} invalid entries`
    );
  }

  if (verifiedEntries.length === 0) {
    console.warn('[projectActions] No valid entries after verification');
    return '';
  }

  // Gather all files from selected entries
  for (const entry of verifiedEntries) {
    console.log(`[projectActions] Adding file to output: ${entry.path}`);
    finalOutput += `<file_contents>\nFile: ${entry.path}\n\`\`\`${entry.language}\n${entry.content}\n\`\`\`\n</file_contents>\n\n`;
  }

  // Log the final output size
  console.log(
    `[projectActions] Generated file block output with ${verifiedEntries.length} files, size: ${finalOutput.length} chars`
  );

  return finalOutput.trim();
}

/**
 * Get language identifier from file path for code block formatting
 */
function getLanguageFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  // Map extensions to language identifiers
  const languageMap: Record<string, string> = {
    js: 'javascript',
    ts: 'typescript',
    jsx: 'jsx',
    tsx: 'tsx',
    py: 'python',
    java: 'java',
    c: 'c',
    cpp: 'cpp',
    cs: 'csharp',
    go: 'go',
    rb: 'ruby',
    php: 'php',
    html: 'html',
    css: 'css',
    json: 'json',
    md: 'markdown',
    sh: 'bash',
    bash: 'bash',
    sql: 'sql',
    yaml: 'yaml',
    yml: 'yaml',
    xml: 'xml',
  };

  return languageMap[ext] || ext || 'text';
}

/**
 * Helper function for debugging file extension issues
 * Only logs in development mode
 */
export function debugFileExtensions(node: TreeNode, message: string): void {
  if (process.env.NODE_ENV !== 'development') return;

  // Create extension sets to track what's in the node structure
  const fileExtensions = new Set<string>();
  const fileQueue: TreeNode[] = [];
  const allFilePaths: string[] = [];

  // If this is a directory, add all its children to the queue
  if (node.type === 'directory' && node.children) {
    fileQueue.push(...node.children);
  } else if (node.type === 'file') {
    // Just one file to check
    fileQueue.push(node);
  }

  // Process the queue to collect file extensions
  while (fileQueue.length > 0) {
    const current = fileQueue.shift()!;

    if (current.type === 'file') {
      allFilePaths.push(current.path);
      const ext = current.path.split('.').pop()?.toLowerCase() || '';
      if (ext) fileExtensions.add(`.${ext}`);
    } else if (current.type === 'directory' && current.children) {
      fileQueue.push(...current.children);
    }
  }

  console.log(
    `[Debug] ${message} - Extensions found:`,
    Array.from(fileExtensions).sort().join(', ')
  );
  console.log(`[Debug] Path: ${node.path}`);
  console.log(`[Debug] Total files: ${allFilePaths.length}`);

  // Explicitly check for .meta files
  const metaFiles = allFilePaths.filter(p => p.endsWith('.meta'));
  if (metaFiles.length > 0) {
    console.log(`[Debug] .meta files found: ${metaFiles.length}`);
    // Show some sample paths (max 3)
    metaFiles.slice(0, 3).forEach(p => console.log(`  - ${p}`));
  } else {
    console.log(`[Debug] NO .meta files found in the tree structure`);

    // Try to diagnosis why meta files aren't showing up
    if (node.type === 'directory') {
      console.log(`[Debug] Directory children count: ${node.children?.length || 0}`);

      // Check if children have the right extension patterns
      if (node.children && node.children.length > 0) {
        const fileNames = node.children.filter(c => c.type === 'file').map(c => c.name);

        console.log(`[Debug] Sample file names in directory:`, fileNames.slice(0, 5));

        // Check if any file names contain .meta
        const potentialMetaFiles = fileNames.filter(name => name.includes('.meta'));
        if (potentialMetaFiles.length > 0) {
          console.log(
            `[Debug] Found files with .meta in name but not recognized as .meta extension:`,
            potentialMetaFiles.slice(0, 5)
          );
        }
      }
    }
  }
}

/**
 * Function to directly inspect a directory to check for missing file types like .meta
 * This bypasses the tree structure and goes directly to the filesystem
 */
export async function inspectDirectoryForFileTypes(
  dirPath: string,
  extension: string
): Promise<void> {
  if (process.env.NODE_ENV !== 'development') return;

  console.log(`[DirectoryInspection] Checking ${dirPath} for files with extension ${extension}`);

  try {
    // @ts-ignore - Suppressing type checking for electronAPI access
    if (!window?.electronAPI?.listDirectory) {
      console.warn(
        '[projectActions] inspectDirectoryForFileTypes: No electronAPI.listDirectory found.'
      );
      return;
    }

    // Request a fresh listing from the electron process, forcing a non-filtered read
    // @ts-ignore - Suppressing type checking for electronAPI methods
    const result = await window.electronAPI.listDirectory(dirPath, {
      shallow: false,
      addToProjectDirectories: false,
      forceAllExtensions: true, // Request unfiltered listing if supported
    });

    if (!result) {
      console.log(`[DirectoryInspection] No directory listing returned for ${dirPath}`);
      return;
    }

    const foundFiles: string[] = [];
    const queue: TreeNode[] = [...(result.children || [])];

    // Breadth-first search for files with the specified extension
    while (queue.length > 0) {
      const node = queue.shift();
      if (!node) continue;

      if (node.type === 'file' && node.path.endsWith(extension)) {
        foundFiles.push(node.path);
      } else if (node.type === 'directory' && node.children) {
        queue.push(...node.children);
      }
    }

    console.log(
      `[DirectoryInspection] Found ${foundFiles.length} ${extension} files in ${dirPath}`
    );
    foundFiles.slice(0, 5).forEach(f => console.log(`  - ${f}`));

    // Let's also check the raw tree structure from the API
    console.log(`[DirectoryInspection] Raw directory structure from listDirectory API:`);
    console.log(`  Total root children: ${result.children?.length || 0}`);

    const rootExtensions = new Set<string>();
    result.children?.forEach((child: TreeNode) => {
      if (child.type === 'file') {
        const ext = child.path.split('.').pop()?.toLowerCase() || '';
        if (ext) rootExtensions.add(`.${ext}`);
      }
    });

    console.log(`  Extensions in root level: ${Array.from(rootExtensions).sort().join(', ')}`);
  } catch (err) {
    console.error(`[DirectoryInspection] Error inspecting directory:`, err);
  }
}
