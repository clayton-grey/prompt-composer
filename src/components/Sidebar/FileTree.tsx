
/**
 * @file FileTree.tsx
 * @description
 * A React component that displays multiple root folders (passed via props) in a
 * tri-state selectable, collapsible tree structure. The user can add or remove
 * root folders externally, and each folder can be expanded or collapsed.
 *
 * This file has been updated to remove direct IPC calls (window.electronAPI.listDirectory).
 * Instead, it now uses the ProjectContext (via useProject()) to retrieve the directory data 
 * from a shared in-memory cache. This prevents repeated calls for the same folder.
 *
 * Key Changes in Step 3 (File & Directory Handling):
 *  - We replaced the loadFolderTree function that used electronAPI with 
 *    a simple call to project.getDirectoryListing(folderPath). 
 *  - We keep the tri-state selection logic the same, but the directory data 
 *    is fetched from context instead of direct electron calls.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { usePrompt } from '../../context/PromptContext';
import { useProject, DirectoryListing, TreeNode } from '../../context/ProjectContext';

type NodeState = 'none' | 'all' | 'partial';

interface FileTreeProps {
  /**
   * An array of folder paths that the user has added. Each path is treated
   * as a separate root directory in the tree.
   */
  folders: string[];

  /**
   * Callback invoked when the user removes a folder from the UI.
   */
  onRemoveFolder: (folderPath: string) => void;
}

interface FolderTreeState {
  rootPath: string;
  node: TreeNode | null;
  error?: string | null;
}

/**
 * The FileTree component uses tri-state selection logic for each node:
 *  - 'none' => not selected
 *  - 'all'  => fully selected
 *  - 'partial' => partially selected
 */
const FileTree: React.FC<FileTreeProps> = ({ folders, onRemoveFolder }) => {
  const { updateSelectedFiles } = usePrompt();
  const { getDirectoryListing } = useProject();

  /**
   * folderTrees stores the root-level data for each folder. If node = null, 
   * we haven't finished loading or it failed. 
   */
  const [folderTrees, setFolderTrees] = useState<FolderTreeState[]>([]);

  /**
   * nodeStates holds tri-state selection for each node path.
   * expandedPaths holds boolean expansions for each node path.
   */
  const [nodeStates, setNodeStates] = useState<Record<string, NodeState>>({});
  const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>({});

  /**
   * selectedFileContents is a mapping of file path => file content
   * for all files whose nodeState is 'all'.
   */
  const [selectedFileContents, setSelectedFileContents] = useState<Record<string, string>>({});

  /**
   * Removes a root folder from the FileTree. 
   * We call the parent callback so the folder is removed from "folders" prop.
   */
  const removeRootFolder = useCallback((folderPath: string) => {
    onRemoveFolder(folderPath);
  }, [onRemoveFolder]);

  /**
   * retrieveFolderTree uses ProjectContext to fetch the DirectoryListing 
   * for a given folder path. We do not store errors in context; we handle them locally.
   */
  const retrieveFolderTree = useCallback(async (folderPath: string) => {
    const listing = await getDirectoryListing(folderPath);
    if (!listing) {
      return null;
    }
    // Convert DirectoryListing to a root TreeNode
    const rootNode: TreeNode = {
      name: listing.baseName,
      path: listing.absolutePath,
      type: 'directory',
      children: listing.children
    };
    return rootNode;
  }, [getDirectoryListing]);

  /**
   * Whenever the "folders" prop changes (user adds or removes a folder), we handle:
   *  1) Removing states for any folder no longer in the array
   *  2) Creating a new entry for newly added folders and loading them 
   */
  useEffect(() => {
    // 1) Filter out any folderTrees that no longer appear in "folders"
    setFolderTrees((prev) => prev.filter((ft) => folders.includes(ft.rootPath)));

    // 2) For newly added folders, load from context if we don't already have them
    folders.forEach(async (fPath) => {
      const existing = folderTrees.find((ft) => ft.rootPath === fPath);
      if (!existing) {
        // Add a placeholder with node=null
        setFolderTrees((prev) => [...prev, { rootPath: fPath, node: null }]);
        // Attempt to retrieve the data from ProjectContext
        const node = await retrieveFolderTree(fPath);
        if (!node) {
          setFolderTrees((prev2) =>
            prev2.map((item) =>
              item.rootPath === fPath
                ? { ...item, node: null, error: 'Failed to load directory tree' }
                : item
            )
          );
          return;
        }
        // If we successfully got a node, we set expansions and states
        const newExpanded: Record<string, boolean> = {};
        const newStates: Record<string, NodeState> = {};
        const initData = (nd: TreeNode) => {
          newExpanded[nd.path] = false;
          newStates[nd.path] = 'none';
          if (nd.children) {
            nd.children.forEach(initData);
          }
        };
        initData(node);

        setExpandedPaths((prev2) => ({ ...prev2, ...newExpanded }));
        setNodeStates((prev2) => ({ ...prev2, ...newStates }));

        setFolderTrees((prev2) =>
          prev2.map((item) => (item.rootPath === fPath ? { ...item, node, error: null } : item))
        );
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folders]);

  /**
   * readFile is used when a node is set to 'all' to load the file's content from disk
   * via electronAPI. We haven't cached file contents in ProjectContext yet, 
   * so we still call electronAPI directly here. That is acceptable for the 
   * purpose of caching directory structures only. 
   */
  const readFile = useCallback(async (filePath: string): Promise<string> => {
    if (!window.electronAPI?.readFile) {
      console.warn('[FileTree] No electronAPI.readFile found.');
      return '';
    }
    try {
      const content = await window.electronAPI.readFile(filePath);
      return content;
    } catch (err) {
      console.error('[FileTree] readFile error for file:', filePath, err);
      return '';
    }
  }, []);

  /**
   * Once nodeStates changes, gather all file paths whose state is 'all', 
   * load or remove them from selectedFileContents, then call updateSelectedFiles 
   * in PromptContext for token usage.
   */
  useEffect(() => {
    const allPaths: string[] = [];

    // Recursively traverse the entire tree for each root
    function collectAllFilePaths(node: TreeNode) {
      const st = nodeStates[node.path];
      if (node.type === 'file' && st === 'all') {
        allPaths.push(node.path);
      }
      if (node.type === 'directory' && node.children) {
        node.children.forEach(collectAllFilePaths);
      }
    }

    folderTrees.forEach((ft) => {
      if (ft.node) {
        collectAllFilePaths(ft.node);
      }
    });

    // Remove stale paths from selectedFileContents
    setSelectedFileContents((prev) => {
      const updated: Record<string, string> = {};
      // Keep existing entries if still in allPaths
      for (const filePath of Object.keys(prev)) {
        if (allPaths.includes(filePath)) {
          updated[filePath] = prev[filePath];
        }
      }
      // For newly added paths, read from disk
      const newPaths = allPaths.filter((p) => !(p in updated));
      if (newPaths.length > 0) {
        Promise.all(
          newPaths.map(async (fp) => {
            const content = await readFile(fp);
            return { path: fp, content };
          })
        ).then((results) => {
          setSelectedFileContents((oldSel) => {
            const copy = { ...oldSel };
            results.forEach((r) => {
              copy[r.path] = r.content;
            });
            return copy;
          });
        });
      }
      return updated;
    });
  }, [nodeStates, folderTrees, readFile]);

  /**
   * Whenever selectedFileContents changes, call updateSelectedFiles in PromptContext
   * so that the new set of files can be considered for token usage.
   */
  useEffect(() => {
    updateSelectedFiles(selectedFileContents);
  }, [selectedFileContents, updateSelectedFiles]);

  /**
   * Toggles a directory node's expansion state.
   */
  const toggleFolderExpand = (nodePath: string) => {
    setExpandedPaths((prev) => ({
      ...prev,
      [nodePath]: !prev[nodePath]
    }));
  };

  /**
   * collapseAll sets expandedPaths to false for every node in the subtree.
   */
  const collapseAll = useCallback((rootNode: TreeNode) => {
    const pathsToCollapse: string[] = [];
    function gatherPaths(n: TreeNode) {
      pathsToCollapse.push(n.path);
      if (n.children) {
        n.children.forEach(gatherPaths);
      }
    }
    gatherPaths(rootNode);
    setExpandedPaths((prev) => {
      const updated = { ...prev };
      pathsToCollapse.forEach((p) => {
        updated[p] = false;
      });
      return updated;
    });
  }, []);

  /**
   * setNodeStateRecursive sets the entire subtree of 'startNode' to newState
   */
  const setNodeStateRecursive = (startNode: TreeNode, newState: NodeState, updated: Record<string, NodeState>) => {
    updated[startNode.path] = newState;
    if (startNode.type === 'directory' && startNode.children) {
      startNode.children.forEach((child) => setNodeStateRecursive(child, newState, updated));
    }
  };

  /**
   * toggleNodeSelection flips a node's selection state from 'none' to 'all' 
   * or from 'all' to 'none'. We do not currently handle partial toggles directly,
   * partial states occur only if children differ.
   */
  const toggleNodeSelection = (node: TreeNode) => {
    setNodeStates((prev) => {
      const updated = { ...prev };
      const currentState = updated[node.path] || 'none';
      const newState: NodeState = currentState === 'all' ? 'none' : 'all';
      setNodeStateRecursive(node, newState, updated);
      updateAncestorStates(node, updated);
      return updated;
    });
  };

  /**
   * updateAncestorStates traverses upwards from a node to recalc parent's nodeState.
   * If all children are 'all', parent is 'all'. If all children are 'none', parent is 'none'. 
   * Otherwise it's 'partial'. 
   */
  const updateAncestorStates = (node: TreeNode, updated: Record<string, NodeState>) => {
    function findParent(childPath: string): TreeNode | null {
      for (const ft of folderTrees) {
        if (!ft.node) continue;
        const parent = searchParent(ft.node, childPath);
        if (parent) return parent;
      }
      return null;
    }
    function searchParent(current: TreeNode, childPath: string): TreeNode | null {
      if (current.children) {
        for (const c of current.children) {
          if (c.path === childPath) return current;
          const deeper = searchParent(c, childPath);
          if (deeper) return deeper;
        }
      }
      return null;
    }

    const parentNode = findParent(node.path);
    if (!parentNode) return;

    if (parentNode.children) {
      const childStates = parentNode.children.map((c) => updated[c.path] || 'none');
      const allAll = childStates.every((s) => s === 'all');
      const allNone = childStates.every((s) => s === 'none');
      let newParentState: NodeState = 'partial';
      if (allAll) {
        newParentState = 'all';
      } else if (allNone) {
        newParentState = 'none';
      }
      updated[parentNode.path] = newParentState;
      updateAncestorStates(parentNode, updated);
    }
  };

  /**
   * Renders a tri-state icon for a node, allowing toggling with a click.
   */
  const renderSelectionIcon = (nodeState: NodeState, onClick: () => void) => {
    if (nodeState === 'all') {
      // checked
      return (
        <span onClick={onClick} className="cursor-pointer mr-2">
          <svg viewBox="0 0 24 24" className="h-4 w-4 text-blue-500" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="m9 12 2 2 4-4" />
          </svg>
        </span>
      );
    } else if (nodeState === 'partial') {
      // partial
      return (
        <span onClick={onClick} className="cursor-pointer mr-2">
          <svg viewBox="0 0 24 24" className="h-4 w-4 text-blue-500" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M8 12h8" />
          </svg>
        </span>
      );
    }
    // none
    return (
      <span onClick={onClick} className="cursor-pointer mr-2">
        <svg viewBox="0 0 24 24" className="h-4 w-4 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
        </svg>
      </span>
    );
  };

  /**
   * Renders a folder icon (open or closed) or empty space for a file.
   */
  const renderFolderIcon = (isDir: boolean, isExpanded: boolean) => {
    if (!isDir) {
      return <span className="w-4 mr-1" />;
    }
    if (isExpanded) {
      // open folder
      return (
        <span className="mr-1 text-gray-600 dark:text-gray-200">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" />
          </svg>
        </span>
      );
    }
    // closed folder
    return (
      <span className="mr-1 text-gray-600 dark:text-gray-200">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 
                  7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>
        </svg>
      </span>
    );
  };

  /**
   * Renders a single node (directory or file). If directory and expanded, 
   * we recursively render children.
   */
  const renderNode = (node: TreeNode, depth: number = 0): JSX.Element => {
    const isDir = node.type === 'directory';
    const isExpanded = !!expandedPaths[node.path];
    const nodeState = nodeStates[node.path] || 'none';
    const paddingLeft = depth * 18;

    return (
      <div key={node.path}>
        <div
          className="flex items-center text-sm py-1"
          style={{ paddingLeft: `${paddingLeft}px` }}
        >
          {renderSelectionIcon(nodeState, () => toggleNodeSelection(node))}
          <span
            onClick={() => isDir && toggleFolderExpand(node.path)}
            className="cursor-pointer flex items-center"
          >
            {renderFolderIcon(isDir, isExpanded)}
          </span>
          <span
            className="truncate overflow-hidden whitespace-nowrap max-w-[140px] text-gray-800 dark:text-gray-100"
            onClick={() => isDir && toggleFolderExpand(node.path)}
          >
            {node.name}
          </span>
        </div>
        {isDir && isExpanded && node.children && node.children.length > 0 && (
          <div>
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  /**
   * Renders one root folder. The root folder is displayed similarly, but 
   * with a "collapse all" and "remove folder" button in the header row.
   */
  const renderRootFolder = (item: FolderTreeState) => {
    const { rootPath, node, error } = item;
    if (error) {
      return (
        <div key={rootPath} className="text-red-600 text-sm mb-2">
          <p>Failed to load folder: {rootPath}</p>
        </div>
      );
    }
    if (!node) {
      return (
        <div key={rootPath} className="text-gray-500 text-sm mb-2">
          <p>Loading {rootPath}...</p>
        </div>
      );
    }

    const isExpanded = expandedPaths[node.path] || false;
    const nodeState = nodeStates[node.path] || 'none';

    return (
      <div key={rootPath} className="mb-2">
        {/* Root folder row */}
        <div className="flex items-center bg-transparent p-1">
          {renderSelectionIcon(nodeState, () => toggleNodeSelection(node))}

          <span
            onClick={() => toggleFolderExpand(node.path)}
            className="cursor-pointer flex items-center"
          >
            {renderFolderIcon(true, isExpanded)}
          </span>

          <span
            className="truncate overflow-hidden whitespace-nowrap max-w-[140px] text-gray-800 dark:text-gray-100 font-semibold"
            onClick={() => toggleFolderExpand(node.path)}
          >
            {node.name}
          </span>

          {/* Buttons: collapse-all & remove */}
          <div className="flex items-center ml-2">
            <button
              className="mr-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
              onClick={() => collapseAll(node)}
              title="Collapse entire subtree"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M5 3h14"/>
                <path d="m18 13-6-6-6 6"/>
                <path d="M12 7v14"/>
              </svg>
            </button>

            <button
              className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
              onClick={() => removeRootFolder(rootPath)}
              title="Remove folder"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="9" cy="9" r="7"/>
                <path d="m12 6-6 6"/>
                <path d="m6 6 6 6"/>
              </svg>
            </button>
          </div>
        </div>

        {/* If expanded, render children */}
        {isExpanded && node.children && node.children.length > 0 && (
          <div className="pl-6">
            {node.children.map((child) => renderNode(child, 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-full h-full text-xs text-gray-800 dark:text-gray-100">
      {folderTrees.length === 0 && (
        <div className="text-gray-500 italic">
          No folders added. Click "Add Folder" above to include your project.
        </div>
      )}
      {folderTrees.map((item) => renderRootFolder(item))}
    </div>
  );
};

export default FileTree;
