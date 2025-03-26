
/**
 * @file FileTree.tsx
 * @description
 * A simpler component now that we rely on ProjectContext for tri-state selection, 
 * expansions, and directory data. 
 *
 * Responsibilities:
 *  1) Renders the root folder(s) from the array of folder paths given via props.folders
 *  2) For each folder path, we call useProject().getDirectoryListing(folderPath) to get or load 
 *     the tree data from the context's cache.
 *  3) We use ProjectContext's nodeStates to decide which node is 'none', 'all', or 'partial'
 *  4) We use ProjectContext's expandedPaths to decide if a directory is expanded
 *  5) We call toggleNodeSelection and toggleExpansion from ProjectContext 
 *     instead of using local state to manage tri-state or expansions
 *
 * Props:
 *  - folders: string[]  The root directories user added
 *  - onRemoveFolder(folderPath: string): removes a root folder from parent's state
 *
 * Implementation details:
 *  - This merges the multi-root logic: for each folder path, we fetch or display the tree
 *  - We do not store node states or expansions in local state; we read from context
 *  - The tri-state logic is now in ProjectContext, so we just display the correct icon 
 *    based on nodeStates[node.path]
 *
 * Known Limitations:
 *  - If the user loads a large folder, it might be slow. We rely on ProjectContext caching and 
 *    asynchronous file reading to mitigate performance issues.
 */

import React, { useEffect, useState } from 'react';
import { useProject, TreeNode } from '../../context/ProjectContext';

type NodeState = 'none' | 'all' | 'partial';

interface FileTreeProps {
  /**
   * An array of folder paths that the user has added as root-level directories.
   */
  folders: string[];

  /**
   * Callback invoked when the user removes a folder from the UI.
   */
  onRemoveFolder: (folderPath: string) => void;
}

const FileTree: React.FC<FileTreeProps> = ({ folders, onRemoveFolder }) => {
  const {
    getDirectoryListing,
    nodeStates,
    expandedPaths,
    toggleNodeSelection,
    toggleExpansion,
    collapseSubtree
  } = useProject();

  /**
   * We store a local array of { rootPath, node, error } to display each folder's tree. 
   * We do not keep expansions or node states here anymore. 
   */
  const [folderTrees, setFolderTrees] = useState<Array<{
    rootPath: string;
    node: TreeNode | null;
    error: string | null;
  }>>([]);

  /**
   * Whenever 'folders' changes, we add or remove folderTrees. 
   * We do an effect for each new folder, fetch from getDirectoryListing, store in folderTrees.
   */
  useEffect(() => {
    // Remove any folderTrees that are no longer in the 'folders' prop
    setFolderTrees((prev) => prev.filter((ft) => folders.includes(ft.rootPath)));

    // For each newly added folder in 'folders', check if we already have it in folderTrees
    folders.forEach(async (folderPath) => {
      const existing = folderTrees.find((ft) => ft.rootPath === folderPath);
      if (!existing) {
        // placeholder entry
        setFolderTrees((prev2) => [
          ...prev2,
          {
            rootPath: folderPath, // <-- FIX: previously used rootPath alone; now corrected
            node: null,
            error: null
          }
        ]);

        // attempt to load directory listing
        const listing = await getDirectoryListing(folderPath);
        if (!listing) {
          setFolderTrees((prev2) =>
            prev2.map((ft) =>
              ft.rootPath === folderPath
                ? { ...ft, error: 'Failed to load directory tree' }
                : ft
            )
          );
          return;
        }

        // Build a root node
        const rootNode: TreeNode = {
          name: listing.baseName,
          path: listing.absolutePath,
          type: 'directory',
          children: listing.children
        };

        // store the loaded node
        setFolderTrees((prev2) =>
          prev2.map((ft) =>
            ft.rootPath === folderPath
              ? { ...ft, node: rootNode, error: null }
              : ft
          )
        );
      }
    });

    // We intentionally do not place folderTrees in the dependency array because
    // we want to check for new additions but avoid infinite re-fetching. 
    // This is a minimal approach for demonstration. 
    // In a real scenario, we'd structure this carefully or use a separate effect 
    // if we needed to handle repeated folder additions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folders]);

  /**
   * Renders a tri-state check icon for a node. 
   */
  function renderSelectionIcon(nodePath: string, nodeType: 'file'|'directory') {
    const st = nodeStates[nodePath] || 'none';

    // We'll define a callback for toggling this node
    const onClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      const foundFolder = folderTrees.find((ft) => {
        // see if ft.node has the same absolute path or if nodePath is inside that root
        return ft.node && nodePath.startsWith(ft.node.path);
      });
      // foundFolder might not be correct if there are multiple roots, 
      // but typically node belongs to one root
      // We'll rely on context's toggleNodeSelection needing the actual TreeNode. 
      // We can do a BFS/DFS to find the node in that folder's tree:
      if (!foundFolder || !foundFolder.node) return;
      const node = findNodeByPath(foundFolder.node, nodePath);
      if (node) {
        toggleNodeSelection(node);
      }
    };

    function iconSvg(type: NodeState) {
      if (type === 'all') {
        return (
          <svg viewBox="0 0 24 24" className="h-4 w-4 text-blue-500" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="m9 12 2 2 4-4" />
          </svg>
        );
      } else if (type === 'partial') {
        return (
          <svg viewBox="0 0 24 24" className="h-4 w-4 text-blue-500" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M8 12h8" />
          </svg>
        );
      } else {
        // none
        return (
          <svg viewBox="0 0 24 24" className="h-4 w-4 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
          </svg>
        );
      }
    }

    if (nodeType === 'file' || nodeType === 'directory') {
      return (
        <span onClick={onClick} className="cursor-pointer mr-2">
          {iconSvg(st)}
        </span>
      );
    }
    return null;
  }

  /**
   * Renders a small folder icon, open or closed, or blank for files.
   */
  function renderFolderIcon(node: TreeNode) {
    if (node.type === 'file') {
      return <span className="w-4 mr-1" />;
    }
    // directory
    const isExpanded = expandedPaths[node.path] || false;
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
    // closed
    return (
      <span className="mr-1 text-gray-600 dark:text-gray-200">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 
                  7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>
        </svg>
      </span>
    );
  }

  /**
   * Recursively render children if directory is expanded
   */
  function renderNode(node: TreeNode, depth: number = 0): JSX.Element {
    const isExpanded = expandedPaths[node.path] || false;
    const onFolderClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      toggleExpansion(node.path);
    };

    return (
      <div key={node.path}>
        <div
          className="flex items-center text-sm py-1"
          style={{ paddingLeft: depth * 18 }}
        >
          {renderSelectionIcon(node.path, node.type)}
          <span 
            className="cursor-pointer flex items-center"
            onClick={node.type === 'directory' ? onFolderClick : undefined}
          >
            {renderFolderIcon(node)}
          </span>
          <span className="truncate overflow-hidden whitespace-nowrap max-w-[140px] text-gray-800 dark:text-gray-100">
            {node.name}
          </span>
        </div>
        {node.type === 'directory' && isExpanded && node.children && (
          <div>
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  }

  /**
   * findNodeByPath: BFS or DFS in the folder tree to find the node by path
   */
  function findNodeByPath(root: TreeNode, targetPath: string): TreeNode | null {
    if (root.path === targetPath) return root;
    if (!root.children) return null;
    for (const c of root.children) {
      const found = findNodeByPath(c, targetPath);
      if (found) return found;
    }
    return null;
  }

  function renderRootFolder(item: {
    rootPath: string;
    node: TreeNode | null;
    error: string | null;
  }) {
    const { rootPath, node, error } = item;
    if (error) {
      return (
        <div key={rootPath} className="text-red-500 text-xs mb-2">
          Failed to load folder: {rootPath}
        </div>
      );
    }
    if (!node) {
      return (
        <div key={rootPath} className="text-gray-500 text-xs mb-2">
          Loading {rootPath}...
        </div>
      );
    }

    const isExpanded = expandedPaths[node.path] || false;
    const onFolderClick = () => {
      toggleExpansion(node.path);
    };

    const handleCollapseClick = () => {
      collapseSubtree(node);
    };
    const handleRemoveFolder = () => {
      onRemoveFolder(rootPath);
    };

    return (
      <div key={rootPath} className="mb-2">
        <div className="flex items-center bg-transparent p-1">
          {/* Tri-state icon for root */}
          {renderSelectionIcon(node.path, node.type)}

          {/* Folder icon */}
          <span onClick={onFolderClick} className="cursor-pointer flex items-center">
            {renderFolderIcon(node)}
          </span>

          {/* Folder name */}
          <span 
            className="truncate overflow-hidden whitespace-nowrap max-w-[140px] text-gray-800 dark:text-gray-100 font-semibold"
            onClick={onFolderClick}
          >
            {node.name}
          </span>

          {/* Buttons */}
          <div className="flex items-center ml-2">
            <button
              onClick={handleCollapseClick}
              className="mr-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
              title="Collapse entire subtree"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 3h14"/>
                <path d="m18 13-6-6-6 6"/>
                <path d="M12 7v14"/>
              </svg>
            </button>
            <button
              onClick={handleRemoveFolder}
              className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
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
        {node.type === 'directory' && isExpanded && node.children && node.children.length > 0 && (
          <div className="pl-6">
            {node.children.map((child) => renderNode(child, 1))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-full h-full text-xs text-gray-800 dark:text-gray-100">
      {folderTrees.length === 0 && (
        <div className="text-gray-500 italic">
          No folders added. Click "Add Folder" to include your project.
        </div>
      )}
      {folderTrees.map((item) => renderRootFolder(item))}
    </div>
  );
};

export default FileTree;
