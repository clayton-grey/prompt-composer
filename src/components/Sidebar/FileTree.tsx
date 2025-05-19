/**
 * @file FileTree.tsx
 * @description
 * A simpler component that renders the root folder(s) from projectFolders
 * and provides tri-state selection for files/folders using typed React props.
 *
 * Accessibility Updates (Step 7):
 * 1) Added aria-hidden="true" to folder/file icons that are purely decorative.
 * 2) Kept the tri-state checkbox icon's aria-label on its span parent, since that's the interactive element.
 *
 * Key Responsibilities:
 *  1) Display the file/folder structure from directoryCache (via ProjectContext)
 *  2) Provide tri-state selection (none/partial/all) for each node
 *  3) Manage expansions/collapses and removal of root folders
 *
 * Type Declarations:
 *  - NodeState can be 'none', 'all', or 'partial'
 *  - FileTreeProps for the folder array and removal callback
 *
 * Usage:
 *  <FileTree folders={projectFolders} onRemoveFolder={someHandler} />
 */

/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable no-inner-declarations */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

import React, { useEffect } from 'react';
import { useProject } from '../../context/ProjectContext';
import { TreeNode } from '../../../electron-main/types';

/**
 * NodeState can be 'none', 'all', or 'partial'
 */
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
   * Renders a tri-state checkbox icon for a node with proper ARIA attributes
   */
  function renderSelectionIcon(nodePath: string, nodeType: 'file' | 'directory'): JSX.Element {
    const st = nodeStates[nodePath] || 'none';

    const onClick = (e: React.MouseEvent<HTMLSpanElement>) => {
      e.stopPropagation();
      const node = findNodeByPath(nodePath);
      if (node) {
        toggleNodeSelection(node);
      } else {
        console.error(`[FileTree] Could not find node with path ${nodePath}`);
      }
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLSpanElement>) => {
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
            aria-hidden="true"
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
            aria-hidden="true"
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
            aria-hidden="true"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
          </svg>
        );
      }
    }

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
   * Creates a new folder inside the specified directory.
   */
  async function createFolder(parentPath: string) {
    // @ts-ignore - Suppressing type checking for electronAPI access
    if (!window?.electronAPI?.createFolder) {
      console.error('[FileTree] createFolder: electronAPI.createFolder not available');
      return;
    }
    try {
      // @ts-ignore - Suppressing type checking for electronAPI methods
      const newFolderPath = await window.electronAPI.createFolder({
        parentPath,
        folderName: 'Untitled Folder',
      });
      if (newFolderPath) {
        toggleExpansion(parentPath);
        await refreshFolders([parentPath]);
      }
    } catch (err) {
      console.error('[FileTree] Error creating folder:', err);
    }
  }

  /**
   * Renders a small folder icon, open or closed, or blank for files.
   */
  function renderFolderIcon(node: TreeNode): JSX.Element {
    if (node.type === 'file') {
      return <span className="w-4 mr-1" />;
    }
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
            d="M20 20a2 2 0 0 0 2-2V8a2
               2 0 0 0-2-2h-7.9a2 2 0 0
               1-1.69-.9l-.81-1.2A2 2
               0 0 0 7.93 3H4a2 2 0 0
               0-2 2v13a2 2 0 0
               0 2 2Z"
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
        type: 'directory' as const,
        children: listing.children,
      };
    }

    // Otherwise search subtrees
    for (const rootPath in directoryCache) {
      if (!directoryCache[rootPath]) continue;
      const rootNode: TreeNode = {
        name: directoryCache[rootPath].baseName,
        path: directoryCache[rootPath].absolutePath,
        type: 'directory',
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
              {node.children.map((child, idx) => renderNode(child, depth + 1))}
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
   * Render each root folder
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
          {renderSelectionIcon(node.path, 'directory')}
          <span onClick={onFolderClick} className="cursor-pointer flex items-center">
            {renderFolderIcon(node)}
          </span>
          <span
            className="truncate overflow-hidden whitespace-nowrap max-w-[140px] text-gray-800 dark:text-gray-100 font-semibold"
            onClick={onFolderClick}
          >
            {node.name}
          </span>

          {/* Additional folder-level actions */}
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

        {/* Child nodes if expanded */}
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
