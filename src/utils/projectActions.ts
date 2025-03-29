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
 * Motivation for final refactor:
 *  - We remove all "await" calls from synchronous React callbacks (like setSelectedFileContents)
 *    and place them in an async microtask.
 *  - We gather the old selectedFileContents from the context, then read missing files
 *    with `await readFile(...)`, then do one final setSelectedFileContents with the updated map.
 *
 * Implementation details:
 *  - After tri-state or folder expansions, we do:
 *       queueMicrotask(() => {
 *         (async () => {
 *           // 1) Build a new object for selectedFileContents
 *           // 2) For newly selected files, read them
 *           // 3) setSelectedFileContents(newObject)
 *         })();
 *       });
 *    This ensures "await" is valid inside the async block.
 */

import { TreeNode, DirectoryListing } from '../context/ProjectContext';

/**
 * @interface ProjectActionsParams
 * The shape of the parameters (state & setState) used by all project actions.
 */
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
 * and stores the result in directoryCache.
 *
 * @param dirPath The folder path to list
 * @param params  The context state & actions
 * @returns A Promise resolving to the DirectoryListing or null on failure
 */
export async function getDirectoryListing(
  dirPath: string,
  params: ProjectActionsParams
): Promise<DirectoryListing | null> {
  if (params.directoryCache[dirPath]) {
    return params.directoryCache[dirPath];
  }
  if (!window?.electronAPI?.listDirectory) {
    console.warn('[projectActions] No electronAPI.listDirectory found.');
    return null;
  }
  try {
    const result = await window.electronAPI.listDirectory(dirPath);
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
 *
 * @param filePath The full file path
 * @returns The file content or an empty string on failure
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
 *
 * @returns The final state for this node ('none', 'all', or 'partial')
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
 *
 * Then merges or removes selectedFileContents accordingly in a queued microtask.
 */
export async function toggleNodeSelection(node: TreeNode, params: ProjectActionsParams) {
  // 1) Update the nodeStates synchronously
  params.setNodeStates(prev => {
    const updated = { ...prev };
    const current = updated[node.path] || 'none';
    const newState = current === 'all' ? 'none' : 'all';

    setNodeStateRecursive(node, newState, updated);
    recalcAllRootStates(params, updated);

    // 2) We'll queue a microtask to handle reading new files and removing unselected
    queueMicrotask(() => {
      (async () => {
        // Gather the currently updated nodeStates in "updated"
        // (the "updated" object is closed over by this function)
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

        // Build a new object for selectedFileContents from the current
        const oldFileContents = params.selectedFileContents;
        const newFileContents = { ...oldFileContents };

        // 2A) Remove unselected
        for (const pathKey of Object.keys(newFileContents)) {
          if (!allFilePaths.includes(pathKey)) {
            delete newFileContents[pathKey];
          }
        }

        // 2B) For newly selected, load file content
        for (const fileP of allFilePaths) {
          if (!(fileP in newFileContents)) {
            const content = await readFile(fileP);
            newFileContents[fileP] = content;
          }
        }

        // 2C) Now set it
        params.setSelectedFileContents(newFileContents);
      })();
    });

    return updated;
  });
}

/**
 * toggleExpansion
 * Toggles a directory's expanded/collapsed state in expandedPaths (sync).
 */
export function toggleExpansion(nodePath: string, params: ProjectActionsParams) {
  params.setExpandedPaths(prev => ({
    ...prev,
    [nodePath]: !prev[nodePath],
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
  // 1) Attempt to refresh each folder's listing
  for (const fPath of folderPaths) {
    if (!window.electronAPI?.listDirectory) {
      console.warn('[projectActions] refreshFolders: electronAPI.listDirectory is unavailable');
      continue;
    }
    try {
      const freshListing = await window.electronAPI.listDirectory(fPath);
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

  // 2) Recalc tri-state
  params.setNodeStates(prev => {
    const updated = { ...prev };
    recalcAllRootStates(params, updated);

    // 3) queue a microtask to load or remove file contents
    queueMicrotask(() => {
      (async () => {
        // gather allFilePaths from updated nodeStates
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

        // build new file contents
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
 * then refreshes its listing, expands it, and sets it to 'all' tri-state selection by default.
 */
export async function addProjectFolder(folderPath: string, params: ProjectActionsParams) {
  // 1) Add folder to projectFolders if not present
  params.setProjectFolders(prev => {
    if (!prev.includes(folderPath)) {
      return [...prev, folderPath];
    }
    return prev;
  });

  // 2) Refresh that folder
  await refreshFolders([folderPath], params);

  // 3) Attempt to retrieve from directoryCache
  let listing = params.directoryCache[folderPath];
  if (!listing) {
    listing = await getDirectoryListing(folderPath, params);
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

    // 6) queue microtask to load file contents for everything in that folder
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
 * Removes a folder from the projectFolders list. Does not automatically remove
 * selected files or states from nodeStates or directoryCache, unless you specifically
 * want that logic here.
 */
export function removeProjectFolder(folderPath: string, params: ProjectActionsParams) {
  params.setProjectFolders(prev => prev.filter(p => p !== folderPath));
  // Optionally, remove nodeStates & directoryCache for this folder if you prefer.
}
