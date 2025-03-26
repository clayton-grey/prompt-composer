
/**
 * @file FileTree.tsx
 * @description
 * A React component that displays multiple root folders (passed via props) in a
 * tri-state selectable, collapsible tree structure. The user can add or remove
 * root folders externally, and each folder can be expanded or collapsed.
 *
 * This file has been updated for "Architecture & State Management - Step 1: 
 * Refactor Tri-State Parent-Child Logic." We now perform the tri-state 
 * updates in a single pass after toggling a node, instead of repeatedly 
 * updating ancestor states. This approach sets the target node's subtree 
 * to 'all' or 'none' and then recalculates the entire tree from the roots 
 * downward to determine which folders are 'none', 'all', or 'partial'.
 *
 * Key Changes:
 *  - Removed repeated calls to updateAncestorStates()
 *  - Introduced a single-pass function `recalcSubtreeStates` that, given a root, 
 *    traverses all descendants. After toggling a node, we update the subtree 
 *    states for that node, then run the recalc logic from each root folder 
 *    to enforce correct partial states in ancestors.
 *  - This approach simplifies the logic and reduces potential redundant scans.
 *
 * Tri-State Explanation:
 *  - 'none': Node and all descendants are not selected
 *  - 'all': Node and all descendants are selected
 *  - 'partial': Some children are selected but not all, or a child is partial
 *
 * Inputs:
 *  - props.folders: string[] of folder paths the user added
 *  - props.onRemoveFolder: callback to remove a folder
 *
 * Maintained State:
 *  - folderTrees: array of { rootPath, node, error } describing each root folder
 *  - nodeStates: Record<string, NodeState> mapping each node path to 'none'|'all'|'partial'
 *  - expandedPaths: Record<string, boolean> for toggling expansion in the UI
 *  - selectedFileContents: record of file path => file content for selected files
 *
 * Implementation & Flow:
 *  1) We fetch each folder tree via ProjectContext.getDirectoryListing.
 *  2) We store them in folderTrees. For each node, we track a tri-state in nodeStates.
 *  3) Toggling a node changes it from 'none' => 'all' or 'all' => 'none'. We apply 
 *     that state recursively to the node's subtree.
 *  4) We then call `recalcAllRootStates()` which calls `recalcSubtreeState()` 
 *     on each root node. That function does a post-order DFS to compute 
 *     each directory’s correct tri-state from its children.
 *  5) The final nodeStates is stored in React state, triggering a re-render 
 *     that sets partial icons, etc.
 *  6) The selectedFileContents is updated based on which nodes are 'all' (files).
 *  7) The parent PromptContext is notified to update token usage and other details.
 *
 * Edge Cases:
 *  - If a folder is empty or fails to load, it shows an error or loading state.
 *  - Large folder trees might create performance overhead. This step's single-pass 
 *    approach helps reduce repeated ancestor scans.
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

/**
 * folderTrees items hold each root folder's data, including the fully loaded tree node,
 * or an error if loading fails, so we can display it in the UI.
 */
interface FolderTreeState {
  rootPath: string;
  node: TreeNode | null;
  error?: string | null;
}

/**
 * The FileTree component uses tri-state selection logic for each node:
 * 'none' => not selected
 * 'all' => fully selected
 * 'partial' => partially selected (some descendants are 'all', others are 'none').
 */
const FileTree: React.FC<FileTreeProps> = ({ folders, onRemoveFolder }) => {
  const { updateSelectedFiles } = usePrompt();
  const { getDirectoryListing } = useProject();

  // folderTrees: each root folder's top node plus any error/loading states
  const [folderTrees, setFolderTrees] = useState<FolderTreeState[]>([]);

  // nodeStates: track tri-state for each node's path
  const [nodeStates, setNodeStates] = useState<Record<string, NodeState>>({});

  // expandedPaths: track which nodes are expanded for UI display
  const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>({});

  // selectedFileContents: file path => file content for all files that are fully selected ('all')
  const [selectedFileContents, setSelectedFileContents] = useState<Record<string, string>>({});

  /**
   * Removes a root folder from the FileTree.
   * Calls the parent callback so it’s removed from the "folders" prop externally.
   */
  const removeRootFolder = useCallback((folderPath: string) => {
    onRemoveFolder(folderPath);
  }, [onRemoveFolder]);

  /**
   * retrieveFolderTree calls ProjectContext to get a DirectoryListing for a folder path.
   * We do not store errors in context; if it fails, we track them in local state.
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
   * For newly added folders, load them from ProjectContext if not already in folderTrees.
   * For removed folders, drop them from folderTrees. This runs whenever `folders` changes.
   */
  useEffect(() => {
    // Remove any folderTrees not in `folders`
    setFolderTrees((prev) => prev.filter((ft) => folders.includes(ft.rootPath)));

    // For newly added folders, load them if they’re not in folderTrees yet
    folders.forEach(async (fPath) => {
      const existing = folderTrees.find((ft) => ft.rootPath === fPath);
      if (!existing) {
        // create a placeholder
        setFolderTrees((prev) => [...prev, { rootPath: fPath, node: null }]);
        // fetch data
        const node = await retrieveFolderTree(fPath);
        if (!node) {
          // mark error
          setFolderTrees((prev2) =>
            prev2.map((item) =>
              item.rootPath === fPath
                ? { ...item, node: null, error: 'Failed to load directory tree' }
                : item
            )
          );
          return;
        }
        // initialize expansions & states for each node in this new tree
        const newExpanded: Record<string, boolean> = {};
        const newStates: Record<string, NodeState> = {};
        function initData(n: TreeNode) {
          newExpanded[n.path] = false;
          newStates[n.path] = 'none';
          if (n.children) {
            n.children.forEach(initData);
          }
        }
        initData(node);

        // merge expansions & states
        setExpandedPaths((prev2) => ({ ...prev2, ...newExpanded }));
        setNodeStates((prev2) => ({ ...prev2, ...newStates }));

        // set the newly loaded node
        setFolderTrees((prev2) =>
          prev2.map((item) => (item.rootPath === fPath ? { ...item, node, error: null } : item))
        );
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folders]);

  /**
   * readFile loads content from disk for a given file path via electronAPI.
   * We do not yet cache these in the ProjectContext for performance reasons,
   * so each selected file is read once here as needed.
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
   * Recomputes selectedFileContents whenever nodeStates changes:
   * - Collect all file paths that are 'all'.
   * - read them if not already in selectedFileContents.
   * - remove any that are no longer 'all'.
   * Then call updateSelectedFiles() in PromptContext so it can recalc token usage, etc.
   */
  useEffect(() => {
    const allPaths: string[] = [];

    // Traverse all root folders to collect file paths marked 'all'
    function collectAllFilePaths(node: TreeNode) {
      const st = nodeStates[node.path] || 'none';
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

    // Remove any no-longer-selected paths from selectedFileContents
    setSelectedFileContents((prev) => {
      const updated: Record<string, string> = {};
      // keep existing entries if still in allPaths
      for (const filePath of Object.keys(prev)) {
        if (allPaths.includes(filePath)) {
          updated[filePath] = prev[filePath];
        }
      }

      // load newly 'all' paths that are not in updated
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
   * Whenever selectedFileContents changes, notify PromptContext so it can update token usage.
   */
  useEffect(() => {
    updateSelectedFiles(selectedFileContents);
  }, [selectedFileContents, updateSelectedFiles]);

  /**
   * Toggles expansion for a directory node in the UI.
   */
  const toggleFolderExpand = (nodePath: string) => {
    setExpandedPaths((prev) => ({
      ...prev,
      [nodePath]: !prev[nodePath]
    }));
  };

  /**
   * Collapses an entire subtree under a given root node.
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
   * setNodeStateRecursive: sets the entire subtree (node and descendants) 
   * to newState ('all' or 'none'). This is used immediately after toggling 
   * a node, before re-running the global tri-state recalculation.
   */
  const setNodeStateRecursive = (startNode: TreeNode, newState: NodeState, updated: Record<string, NodeState>) => {
    updated[startNode.path] = newState;
    if (startNode.type === 'directory' && startNode.children) {
      startNode.children.forEach((child) => {
        setNodeStateRecursive(child, newState, updated);
      });
    }
  };

  /**
   * recalcSubtreeState: post-order DFS that calculates the correct tri-state of this node 
   * based on the states of its children. The final state is stored in updated[node.path].
   *
   * Steps:
   *  1) If node is file, do nothing; just return updated[node.path].
   *  2) If node is directory, we recurse into children first. Then if all children 
   *     are 'all' => node is 'all'; if all children are 'none' => node is 'none'; 
   *     else => node is 'partial'.
   */
  const recalcSubtreeState = (node: TreeNode, updated: Record<string, NodeState>): NodeState => {
    const current = updated[node.path] || 'none';

    if (node.type === 'file') {
      // Leaf node. Return whatever is currently set. 
      return current;
    }

    if (!node.children || node.children.length === 0) {
      // Directory with no children => remain as is (or 'none' by default).
      return current;
    }

    // If directory, evaluate children
    let childAllCount = 0;
    let childNoneCount = 0;
    let totalChildren = node.children.length;

    for (const child of node.children) {
      // Recurse first
      const childState = recalcSubtreeState(child, updated);

      if (childState === 'all') {
        childAllCount += 1;
      } else if (childState === 'none') {
        childNoneCount += 1;
      }
    }

    // If all children are 'all', node = 'all'
    if (childAllCount === totalChildren) {
      updated[node.path] = 'all';
    }
    // If all children are 'none', node = 'none'
    else if (childNoneCount === totalChildren) {
      updated[node.path] = 'none';
    }
    // Otherwise, it's partial
    else {
      updated[node.path] = 'partial';
    }

    return updated[node.path];
  };

  /**
   * After toggling a node's subtree, we run recalcSubtreeState for each root node 
   * to ensure all ancestors get correct partial states. This single pass from the root 
   * downward ensures a clean tri-state resolution. 
   */
  const recalcAllRootStates = (updated: Record<string, NodeState>) => {
    for (const ft of folderTrees) {
      if (ft.node) {
        recalcSubtreeState(ft.node, updated);
      }
    }
  };

  /**
   * Toggles a node's selection from 'all' => 'none' or 'none' => 'all'.
   * We set the subtree to that new state, then recalc states from each root.
   */
  const toggleNodeSelection = (node: TreeNode) => {
    setNodeStates((prev) => {
      const updated = { ...prev };
      const currentState = updated[node.path] || 'none';
      const newState: NodeState = currentState === 'all' ? 'none' : 'all';

      // 1) Set the entire subtree to newState
      setNodeStateRecursive(node, newState, updated);

      // 2) Recalc entire tri-state from each root
      recalcAllRootStates(updated);

      return updated;
    });
  };

  /**
   * Renders a tri-state icon for a node. Clicking it toggles 'all'/'none'.
   */
  const renderSelectionIcon = (nodeState: NodeState, onClick: () => void) => {
    if (nodeState === 'all') {
      // fully selected
      return (
        <span onClick={onClick} className="cursor-pointer mr-2">
          <svg viewBox="0 0 24 24" className="h-4 w-4 text-blue-500" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="m9 12 2 2 4-4" />
          </svg>
        </span>
      );
    }
    else if (nodeState === 'partial') {
      // partial selection
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
   * Renders a folder icon (open or closed) or empty space for files.
   */
  const renderFolderIcon = (isDir: boolean, isExpanded: boolean) => {
    if (!isDir) {
      // it's a file
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
   * renderNode: Renders a single node (directory or file). If it's a directory and expanded, 
   * we recursively render its children. We also attach tri-state icons to each node.
   */
  const renderNode = (node: TreeNode, depth: number = 0): JSX.Element => {
    const isDir = node.type === 'directory';
    const isExpanded = expandedPaths[node.path] || false;
    const nodeState = nodeStates[node.path] || 'none';
    const paddingLeft = depth * 18;

    return (
      <div key={node.path}>
        <div
          className="flex items-center text-sm py-1"
          style={{ paddingLeft: `${paddingLeft}px` }}
        >
          {/* Tri-State check icon */}
          {renderSelectionIcon(nodeState, () => toggleNodeSelection(node))}
          
          {/* Folder or file icon + name */}
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

        {/* If directory is expanded, render children */}
        {isDir && isExpanded && node.children && node.children.length > 0 && (
          <div>
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  /**
   * Renders a root folder with its name, plus "collapse all" and remove folder buttons.
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
          {/* Tri-state icon */}
          {renderSelectionIcon(nodeState, () => toggleNodeSelection(node))}

          {/* Folder icon */}
          <span
            onClick={() => toggleFolderExpand(node.path)}
            className="cursor-pointer flex items-center"
          >
            {renderFolderIcon(true, isExpanded)}
          </span>

          {/* Folder name */}
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
