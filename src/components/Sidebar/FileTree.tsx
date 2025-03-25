
/**
 * @file FileTree.tsx
 * @description
 * A React component that displays a project's file tree with tri-state checkboxes.
 * The user can expand/collapse directories and select/unselect files or folders.
 * Step 3 Changes:
 *  - Removed the "Add selected to prompt" button from this UI.
 *  - Removed the local "selected token usage" and the button at the bottom.
 *  - Each time file selections change, we call prompt.updateSelectedFiles(...) to store
 *    the selection in the PromptContext, which is responsible for usage calculations.
 *  - The usage is now displayed in the bottom of the sidebar (Sidebar.tsx), not here.
 *
 * Tri-State Explanation:
 *  - "none": File/folder is not selected
 *  - "all": File/folder is fully selected
 *  - "partial": For directories only; some children are selected, others not
 *
 * Data Flows:
 *  1) We load the tree from 'listDirectory' via IPC.
 *  2) nodeStates track user selections. We gather selected files and read them from disk.
 *  3) Instead of local usage, we send them to prompt.updateSelectedFiles(...) for global usage tracking.
 *
 * Dependencies:
 *  - window.electronAPI for listDirectory, readFile
 *  - usePrompt from PromptContext for updateSelectedFiles
 */

import React, { useEffect, useState, useRef } from 'react';
import { usePrompt } from '../../context/PromptContext';

type NodeState = 'all' | 'none' | 'partial';

/**
 * Node in the file tree returned by the main process
 */
export interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: TreeNode[];
}

/**
 * The interface we expect back from "list-directory" in the main process.
 */
interface ListDirectoryResult {
  absolutePath: string;
  baseName: string;
  children: TreeNode[];
}

interface FileTreeProps {
  rootPath?: string;
}

declare global {
  interface Window {
    electronAPI: {
      listDirectory: (path: string) => Promise<ListDirectoryResult>;
      readFile: (path: string) => Promise<string>;
    };
  }
}

const FileTree: React.FC<FileTreeProps> = ({ rootPath = '.' }) => {
  const { updateSelectedFiles } = usePrompt();
  const [rootNode, setRootNode] = useState<TreeNode | null>(null);

  // Track tri-state for each node by path
  const [nodeStates, setNodeStates] = useState<Record<string, NodeState>>({});

  // Track expansions
  const [expandedStates, setExpandedStates] = useState<Record<string, boolean>>({});

  // For storing file contents of selected files
  const [selectedFileContents, setSelectedFileContents] = useState<Record<string, string>>({});

  // We no longer store usage or show the "Add selected to prompt" button here.
  // That logic is moved to PromptBuilder or the bottom of Sidebar.

  const [error, setError] = useState<string | null>(null);
  const checkboxRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const parentMapRef = useRef<Map<string, TreeNode> | null>(null);

  /**
   * On component mount, load the directory tree via IPC.
   */
  useEffect(() => {
    if (!window.electronAPI?.listDirectory) {
      setError('No electronAPI.listDirectory function found.');
      return;
    }

    window.electronAPI
      .listDirectory(rootPath)
      .then((result) => {
        const newRootNode: TreeNode = {
          name: result.baseName,
          path: result.absolutePath,
          type: 'directory',
          children: result.children
        };

        const newNodeStates: Record<string, NodeState> = {};
        const newExpandedStates: Record<string, boolean> = {};

        // Initialize states to none/collapsed
        function initNodeStates(node: TreeNode) {
          newNodeStates[node.path] = 'none';
          newExpandedStates[node.path] = false;
          if (node.children) {
            for (const child of node.children) {
              initNodeStates(child);
            }
          }
        }
        initNodeStates(newRootNode);

        // Build parent map for partial selection logic
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

  /**
   * After nodeStates changes, set the checkbox "indeterminate" property for partial states.
   */
  useEffect(() => {
    Object.entries(nodeStates).forEach(([thePath, state]) => {
      const checkbox = checkboxRefs.current.get(thePath);
      if (checkbox) {
        checkbox.indeterminate = state === 'partial';
      }
    });
  }, [nodeStates]);

  /**
   * Re-scan which files are selected, read them from disk if not cached,
   * remove them from the cache if unselected, then update the PromptContext.
   */
  useEffect(() => {
    if (!rootNode) return;

    // 1) Collect all file paths that are 'all'
    const selectedPaths: string[] = [];
    function gatherSelectedFiles(node: TreeNode) {
      if (node.type === 'file' && nodeStates[node.path] === 'all') {
        selectedPaths.push(node.path);
      } else if (node.type === 'directory' && node.children) {
        node.children.forEach(gatherSelectedFiles);
      }
    }
    gatherSelectedFiles(rootNode);

    // 2) Remove stale file paths from the cache
    setSelectedFileContents((prev) => {
      const updated: Record<string, string> = {};
      for (const p of Object.keys(prev)) {
        if (selectedPaths.includes(p)) {
          updated[p] = prev[p];
        }
      }

      // 3) For newly selected file paths, read them from disk
      const newPaths = selectedPaths.filter((p) => !(p in updated));
      if (newPaths.length > 0) {
        Promise.all(
          newPaths.map((filePath) =>
            window.electronAPI
              .readFile(filePath)
              .then((content) => ({ path: filePath, content }))
              .catch((err) => {
                console.error('[FileTree] Error reading file:', filePath, err);
                return null;
              })
          )
        ).then((results) => {
          const successfulReads = results.filter(Boolean) as {
            path: string;
            content: string;
          }[];
          if (successfulReads.length > 0) {
            setSelectedFileContents((current) => {
              const newContents = { ...current };
              for (const { path, content } of successfulReads) {
                newContents[path] = content;
              }
              return newContents;
            });
          }
        });
      }

      return updated;
    });
  }, [nodeStates, rootNode]);

  /**
   * Whenever selectedFileContents changes, update the PromptContext with them.
   */
  useEffect(() => {
    updateSelectedFiles(selectedFileContents);
  }, [selectedFileContents, updateSelectedFiles]);

  /**
   * handleCheckboxChange toggles node state among 'all' / 'none'. For directories,
   * we apply the newState to the entire subtree. Then we update ancestor states.
   */
  function handleCheckboxChange(node: TreeNode) {
    setNodeStates((prev) => {
      const updated = { ...prev };
      const currentState = updated[node.path];
      const newState: NodeState = currentState === 'all' ? 'none' : 'all';

      if (node.type === 'directory' && node.children) {
        setSubtreeState(node, newState, updated);
      } else {
        updated[node.path] = newState;
      }

      updateAncestorState(node, updated);
      return updated;
    });
  }

  /**
   * setSubtreeState recursively sets all children to the same node state.
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
   * updateAncestorState recomputes the parent's nodeState for partial/all/none.
   */
  function updateAncestorState(node: TreeNode, updated: Record<string, NodeState>) {
    if (!parentMapRef.current) return;
    let current = node;
    while (true) {
      const parent = parentMapRef.current.get(current.path);
      if (!parent) break;

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
   * toggleExpand toggles a directory open/closed.
   */
  function toggleExpand(nodePath: string) {
    setExpandedStates((prev) => ({
      ...prev,
      [nodePath]: !prev[nodePath]
    }));
  }

  /**
   * For "collapse all" from the root.
   */
  function collapseAllSubtree(node: TreeNode) {
    setExpandedStates((prev) => {
      const updated = { ...prev };
      function recurse(n: TreeNode) {
        updated[n.path] = false;
        if (n.children) {
          n.children.forEach(recurse);
        }
      }
      recurse(node);
      return updated;
    });
  }

  /**
   * closeRoot clears the entire display. (rarely used, but for completeness).
   */
  function closeRoot() {
    setRootNode(null);
    setNodeStates({});
    setExpandedStates({});
    setSelectedFileContents({});
    parentMapRef.current = null;
  }

  /**
   * Renders the root node (the top-level directory). We show a collapse & close button.
   */
  function renderRootNode(root: TreeNode) {
    const expanded = expandedStates[root.path] || false;
    const state = nodeStates[root.path] || 'none';

    const onCollapseAll = () => {
      setExpandedStates((prev) => ({ ...prev, [root.path]: true }));
      collapseAllSubtree(root);
    };

    return (
      <div className="ml-2" key={root.path}>
        <span className="mr-1 cursor-pointer" onClick={() => toggleExpand(root.path)}>
          {expanded ? '▾' : '▸'}
        </span>

        <input
          ref={(el) => el && checkboxRefs.current.set(root.path, el)}
          type="checkbox"
          className="mr-1"
          checked={state === 'all'}
          onChange={() => handleCheckboxChange(root)}
        />

        <span className="cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-600 rounded px-1 inline-block">
          {expanded ? '📂' : '📁'} {root.name}
        </span>

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

        {expanded && root.children && <div className="mt-1">{root.children.map(renderNode)}</div>}
      </div>
    );
  }

  /**
   * Renders a file or directory node below the root.
   */
  function renderNode(node: TreeNode) {
    const expanded = expandedStates[node.path] || false;
    const state = nodeStates[node.path] || 'none';

    return (
      <div key={node.path} className="ml-4">
        {node.type === 'directory' ? (
          <span className="mr-1 cursor-pointer" onClick={() => toggleExpand(node.path)}>
            {expanded ? '▾' : '▸'}
          </span>
        ) : (
          <span className="mr-1" />
        )}

        <input
          ref={(el) => el && checkboxRefs.current.set(node.path, el)}
          type="checkbox"
          className="mr-1"
          checked={state === 'all'}
          onChange={() => handleCheckboxChange(node)}
        />

        <span className="cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-600 rounded px-1 inline-block">
          {node.type === 'directory' ? (expanded ? '📂 ' : '📁 ') : '📄 '}
          {node.name}
        </span>

        {node.type === 'directory' && expanded && node.children && (
          <div className="mt-1">{node.children.map(renderNode)}</div>
        )}
      </div>
    );
  }

  if (!rootNode) {
    if (error) {
      return <div className="text-red-500 text-sm p-2">Error: {error}</div>;
    }
    return <div className="p-2 text-gray-800 dark:text-gray-200">No folder loaded.</div>;
  }

  return <div className="flex flex-col h-full overflow-y-auto">{renderRootNode(rootNode)}</div>;
};

export default FileTree;
