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
 * Step 9 Changes (lazy loading):
 *  - Added an optional 'shallow' parameter to getDirectoryListing() calls.
 *  - In toggleExpansion, if the directory is being expanded and we have no cached children,
 *    we call getDirectoryListing(folderPath, { shallow:true }).
 *  - This prevents loading entire deep subtrees until the user actually expands them.
 *
 * Edge Cases:
 *  - If the user re-collapses and re-expands, we check if the directory is in cache.
 *    If it is, we do not re-fetch unless the user calls refreshFolders.
 */

import { TreeNode, DirectoryListing } from '../context/ProjectContext';

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
  options?: { shallow?: boolean }
): Promise<DirectoryListing | null> {
  // If we already have a cache entry for this path and shallow isn't forced again,
  // return the existing listing.
  // If the caller wants a deeper read, or wants to refresh, they should call refreshFolders.
  if (params.directoryCache[dirPath] && !options?.shallow) {
    return params.directoryCache[dirPath];
  }

  if (!window?.electronAPI?.listDirectory) {
    console.warn('[projectActions] No electronAPI.listDirectory found.');
    return null;
  }

  try {
    const result = await window.electronAPI.listDirectory(dirPath, {
      shallow: options?.shallow ?? false,
    });
    params.setDirectoryCache(prev => ({ ...prev, [dirPath]: result }));
    return result;
  } catch (err) {
    console.error('[projectActions] Failed to list directory:', dirPath, err);
    return null;
  }
}

/**
 * readFile
 * Reads the file content from disk using electronAPI.readFile
 */
export async function readFile(filePath: string): Promise<string> {
  if (!window?.electronAPI?.readFile) {
    console.warn('[projectActions] readFile: no electronAPI.readFile found');
    return '';
  }
  try {
    const content = await window.electronAPI.readFile(filePath);
    return content;
  } catch (err) {
    console.error('[projectActions] readFile error for', filePath, err);
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
) {
  updated[node.path] = newState;
  if (node.type === 'directory' && node.children) {
    node.children.forEach(child => {
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
  const currentState = updated[node.path] || 'none';
  if (node.type === 'file') {
    return currentState;
  }
  if (!node.children || node.children.length === 0) {
    return currentState;
  }

  let childAllCount = 0;
  let childNoneCount = 0;
  const totalChildren = node.children.length;

  for (const child of node.children) {
    const childState = recalcSubtreeState(child, updated);
    if (childState === 'all') childAllCount++;
    if (childState === 'none') childNoneCount++;
  }

  if (childAllCount === totalChildren) {
    updated[node.path] = 'all';
  } else if (childNoneCount === totalChildren) {
    updated[node.path] = 'none';
  } else {
    updated[node.path] = 'partial';
  }
  return updated[node.path];
}

/**
 * recalcAllRootStates
 * Recomputes the tri-state for all root folders in directoryCache.
 */
export function recalcAllRootStates(
  params: ProjectActionsParams,
  updated: Record<string, 'none' | 'all' | 'partial'>
) {
  for (const key in params.directoryCache) {
    const listing = params.directoryCache[key];
    if (!listing) continue;
    const rootNode: TreeNode = {
      name: listing.baseName,
      path: listing.absolutePath,
      type: 'directory',
      children: listing.children,
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
) {
  const st = updatedStates[node.path] || 'none';
  if (node.type === 'file' && st === 'all') {
    results.push(node.path);
  }
  if (node.type === 'directory' && node.children) {
    node.children.forEach(child => {
      collectAllFilePaths(child, updatedStates, results);
    });
  }
}

/**
 * toggleNodeSelection
 * Implements the tri-state toggling for a node (file or directory).
 * If it's 'none' or 'partial', set to 'all'; if it's 'all', set to 'none'.
 */
export async function toggleNodeSelection(node: TreeNode, params: ProjectActionsParams) {
  params.setNodeStates(prev => {
    const updated = { ...prev };
    const current = updated[node.path] || 'none';
    const newState = current === 'all' ? 'none' : 'all';

    setNodeStateRecursive(node, newState, updated);
    recalcAllRootStates(params, updated);

    // queue file reading updates in microtask
    queueMicrotask(() => {
      (async () => {
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
          collectAllFilePaths(rootNode, updated, allFilePaths);
        }

        const oldFileContents = params.selectedFileContents;
        const newFileContents = { ...oldFileContents };

        // remove unselected
        for (const pathKey of Object.keys(newFileContents)) {
          if (!allFilePaths.includes(pathKey)) {
            delete newFileContents[pathKey];
          }
        }

        // add newly selected
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
export function toggleExpansion(nodePath: string, params: ProjectActionsParams) {
  const currentlyExpanded = params.expandedPaths[nodePath] || false;
  const newVal = !currentlyExpanded;

  // If we're about to expand a directory that is uncached or has no children, do a lazy fetch
  if (newVal) {
    const listing = params.directoryCache[nodePath];
    const noChildrenKnown = !listing || listing.children.length === 0;

    if (noChildrenKnown) {
      // fetch shallow children on expansion
      queueMicrotask(() => {
        (async () => {
          const freshListing = await getDirectoryListing(nodePath, params, { shallow: true });
          if (freshListing) {
            // We might want to forcibly set expandedPaths[nodePath] = true
            // But we rely on the next setExpandedPaths call below to handle it
            // in the standard way so it doesn't get out of sync.
          }
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
export function collapseSubtree(node: TreeNode, params: ProjectActionsParams) {
  if (node.type !== 'directory') return;
  const stack: TreeNode[] = [node];
  const newExpanded = { ...params.expandedPaths };

  while (stack.length > 0) {
    const curr = stack.pop()!;
    newExpanded[curr.path] = false;
    if (curr.children) {
      curr.children.forEach(c => {
        if (c.type === 'directory') stack.push(c);
      });
    }
  }
  params.setExpandedPaths(newExpanded);
}

/**
 * refreshFolders
 * Reloads each folder path in directoryCache. Then merges or removes selected files accordingly.
 */
export async function refreshFolders(folderPaths: string[], params: ProjectActionsParams) {
  for (const fPath of folderPaths) {
    if (!window.electronAPI?.listDirectory) {
      console.warn('[projectActions] refreshFolders: electronAPI.listDirectory is unavailable');
      continue;
    }
    try {
      // We do a full read (non-shallow) to refresh the entire sub-tree
      const freshListing = await window.electronAPI.listDirectory(fPath, { shallow: false });
      if (freshListing) {
        params.setDirectoryCache(prev => ({
          ...prev,
          [fPath]: freshListing,
        }));
      }
    } catch (err) {
      console.error(`[projectActions] Failed to refresh folder: ${fPath}`, err);
    }
  }

  params.setNodeStates(prev => {
    const updated = { ...prev };
    recalcAllRootStates(params, updated);

    queueMicrotask(() => {
      (async () => {
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
          collectAllFilePaths(rootNode, updated, allFilePaths);
        }

        const oldFileContents = params.selectedFileContents;
        const newFileContents = { ...oldFileContents };

        // remove unselected
        for (const p of Object.keys(newFileContents)) {
          if (!allFilePaths.includes(p)) {
            delete newFileContents[p];
          }
        }

        // add newly selected
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
 * addProjectFolder
 * Adds a new folderPath to the projectFolders array if not already present,
 * then refreshes its listing (fully), expands it, and sets it to 'all' tri-state selection by default.
 */
export async function addProjectFolder(folderPath: string, params: ProjectActionsParams) {
  // 1) Add folder to projectFolders if not present
  params.setProjectFolders(prev => {
    if (!prev.includes(folderPath)) {
      return [...prev, folderPath];
    }
    return prev;
  });

  // 2) Refresh that folder fully (non-shallow)
  await refreshFolders([folderPath], params);

  // 3) Attempt to retrieve from directoryCache
  let listing = params.directoryCache[folderPath];
  if (!listing) {
    listing = await getDirectoryListing(folderPath, params, { shallow: false });
  }
  if (!listing) {
    console.warn('[projectActions] addProjectFolder: listing not found after refresh', folderPath);
    return;
  }

  // 4) Expand it (sync)
  params.setExpandedPaths(prev => ({
    ...prev,
    [listing.absolutePath]: true,
  }));

  // 5) set entire folder to 'all'
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

        // remove unselected
        for (const p of Object.keys(newFileContents)) {
          if (!allFilePaths.includes(p)) {
            delete newFileContents[p];
          }
        }

        // add newly selected
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
export function removeProjectFolder(folderPath: string, params: ProjectActionsParams) {
  params.setProjectFolders(prev => prev.filter(p => p !== folderPath));
  // optionally remove nodeStates & directoryCache for this folder, but we leave it as-is here.
}
