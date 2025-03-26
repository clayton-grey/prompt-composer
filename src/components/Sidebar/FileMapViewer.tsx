
/**
 * @file FileMapViewer.tsx
 * @description
 * A React component for displaying (and optionally exporting) an ASCII-style map
 * of the project's file structure. Formerly, it directly called electronAPI.listDirectory.
 * Now, it calls getDirectoryListing from the ProjectContext to leverage caching.
 *
 * Key Changes in Step 3 (File & Directory Handling):
 *  1) Instead of window.electronAPI.listDirectory, we use getDirectoryListing(rootPath).
 *  2) We store that in local state as rootNode, and build the ASCII output from it.
 *  3) This ensures no repeated calls if multiple components request the same directory.
 *
 * Expand/Collapse in the UI is local to this component; the ASCII generation is 
 * always for the fully expanded tree. The user can copy or export the ASCII text.
 */

import React, { useEffect, useState } from 'react';
import { useProject, DirectoryListing, TreeNode } from '../../context/ProjectContext';

interface FileMapViewerProps {
  /**
   * The path at which to begin reading the directory structure.
   * Defaults to '.' if not specified.
   */
  rootPath?: string;
}

/**
 * FileMapViewer component. Shows a collapsible directory tree for reference, 
 * and can generate a fully expanded ASCII representation that can be copied 
 * or exported to a file. 
 */
const FileMapViewer: React.FC<FileMapViewerProps> = ({ rootPath = '.' }) => {
  const { getDirectoryListing } = useProject();

  const [rootNode, setRootNode] = useState<TreeNode | null>(null);
  const [expandedStates, setExpandedStates] = useState<Record<string, boolean>>({});
  const [asciiTree, setAsciiTree] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  /**
   * On mount or whenever rootPath changes, we load the directory listing from context.
   */
  useEffect(() => {
    async function loadData() {
      const listing = await getDirectoryListing(rootPath);
      if (!listing) {
        setError(`Failed to load directory for path: ${rootPath}`);
        setRootNode(null);
        return;
      }
      setError(null);

      // Create a new root node from the listing
      const newRoot: TreeNode = {
        name: listing.baseName,
        path: listing.absolutePath,
        type: 'directory',
        children: listing.children
      };

      // Initialize expansions to false for all discovered nodes
      const newExpanded: Record<string, boolean> = {};
      const initExpanded = (node: TreeNode) => {
        newExpanded[node.path] = false;
        if (node.children) {
          node.children.forEach(initExpanded);
        }
      };
      initExpanded(newRoot);

      setRootNode(newRoot);
      setExpandedStates(newExpanded);
      setAsciiTree(''); // Clear any old ASCII results
    }

    loadData();
  }, [rootPath, getDirectoryListing]);

  /**
   * Toggles expansion for a folder node.
   */
  const toggleExpand = (nodePath: string) => {
    setExpandedStates((prev) => ({
      ...prev,
      [nodePath]: !prev[nodePath]
    }));
  };

  /**
   * Recursively build ASCII lines from a node.
   */
  function buildAsciiLines(node: TreeNode, prefix: string = '', isLast: boolean = true): string[] {
    const lines: string[] = [];
    const nodeMarker = isLast ? '└── ' : '├── ';
    const label = node.name;
    lines.push(`${prefix}${nodeMarker}${label}`);

    if (node.type === 'directory' && node.children) {
      const childPrefix = prefix + (isLast ? '    ' : '│   ');
      node.children.forEach((child, idx) => {
        const childIsLast = idx === node.children!.length - 1;
        lines.push(...buildAsciiLines(child, childPrefix, childIsLast));
      });
    }
    return lines;
  }

  /**
   * Build the ASCII tree for rootNode, store it in asciiTree.
   */
  const generateAsciiTree = () => {
    if (!rootNode) return;
    const lines: string[] = [];
    lines.push('<file_map>');
    lines.push(rootNode.path);

    if (rootNode.children && rootNode.children.length > 0) {
      rootNode.children.forEach((child, idx) => {
        const isLast = idx === rootNode.children!.length - 1;
        const subtreeLines = buildAsciiLines(child, '', isLast);
        lines.push(...subtreeLines);
      });
    }
    lines.push('</file_map>');

    setAsciiTree(lines.join('\n'));
  };

  /**
   * Copy the asciiTree to clipboard
   */
  const handleCopy = async () => {
    if (!asciiTree) {
      console.warn('[FileMapViewer] ASCII tree is empty. Generate it first.');
      return;
    }
    try {
      await navigator.clipboard.writeText(asciiTree);
      console.log('[FileMapViewer] Copied file map to clipboard.');
    } catch (err) {
      console.error('[FileMapViewer] Failed to copy to clipboard:', err);
    }
  };

  /**
   * Exports asciiTree to a file via electronAPI.exportFileMap
   */
  const handleExport = async () => {
    if (!asciiTree) {
      console.warn('[FileMapViewer] ASCII tree is empty. Generate it first.');
      return;
    }
    if (!window.electronAPI?.exportFileMap) {
      console.warn('[FileMapViewer] Missing electronAPI.exportFileMap method.');
      return;
    }
    try {
      const defaultFileName = 'file_map.txt';
      const result = await window.electronAPI.exportFileMap({
        defaultFileName,
        fileMapContent: asciiTree
      });
      if (!result) {
        console.log('[FileMapViewer] User canceled or failed to export file map.');
      }
    } catch (err) {
      console.error('[FileMapViewer] Error exporting file map:', err);
    }
  };

  /**
   * Renders the collapsible directory structure in the UI 
   * (distinct from the ASCII representation).
   */
  const renderTree = (node: TreeNode, indent: number = 0): JSX.Element => {
    const isExpanded = expandedStates[node.path] || false;
    const hasChildren = node.type === 'directory' && node.children && node.children.length > 0;
    const toggleIcon = hasChildren ? (isExpanded ? '▾' : '▸') : ' ';

    const indentStyle = { marginLeft: indent * 16 };

    return (
      <div key={node.path}>
        <div
          className="flex items-center cursor-pointer"
          style={indentStyle}
          onClick={() => hasChildren && toggleExpand(node.path)}
        >
          <span className="mr-1">{toggleIcon}</span>
          <span className="text-gray-700 dark:text-gray-100">{node.name}{node.type === 'directory' ? '/' : ''}</span>
        </div>
        {hasChildren && isExpanded && (
          <div className="pl-4">
            {node.children!.map((child) => renderTree(child, indent + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-2">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
        File Map Viewer
      </h2>

      {error && (
        <div className="text-xs text-red-500 mb-2">
          {error}
        </div>
      )}

      {!rootNode ? (
        <div className="text-xs text-gray-600 dark:text-gray-300">
          Loading file map...
        </div>
      ) : (
        <>
          <div className="text-xs mb-2">
            <div className="font-medium">
              Root: <span className="italic">{rootNode.path}</span>
            </div>
            <div className="mt-1">
              {renderTree(rootNode, 0)}
            </div>
          </div>

          {/* Controls for ASCII generation */}
          <div className="flex gap-2 mb-2">
            <button
              onClick={generateAsciiTree}
              className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Generate ASCII Tree
            </button>
            <button
              onClick={handleCopy}
              className="px-2 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600"
            >
              Copy File Map
            </button>
            <button
              onClick={handleExport}
              className="px-2 py-1 text-xs bg-purple-500 text-white rounded hover:bg-purple-600"
            >
              Export File Map
            </button>
          </div>

          {asciiTree && (
            <div className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 rounded p-2 max-h-48 overflow-auto text-xs text-gray-800 dark:text-gray-100">
              <pre>{asciiTree}</pre>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default FileMapViewer;
