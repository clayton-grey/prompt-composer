
/**
 * @file FileTree.tsx
 * @description
 * A React component that displays multiple root folders (passed via props) in a
 * tri-state selectable, collapsible tree structure. The user can add or remove
 * root folders externally, and each folder can be fully or partially expanded.
 *
 * Step 17A Changes:
 *  1) No default project folder is included. We rely solely on the "folders" prop array.
 *  2) Simplify the view: remove the old framing/borders around root nodes.
 *  3) Restore new icons for folder open/closed, tri-state selection, collapse all,
 *     and remove. We inline the provided SVGs in dedicated render helpers.
 *  4) Partial truncation of file/folder names is handled with Tailwind classes
 *     "truncate overflow-hidden whitespace-nowrap".
 *  5) Tri-state logic remains, but we show icons instead of native checkboxes:
 *     - none => "square" icon
 *     - all => "square-check" icon (blue)
 *     - partial => "square-minus" icon (blue)
 *  6) Each root folder has a "collapse all" button (arrow-up-to-line) and a "remove"
 *     button (circle-x).
 *  7) Each directory node shows a folder or folder-open icon, clickable to expand/collapse.
 *
 * Implementation Details:
 *  - We store each root folder's loaded tree data in local state as an object array:
 *       folderTrees: Array<{ rootPath: string; node: TreeNode | null }>
 *  - On mount or changes to "folders" prop, we load each folder's directory data
 *    via electronAPI.listDirectory. We do partial error handling if loading fails.
 *  - Tri-state node states are tracked in a single Record<string, NodeState>.
 *    Node expansion states in expandedPaths, also a Record<string, boolean>.
 *  - The "removeRootFolder()" function updates the parent's "folders" array via
 *    onRemoveFolder callback (passed from the parent "Sidebar").
 *  - The "collapseAll()" function for a root folder sets expansions to false for
 *    every path in that subtree.
 *  - We highlight selected (all) or partial states with the relevant icons, which
 *    the user can click to toggle between 'none' and 'all'.
 *
 * Key Types:
 *  - NodeState: 'none' | 'all' | 'partial'
 *  - TreeNode: { name, path, type, children? }
 *
 * Edge Cases:
 *  - If a folder is empty or .gitignore excludes everything, children = []
 *  - If user tries removing a folder that doesn't exist in the folderTrees array,
 *    we do a safe filter. 
 *  - Large directories might cause performance issues. We rely on lazy expansions
 *    or partial expansions. In the future, we could add lazy loading of subfolders.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { usePrompt } from '../../context/PromptContext';

/** NodeState indicates how a node is selected in tri-state logic. */
type NodeState = 'none' | 'all' | 'partial';

/** A single node in the directory tree. */
export interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: TreeNode[];
}

/** The structure returned by the main process when listing a directory. */
interface ListDirectoryResult {
  absolutePath: string;
  baseName: string;
  children: TreeNode[];
}

/** Props for FileTree. */
interface FileTreeProps {
  /**
   * An array of folder paths that the user has added. We treat each path as a separate
   * root directory in the tree. No default path is included, so if this array is empty,
   * the UI will show no folders.
   */
  folders: string[];

  /**
   * Callback invoked when the user wants to remove a root folder from the list.
   * We'll pass the folder path that should be removed from the parent's array.
   */
  onRemoveFolder: (folderPath: string) => void;
}

/**
 * FileTree component that handles multiple root folders, each of which can be expanded
 * or collapsed. The user can tri-state select files or directories. We store the selected
 * file contents in global PromptContext (via updateSelectedFiles).
 */
const FileTree: React.FC<FileTreeProps> = ({ folders, onRemoveFolder }) => {
  const { updateSelectedFiles } = usePrompt();

  /**
   * folderTrees stores the root-level data for each folder. If a folder is not yet
   * loaded, node = null. Once loaded, node = the directory tree starting at that folder.
   */
  const [folderTrees, setFolderTrees] = useState<Array<{
    rootPath: string;
    node: TreeNode | null;
    error?: string | null;
  }>>([]);

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
   * loadFolderTree loads the directory tree for a single folder path
   * via electronAPI.listDirectory. If successful, returns the root node,
   * otherwise returns null.
   */
  const loadFolderTree = useCallback(async (folderPath: string): Promise<TreeNode | null> => {
    if (!window.electronAPI?.listDirectory) {
      console.warn('[FileTree] No electronAPI.listDirectory found.');
      return null;
    }
    try {
      const result = (await window.electronAPI.listDirectory(folderPath)) as ListDirectoryResult;
      const rootNode: TreeNode = {
        name: result.baseName,
        path: result.absolutePath,
        type: 'directory',
        children: result.children
      };
      return rootNode;
    } catch (err) {
      console.error('[FileTree] loadFolderTree error for folder:', folderPath, err);
      return null;
    }
  }, []);

  /**
   * Whenever "folders" changes from the parent, we refresh folderTrees
   * to reflect any additions or removals. For new folders, we load them
   * from disk. For removed folders, we remove them from folderTrees.
   */
  useEffect(() => {
    // 1) Remove from folderTrees any root that no longer appears in "folders"
    setFolderTrees((prev) => prev.filter((ft) => folders.includes(ft.rootPath)));

    // 2) For any newly added folder that doesn't exist in folderTrees, load it
    folders.forEach(async (fPath) => {
      const existing = folderTrees.find((ft) => ft.rootPath === fPath);
      if (!existing) {
        // Insert a temporary entry with node=null while we load
        setFolderTrees((prev) => [...prev, { rootPath: fPath, node: null, error: undefined }]);
        // Now load the tree data
        const node = await loadFolderTree(fPath);
        if (!node) {
          setFolderTrees((prev) =>
            prev.map((item) =>
              item.rootPath === fPath
                ? { ...item, node: null, error: 'Failed to load directory tree' }
                : item
            )
          );
          return;
        }
        // Initialize expansions and states
        // We'll expand the root by default
        setExpandedPaths((prevExp) => ({
          ...prevExp,
          [node.path]: true
        }));
        setNodeStates((prevStates) => ({
          ...prevStates,
          [node.path]: 'none'
        }));
        // Insert into folderTrees
        setFolderTrees((prev) =>
          prev.map((item) =>
            item.rootPath === fPath ? { ...item, node, error: null } : item
          )
        );
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folders]);

  /**
   * readFile reads the file content from disk using electronAPI.
   * If it fails, returns an empty string (with a console error).
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
   * Once nodeStates changes, we gather all file paths that are 'all' and load
   * or remove them from selectedFileContents. Then we call updateSelectedFiles
   * in PromptContext for token usage.
   */
  useEffect(() => {
    // 1) Find all file paths that are 'all'
    const allPaths: string[] = [];
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
      if (ft.node) collectAllFilePaths(ft.node);
    });

    // 2) Remove stale paths from selectedFileContents
    setSelectedFileContents((prev) => {
      const updated: Record<string, string> = {};
      for (const filePath of Object.keys(prev)) {
        if (allPaths.includes(filePath)) {
          // keep it
          updated[filePath] = prev[filePath];
        }
      }
      // 3) For newly added paths, read from disk
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
   * Whenever selectedFileContents changes, we notify PromptContext so that
   * token usage can be recalculated.
   */
  useEffect(() => {
    updateSelectedFiles(selectedFileContents);
  }, [selectedFileContents, updateSelectedFiles]);

  /**
   * toggleFolderExpand flips the expansion for a given directory node path.
   */
  const toggleFolderExpand = (nodePath: string) => {
    setExpandedPaths((prev) => ({
      ...prev,
      [nodePath]: !prev[nodePath]
    }));
  };

  /**
   * collapseAll sets expandedPaths to false for all descendants of a given root.
   */
  const collapseAll = (rootNode: TreeNode) => {
    const pathsToCollapse: string[] = [];
    function gatherPaths(node: TreeNode) {
      pathsToCollapse.push(node.path);
      if (node.children) {
        node.children.forEach(gatherPaths);
      }
    }
    gatherPaths(rootNode);
    setExpandedPaths((prev) => {
      const updated = { ...prev };
      pathsToCollapse.forEach((p) => {
        updated[p] = false;
      });
      // Keep the root itself collapsed or maybe keep it expanded? 
      // We'll collapse it as well to match "collapse all".
      return updated;
    });
  };

  /**
   * removeRootFolder calls onRemoveFolder with the rootPath, letting the parent
   * update the "folders" prop so that this root is removed from the UI.
   */
  const removeRootFolder = (folderPath: string) => {
    onRemoveFolder(folderPath);
  };

  /**
   * setNodeStateRecursive sets a node and all of its descendants to the given state.
   */
  const setNodeStateRecursive = (startNode: TreeNode, newState: NodeState, updated: Record<string, NodeState>) => {
    updated[startNode.path] = newState;
    if (startNode.type === 'directory' && startNode.children) {
      startNode.children.forEach((child) => setNodeStateRecursive(child, newState, updated));
    }
  };

  /**
   * When a node is toggled from 'all' => 'none' or 'none'/'partial' => 'all',
   * we apply the new state to the node's entire subtree. Then we update ancestors
   * to reflect partial or full states as needed.
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
   * updateAncestorStates walks upward from a node to recalculate each parent's state
   * based on its children. If all children are 'all', the parent is 'all'; if all are 'none',
   * the parent is 'none'; otherwise 'partial'.
   */
  const updateAncestorStates = (node: TreeNode, updated: Record<string, NodeState>) => {
    // Find the parent in folderTrees
    function findParent(childPath: string): TreeNode | null {
      // We search all nodes in all root trees for a node that has a child with childPath
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
          if (c.path === childPath) {
            return current;
          }
          const deeper = searchParent(c, childPath);
          if (deeper) return deeper;
        }
      }
      return null;
    }

    const parentNode = findParent(node.path);
    if (!parentNode) return; // No parent => root node => done

    // Recompute parent's state
    if (parentNode.children) {
      const childStates = parentNode.children.map((c) => updated[c.path] || 'none');
      const allAll = childStates.every((s) => s === 'all');
      const allNone = childStates.every((s) => s === 'none');

      let newParentState: NodeState;
      if (allAll) newParentState = 'all';
      else if (allNone) newParentState = 'none';
      else newParentState = 'partial';

      updated[parentNode.path] = newParentState;
      // Then recursively update parent's parent
      updateAncestorStates(parentNode, updated);
    }
  };

  /**
   * Renders the tri-state selection icon for a given node path. The user can click it to toggle.
   */
  const renderSelectionIcon = (nodePath: string, nodeState: NodeState, onClick: () => void) => {
    if (nodeState === 'all') {
      // Square Check
      return (
        <span onClick={onClick} className="cursor-pointer text-blue-500 mr-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none"
               stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
               className="lucide lucide-square-check">
            <rect width="14" height="14" x="2" y="2" rx="2"/>
            <path d="m9 12 2 2 4-4"/>
          </svg>
        </span>
      );
    } else if (nodeState === 'partial') {
      // Square Minus
      return (
        <span onClick={onClick} className="cursor-pointer text-blue-500 mr-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none"
               stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
               className="lucide lucide-square-minus">
            <rect width="14" height="14" x="2" y="2" rx="2"/>
            <path d="M8 12h8"/>
          </svg>
        </span>
      );
    } else {
      // none => Square
      return (
        <span onClick={onClick} className="cursor-pointer text-gray-600 dark:text-gray-300 mr-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none"
               stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
               className="lucide lucide-square">
            <rect width="14" height="14" x="2" y="2" rx="2"/>
          </svg>
        </span>
      );
    }
  };

  /**
   * Renders a folder icon (closed or open) or nothing for files.
   */
  const renderFolderIcon = (isDir: boolean, isExpanded: boolean) => {
    if (!isDir) {
      return <span className="w-4 mr-1" />;
    }
    if (isExpanded) {
      // folder-open
      return (
        <span className="mr-1 text-gray-600 dark:text-gray-200">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none"
               stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
               className="lucide lucide-folder-open">
            <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>
          </svg>
        </span>
      );
    } else {
      // folder
      return (
        <span className="mr-1 text-gray-600 dark:text-gray-200">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none"
               stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
               className="lucide lucide-folder">
            <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 
                     7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>
          </svg>
        </span>
      );
    }
  };

  /**
   * renderNode is a recursive function that renders a single node and all its children,
   * with tri-state selection and clickable folder icons for expansion/collapse.
   */
  const renderNode = (node: TreeNode, depth: number = 0) => {
    const isDir = node.type === 'directory';
    const isExpanded = !!expandedPaths[node.path];
    const nodeState = nodeStates[node.path] || 'none';

    // Indent with some left padding
    const paddingLeft = depth * 18;

    return (
      <div key={node.path}>
        <div className="flex items-center text-sm py-1"
             style={{ paddingLeft: `${paddingLeft}px` }}>
          {/** Tri-state selection icon */}
          {renderSelectionIcon(node.path, nodeState, () => toggleNodeSelection(node))}

          {/** Folder or file icon */}
          <span
            onClick={() => isDir && toggleFolderExpand(node.path)}
            className={`cursor-pointer flex items-center`}
          >
            {renderFolderIcon(isDir, isExpanded)}
          </span>

          {/** Node name (with truncation) */}
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
   * Renders a single root folder's UI: the root node name, plus collapse button,
   * remove button, and its child nodes.
   */
  const renderRootFolder = (item: { rootPath: string; node: TreeNode | null; error?: string | null }) => {
    const { rootPath, node, error } = item;

    if (error) {
      // Show an error message for this folder
      return (
        <div key={rootPath} className="text-red-600 text-sm mb-2">
          <p>Failed to load folder: {rootPath}</p>
        </div>
      );
    }
    if (!node) {
      // Still loading
      return (
        <div key={rootPath} className="text-gray-500 text-sm mb-2">
          <p>Loading {rootPath}...</p>
        </div>
      );
    }

    const isExpanded = expandedPaths[node.path] || false;

    // We'll show a small row with the root folder name, plus collapse & remove
    const rootNodeState = nodeStates[node.path] || 'none';

    return (
      <div key={rootPath} className="mb-2">
        {/* Root folder header row */}
        <div className="flex items-center bg-transparent p-1">
          {/* Tri-state selection for the root node */}
          {renderSelectionIcon(node.path, rootNodeState, () => toggleNodeSelection(node))}

          {/* Folder icon */}
          <span
            onClick={() => toggleFolderExpand(node.path)}
            className="cursor-pointer flex items-center"
          >
            {renderFolderIcon(true, isExpanded)}
          </span>

          {/* Folder name with partial truncation */}
          <span
            className="truncate overflow-hidden whitespace-nowrap max-w-[140px] text-gray-800 dark:text-gray-100 font-semibold"
            onClick={() => toggleFolderExpand(node.path)}
          >
            {node.name}
          </span>

          {/* Buttons for collapse-all and remove */}
          <div className="flex items-center ml-2">
            {/* Collapse All button */}
            <button
              className="mr-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
              onClick={() => collapseAll(node)}
              title="Collapse entire subtree"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none"
                   stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                   className="lucide lucide-arrow-up-to-line">
                <path d="M5 3h14"/>
                <path d="m18 13-6-6-6 6"/>
                <path d="M12 7v14"/>
              </svg>
            </button>

            {/* Remove root button */}
            <button
              className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
              onClick={() => removeRootFolder(rootPath)}
              title="Remove folder"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none"
                   stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                   className="lucide lucide-circle-x">
                <circle cx="9" cy="9" r="7"/>
                <path d="m12 6-6 6"/>
                <path d="m6 6 6 6"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Children if expanded */}
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
