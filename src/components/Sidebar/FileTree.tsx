/**
 * @file FileTree.tsx
 * @description
 * A simpler component that renders the root folder(s) from projectFolders
 * and provides tri-state selection for files/folders.
 *
 * Accessibility Improvements (Step 5):
 *  - We replaced the clickable <span> for tri-state selection with a more accessible approach:
 *    - role="button", tabIndex=0, aria-label, and a keyDown handler so keyboard users can toggle.
 *  - This ensures that the user can tab to the element and press Enter to change the selection.
 *
 * Key Responsibilities:
 *  1) Display the file/folder structure from directoryCache
 *  2) Use ProjectContext nodeStates for tri-state selection
 *  3) Manage expansions, toggling directories, removing root folders
 *
 * Implementation notes:
 *  - Because we keep tri-state logic in ProjectContext, we just call toggleNodeSelection(node).
 *  - We ensure that interactive icons have appropriate ARIA labels or titles for screen readers.
 *  - We do not transform the node into a button <button> because we want to keep the icon layout.
 *    Instead, we add role="button" and tabIndex=0 plus keyDown for accessibility.
 */

import React, { useEffect } from 'react';
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
    collapseSubtree,
    directoryCache,
    refreshFolders,
  } = useProject();

  /**
   * For each folder path in props, ensure it's loaded into directoryCache
   */
  useEffect(() => {
    folders.forEach(async folderPath => {
      if (!directoryCache[folderPath]) {
        await getDirectoryListing(folderPath);
      }
    });
  }, [folders, directoryCache, getDirectoryListing]);

  /**
   * Renders a tri-state check icon for a node with proper ARIA attributes
   */
  function renderSelectionIcon(nodePath: string, nodeType: 'file' | 'directory') {
    const st = nodeStates[nodePath] || 'none';

    // We'll define a callback for toggling this node
    const onClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      const node = findNodeByPath(nodePath);
      if (node) {
        toggleNodeSelection(node);
      } else {
        console.error(`[FileTree] Could not find node with path ${nodePath}`);
      }
    };

    // Keyboard support for toggling selection
    const onKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        const node = findNodeByPath(nodePath);
        if (node) {
          toggleNodeSelection(node);
        }
      }
    };

    function iconSvg(type: NodeState) {
      if (type === 'all') {
        return (
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4 text-blue-500"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="m9 12 2 2 4-4" />
          </svg>
        );
      } else if (type === 'partial') {
        return (
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4 text-blue-500"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M8 12h8" />
          </svg>
        );
      } else {
        // none
        return (
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4 text-gray-600 dark:text-gray-300"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
          </svg>
        );
      }
    }

    // Provide an aria-label describing the action, plus role="button" and tabIndex=0 for keyboard
    return (
      <span
        onClick={onClick}
        onKeyDown={onKeyDown}
        role="button"
        tabIndex={0}
        aria-label="Toggle file selection"
        className="mr-2 inline-flex items-center cursor-pointer"
      >
        {iconSvg(st)}
      </span>
    );
  }

  /**
   * Creates a new folder inside the specified directory
   */
  async function createFolder(parentPath: string) {
    if (!window?.electronAPI?.createFolder) {
      console.error('[FileTree] createFolder: electronAPI.createFolder not available');
      return;
    }

    try {
      const newFolderPath = await window.electronAPI.createFolder({
        parentPath,
        folderName: 'Untitled Folder',
      });

      if (newFolderPath) {
        toggleExpansion(parentPath);
        if (refreshFolders) {
          await refreshFolders([parentPath]);
        }
      } else {
        console.error('[FileTree] Failed to create new folder');
      }
    } catch (err) {
      console.error('[FileTree] Error creating folder:', err);
    }
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
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" />
          </svg>
        </span>
      );
    }
    // closed
    return (
      <span className="mr-1 text-gray-600 dark:text-gray-200">
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path
            d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9
               a2 2 0 0 1-1.69-.9l-.81-1.2
               A2 2 0 0 0 7.93 3H4
               a2 2 0 0 0-2 2v13
               a2 2 0 0 0 2 2Z"
          />
        </svg>
      </span>
    );
  }

  /**
   * Find a node by its path in the directoryCache
   */
  function findNodeByPath(targetPath: string): TreeNode | null {
    // Check if this is a root folder
    if (directoryCache[targetPath]) {
      const listing = directoryCache[targetPath];
      return {
        name: listing.baseName,
        path: listing.absolutePath,
        type: 'directory',
        children: listing.children,
      };
    }

    // Otherwise search through all folders
    for (const rootPath in directoryCache) {
      if (!directoryCache[rootPath]) continue;

      const rootNode = {
        name: directoryCache[rootPath].baseName,
        path: directoryCache[rootPath].absolutePath,
        type: 'directory' as const,
        children: directoryCache[rootPath].children,
      };

      function searchNode(node: TreeNode): TreeNode | null {
        if (node.path === targetPath) return node;
        if (!node.children) return null;

        for (const child of node.children) {
          const found = searchNode(child);
          if (found) return found;
        }

        return null;
      }

      const found = searchNode(rootNode);
      if (found) return found;
    }

    return null;
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

    const className = `flex items-start py-1 ${
      depth > 0 ? 'pl-4' : ''
    } hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors duration-100`;

    if (node.type === 'directory') {
      return (
        <div key={node.path}>
          <div className={className}>
            <div className="flex items-center flex-grow cursor-pointer" onClick={onFolderClick}>
              {renderSelectionIcon(node.path, 'directory')}
              {renderFolderIcon(node)}
              <span className="ml-1 text-gray-800 dark:text-gray-200 text-sm truncate">
                {node.name}
              </span>
            </div>
          </div>
          {isExpanded && node.children && (
            <div className="ml-4 border-l border-gray-300 dark:border-gray-600">
              {node.children.map(child => renderNode(child, depth + 1))}
            </div>
          )}
        </div>
      );
    } else {
      // type === 'file'
      return (
        <div key={node.path} className={className}>
          <div className="flex items-center">
            {renderSelectionIcon(node.path, 'file')}
            <svg
              className="h-4 w-4 text-gray-600 dark:text-gray-300"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7
                   a2 2 0 0 1-2-2V5
                   a2 2 0 0 1 2-2h5.586
                   a1 1 0 0 1 .707.293l5.414 5.414
                   a1 1 0 0 1 .293.707V19
                   a2 2 0 0 1-2 2z"
              />
            </svg>
            <span className="ml-1 text-gray-800 dark:text-gray-200 text-sm truncate">
              {node.name}
            </span>
          </div>
        </div>
      );
    }
  }

  /**
   * Renders a root folder (top-level directory)
   */
  function renderRootFolder(folderPath: string) {
    const listing = directoryCache[folderPath];

    if (!listing) {
      return (
        <div key={folderPath} className="text-gray-500 text-xs mb-2">
          Loading {folderPath}...
        </div>
      );
    }

    const node: TreeNode = {
      name: listing.baseName,
      path: listing.absolutePath,
      type: 'directory',
      children: listing.children,
    };

    const isExpanded = expandedPaths[node.path] || false;

    const onFolderClick = () => {
      toggleExpansion(node.path);
    };

    const handleCollapseClick = () => {
      collapseSubtree(node);
    };

    const handleRemoveFolder = () => {
      onRemoveFolder(folderPath);
    };

    return (
      <div key={folderPath} className="mb-2">
        <div className="flex items-center bg-transparent p-1">
          {/* Tri-state icon for root */}
          {renderSelectionIcon(node.path, 'directory')}

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
              aria-label="Collapse entire subtree"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M5 3h14" />
                <path d="m18 13-6-6-6 6" />
                <path d="M12 7v14" />
              </svg>
            </button>
            <button
              onClick={handleRemoveFolder}
              className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
              title="Remove folder"
              aria-label="Remove folder"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <circle cx="9" cy="9" r="7" />
                <path d="m12 6-6 6" />
                <path d="m6 6 6 6" />
              </svg>
            </button>
          </div>
        </div>

        {/* If expanded, render children */}
        {isExpanded && node.children && node.children.length > 0 && (
          <div className="pl-6">{node.children.map(child => renderNode(child, 1))}</div>
        )}
      </div>
    );
  }

  return (
    <div className="w-full h-full text-xs text-gray-800 dark:text-gray-100">
      {folders.length === 0 && (
        <div className="text-gray-500 italic">
          No folders added. Click &quot;Add Folder&quot; to include your project.
        </div>
      )}
      {folders.map(folderPath => renderRootFolder(folderPath))}
    </div>
  );
};

export default FileTree;
