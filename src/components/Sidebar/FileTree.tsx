/**
 * @file FileTree.tsx
 * @description
 * A React component that displays a single "root folder" (from the main process)
 * with tri-state checkbox selection for subfolders/files. We also have:
 *  - Arrow expansion indicators
 *  - A "Collapse All" button
 *  - A "Close" button
 *  - Preservation of expansions and tri-state selection states
 *
 * Implementation Notes:
 *  - Instead of using Node.js path methods in the browser, we rely on the main process
 *    to return { absolutePath, baseName, children }. That way, we don't import "path".
 *  - The user can pass rootPath. We'll send it to the main process to get the structure.
 *  - The main process also calculates the root's "baseName", which we display as root.name.
 */

import React, { useEffect, useState, useRef } from 'react';

/**
 * The shape of each file/folder node in the tree. 
 * Matches what we get from the main process, plus we also define a convenience
 * interface for "root node" usage.
 */
export interface TreeNode {
  name: string;          // e.g. 'src'
  path: string;          // absolute path
  type: 'file' | 'directory';
  children?: TreeNode[];
}

/**
 * For tri-state checkboxes: "all", "none", or "partial"
 */
type NodeState = 'all' | 'none' | 'partial';

/**
 * The interface we expect back from "list-directory" in the main process.
 */
interface ListDirectoryResult {
  absolutePath: string;       // full absolute path, used as root.path
  baseName: string;           // the last segment of the path
  children: TreeNode[];       // subfolders/files
}

/**
 * Props for the FileTree:
 *  - rootPath: The path to load as the "root folder". Defaults to '.'
 */
interface FileTreeProps {
  rootPath?: string;
}

// Define the electronAPI type
declare global {
  interface Window {
    electronAPI: {
      listDirectory: (path: string) => Promise<ListDirectoryResult>;
      readFile: (path: string) => Promise<string>;
      sendMessage: (message: string, data: any) => void;
    };
  }
}

const FileTree: React.FC<FileTreeProps> = ({ rootPath = '.' }) => {
  /**
   * rootNode represents the directory itself (with name, path, children).
   * If null, there's nothing displayed (e.g. user clicked Close).
   */
  const [rootNode, setRootNode] = useState<TreeNode | null>(null);

  /**
   * nodeStates and expandedStates track selection and expansion states, 
   * keyed by node.path.
   */
  const [nodeStates, setNodeStates] = useState<Record<string, NodeState>>({});
  const [expandedStates, setExpandedStates] = useState<Record<string, boolean>>({});

  /**
   * parentMapRef: Used to identify a node's parent, for partial selection logic.
   */
  const parentMapRef = useRef<Map<string, TreeNode> | null>(null);

  /**
   * Track any error messages (e.g., if listDirectory fails).
   */
  const [error, setError] = useState<string | null>(null);

  const checkboxRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  useEffect(() => {
    // If no electronAPI, fail gracefully
    if (!window.electronAPI?.listDirectory) {
      setError('No electronAPI.listDirectory function found.');
      return;
    }

    window.electronAPI
      .listDirectory(rootPath)
      .then((result: ListDirectoryResult) => {
        // Construct the root node
        const newRootNode: TreeNode = {
          name: result.baseName,
          path: result.absolutePath,
          type: 'directory',
          children: result.children
        };

        // Build default expansions/states
        const newNodeStates: Record<string, NodeState> = {};
        const newExpandedStates: Record<string, boolean> = {};

        // Recursively set each node's initial state
        function initNodeStates(node: TreeNode) {
          newNodeStates[node.path] = 'none';
          newExpandedStates[node.path] = false; // collapsed by default
          if (node.children) {
            for (const child of node.children) {
              initNodeStates(child);
            }
          }
        }
        initNodeStates(newRootNode);

        // Build the parent map
        const pm = new Map<string, TreeNode>();
        function buildParentMap(parent: TreeNode, children: TreeNode[]) {
          for (const c of children) {
            pm.set(c.path, parent);
            if (c.type === 'directory' && c.children) {
              buildParentMap(c, c.children);
            }
          }
        }
        if (newRootNode.children) {
          buildParentMap(newRootNode, newRootNode.children);
        }
        parentMapRef.current = pm;

        setRootNode(newRootNode);
        setNodeStates(newNodeStates);
        setExpandedStates(newExpandedStates);
        setError(null);
      })
      .catch((err) => {
        console.error('[FileTree] Failed to list directory:', err);
        setError(`Failed to list directory: ${String(err)}`);
      });
  }, [rootPath]);

  // Effect to handle checkbox indeterminate states
  useEffect(() => {
    Object.entries(nodeStates).forEach(([path, state]) => {
      const checkbox = checkboxRefs.current.get(path);
      if (checkbox) {
        checkbox.indeterminate = state === 'partial';
      }
    });
  }, [nodeStates]);

  /**
   * Collapses the entire subtree of a node (sets expanded=false).
   * We use this for the "Collapse All" button on the root node.
   */
  function collapseAllSubtree(node: TreeNode) {
    setExpandedStates((prev) => {
      const updated = { ...prev };
      function recurse(n: TreeNode) {
        updated[n.path] = false;
        if (n.children) {
          for (const child of n.children) {
            recurse(child);
          }
        }
      }
      recurse(node);
      return updated;
    });
  }

  /**
   * Removes the root from the view (like the user closed it).
   */
  function closeRoot() {
    setRootNode(null);
    setNodeStates({});
    setExpandedStates({});
    parentMapRef.current = null;
  }

  /**
   * Toggles a node's expansion state (arrow click).
   */
  function toggleExpand(nodePath: string) {
    setExpandedStates((prev) => ({
      ...prev,
      [nodePath]: !prev[nodePath]
    }));
  }

  /**
   * Sets all nodes in a subtree to newState. For directories, recursively modifies children.
   */
  function setSubtreeState(node: TreeNode, newState: NodeState, updated: Record<string, NodeState>) {
    updated[node.path] = newState;
    if (node.children) {
      for (const child of node.children) {
        setSubtreeState(child, newState, updated);
      }
    }
  }

  /**
   * Recomputes ancestors' states to see if they become all, none, or partial.
   */
  function updateAncestorState(node: TreeNode, updated: Record<string, NodeState>) {
    if (!parentMapRef.current) return;

    let current = node;
    while (true) {
      const parent = parentMapRef.current.get(current.path);
      if (!parent) break; // no more parents, reached the root

      const siblings = parent.children || [];
      let allAll = true;
      let allNone = true;
      for (const s of siblings) {
        const sState = updated[s.path];
        if (sState !== 'all') {
          allAll = false;
        }
        if (sState !== 'none') {
          allNone = false;
        }
      }

      let parentState: NodeState = 'partial';
      if (allAll) parentState = 'all';
      if (allNone) parentState = 'none';

      updated[parent.path] = parentState;
      current = parent;
    }
  }

  /**
   * Handles user clicking a checkbox. We toggle all->none or none->all (partial->all).
   */
  function handleCheckboxChange(node: TreeNode) {
    if (node.type === 'file') {
      // For files, read the content and add it to the prompt
      window.electronAPI.readFile(node.path)
        .then((content: string) => {
          console.log('[FileTree] Read file content:', {
            path: node.path,
            contentLength: content.length
          });
          // Get the language based on file extension
          const ext = node.path.split('.').pop()?.toLowerCase() || '';
          const language = ext;
          // Add the file block to the prompt
          window.electronAPI.sendMessage('add-file-block', {
            path: node.path,
            content,
            language
          });
        })
        .catch((err) => {
          console.error('[FileTree] Failed to read file:', node.path, err);
        });
    }

    setNodeStates((prev) => {
      const updated = { ...prev };
      const currentState = updated[node.path];
      const newState: NodeState = currentState === 'all' ? 'none' : 'all';

      if (node.type === 'directory') {
        setSubtreeState(node, newState, updated);
      } else {
        updated[node.path] = newState;
      }

      updateAncestorState(node, updated);
      return updated;
    });
  }

  /**
   * Renders the root directory's top-level UI with "Collapse All" and "Close" buttons.
   */
  function renderRootNode(root: TreeNode) {
    const expanded = expandedStates[root.path] || false;
    const state = nodeStates[root.path] || 'none';

    const onCollapseAll = () => {
      // Expand the root first to ensure children are visible, then collapse them all
      setExpandedStates((prev) => ({ ...prev, [root.path]: true }));
      collapseAllSubtree(root);
    };

    return (
      <div className="ml-2" key={root.path}>
        {/* ARROW for the root folder */}
        <span
          className="mr-1 cursor-pointer"
          onClick={() => toggleExpand(root.path)}
        >
          {expanded ? '▾' : '▸'}
        </span>

        {/* Tri-state checkbox */}
        <input
          ref={(el) => el && checkboxRefs.current.set(root.path, el)}
          type="checkbox"
          className="mr-1"
          checked={state === 'all'}
          onChange={() => handleCheckboxChange(root)}
        />

        {/* Folder icon & name */}
        <span className="cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-600 rounded px-1 inline-block">
          {expanded ? '📂' : '📁'}
          &nbsp;{root.name}
        </span>

        {/* Buttons */}
        <button
          className="ml-2 text-xs border border-gray-500 rounded px-1 py-0.5 hover:bg-gray-200 dark:hover:bg-gray-700"
          onClick={onCollapseAll}
        >
          Collapse All
        </button>
        <button
          className="ml-1 text-xs border border-gray-500 rounded px-1 py-0.5 hover:bg-red-200 dark:hover:bg-red-600"
          onClick={closeRoot}
        >
          Close
        </button>

        {/* Children (subfolders/files) */}
        {expanded && root.children && (
          <div className="mt-1">
            {root.children.map((child) => renderNode(child))}
          </div>
        )}
      </div>
    );
  }

  /**
   * Renders a single node in the tree (non-root). 
   *  - arrow if directory
   *  - tri-state checkbox
   *  - expansion if directory & expanded
   */
  function renderNode(node: TreeNode): JSX.Element {
    const expanded = expandedStates[node.path] || false;
    const state = nodeStates[node.path] || 'none';

    return (
      <div key={node.path} className="ml-4">
        {/* Arrow (directory only) */}
        {node.type === 'directory' ? (
          <span
            className="mr-1 cursor-pointer"
            onClick={() => toggleExpand(node.path)}
          >
            {expanded ? '▾' : '▸'}
          </span>
        ) : (
          /* If it's a file, just align properly */
          <span className="mr-1" />
        )}

        {/* Tri-state checkbox */}
        <input
          ref={(el) => el && checkboxRefs.current.set(node.path, el)}
          type="checkbox"
          className="mr-1"
          checked={state === 'all'}
          onChange={() => handleCheckboxChange(node)}
        />

        {/* Icon & name */}
        <span className="cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-600 rounded px-1 inline-block">
          {node.type === 'directory' ? (expanded ? '📂' : '📁') : '📄'}
          &nbsp;{node.name}
        </span>

        {/* Children (if directory and expanded) */}
        {node.type === 'directory' && expanded && node.children && (
          <div className="mt-1">
            {node.children.map((child) => renderNode(child))}
          </div>
        )}
      </div>
    );
  }

  // If rootNode is null, user closed or not loaded. If there's an error, display it; otherwise "No folder loaded".
  if (!rootNode) {
    if (error) {
      return <div className="text-red-500 text-sm p-2">Error: {error}</div>;
    }
    return <div className="p-2 text-gray-800 dark:text-gray-200">No folder loaded.</div>;
  }

  // Render the root node
  return (
    <div className="overflow-y-auto">
      {renderRootNode(rootNode)}
    </div>
  );
};

export default FileTree;
