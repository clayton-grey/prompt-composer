
/**
 * @file FileMapViewer.tsx
 * @description
 * A React component for displaying and exporting a formatted, ASCII-style map
 * of the project's file structure. Mirrors the file/folder hierarchy displayed by
 * FileTree, but produces a single multiline string representation similar to how
 * "tree" commands or visual file browsers present directories.
 *
 * Key Responsibilities:
 *  1. Load the folder structure via Electron IPC (listDirectory).
 *  2. Recursively build an ASCII representation, with lines like:
 *       ├── dist
 *       │   ├── assets
 *       ...
 *       └── ...
 *  3. Wrap the final ASCII output in <file_map> ... </file_map>.
 *  4. Provide "Copy File Map" and "Export File Map" features so the user can:
 *       - Copy the ASCII text to clipboard for direct usage.
 *       - Export it to a file (like a .txt) via a standard file save dialog.
 *
 * Expand/Collapse Behavior:
 *  - Each directory node has a small toggle icon (▸ or ▾).
 *  - The ASCII output is always the fully expanded view to remain consistent.
 *    However, the UI can be collapsed so the user sees fewer lines visually.
 *
 * Usage Example:
 *   <FileMapViewer rootPath="." />
 *
 * Dependencies:
 *  - React for UI
 *  - window.electronAPI.listDirectory to load tree data
 *  - window.electronAPI.exportFileMap to save the ASCII output
 *
 * Edge Cases & Assumptions:
 *  - If rootPath doesn't exist or is unreadable, we display an error.
 *  - We only show text-based files (matching ALLOWED_EXTENSIONS in ipcHandlers).
 *  - The ASCII generation does not attempt to handle infinite recursion (e.g., symlinks).
 */

import React, { useEffect, useState } from 'react';

interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: TreeNode[];
}

/**
 * The interface we get back from 'list-directory'.
 */
interface ListDirectoryResult {
  absolutePath: string;
  baseName: string;
  children: TreeNode[];
}

interface FileMapViewerProps {
  /**
   * The path at which to begin reading the directory structure.
   * Defaults to '.', i.e., the current working directory of the Electron app.
   */
  rootPath?: string;
}

/**
 * FileMapViewer Component
 * @description
 * Renders a collapsible directory tree (similar to FileTree) but also provides
 * an ASCII representation of the entire tree that the user can copy or export.
 */
const FileMapViewer: React.FC<FileMapViewerProps> = ({ rootPath = '.' }) => {
  const [rootNode, setRootNode] = useState<TreeNode | null>(null);
  const [expandedStates, setExpandedStates] = useState<Record<string, boolean>>({});
  const [asciiTree, setAsciiTree] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!window.electronAPI?.listDirectory) {
      setError('Missing electronAPI.listDirectory');
      return;
    }

    window.electronAPI
      .listDirectory(rootPath)
      .then((result: ListDirectoryResult) => {
        // Create a new root node from the result
        const newRoot: TreeNode = {
          name: result.baseName,
          path: result.absolutePath,
          type: 'directory',
          children: result.children
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
        setError(null);
      })
      .catch((err) => {
        setError(`Failed to list directory: ${String(err)}`);
        console.error('[FileMapViewer] Error listing directory:', err);
      });
  }, [rootPath]);

  /**
   * Toggles the expansion state of a directory node by path.
   */
  const toggleExpand = (nodePath: string) => {
    setExpandedStates((prev) => ({
      ...prev,
      [nodePath]: !prev[nodePath]
    }));
  };

  /**
   * Recursively generate ASCII lines for a given node.
   * We pass "prefix" to handle indentation with lines like:
   *    ├── or └── or │
   *
   * @param node The current TreeNode to render
   * @param prefix The ASCII characters used for indentation
   * @param isLast Indicates if this node is the last child in its parent's list
   * @returns A string array of lines for this node and its children
   */
  const buildAsciiLines = (
    node: TreeNode,
    prefix: string = '',
    isLast: boolean = true
  ): string[] => {
    const lines: string[] = [];

    // Choose the node marker based on isLast
    const nodeMarker = isLast ? '└── ' : '├── ';

    // For directories, we add "folder" style icons
    const label = node.type === 'directory' ? node.name : node.name;

    // Build the line for this node
    lines.push(`${prefix}${nodeMarker}${label}`);

    // If directory, handle children
    if (node.type === 'directory' && node.children) {
      // For the child prefix, if we're not the last item, we pass "│   ", else "    "
      const childPrefix = prefix + (isLast ? '    ' : '│   ');

      node.children.forEach((child, idx) => {
        const childIsLast = idx === node.children!.length - 1;
        const subtree = buildAsciiLines(child, childPrefix, childIsLast);
        lines.push(...subtree);
      });
    }

    return lines;
  };

  /**
   * Build the ASCII tree for the entire rootNode
   * and store it in asciiTree state. Wrap with <file_map> ... </file_map> tags.
   */
  const generateAsciiTree = () => {
    if (!rootNode) return;

    const lines: string[] = [];
    lines.push('<file_map>');
    lines.push(rootNode.path);

    // For children
    if (rootNode.children) {
      rootNode.children.forEach((child, idx) => {
        const isLast = idx === rootNode.children!.length - 1;
        const subtreeLines = buildAsciiLines(child, '', isLast);
        // We indent these lines by 0 spaces from the root
        subtreeLines.forEach((line) => lines.push(line));
      });
    }
    lines.push('</file_map>');

    const finalText = lines.join('\n');
    setAsciiTree(finalText);
  };

  /**
   * Copy the asciiTree content to the clipboard.
   */
  const handleCopy = async () => {
    try {
      if (!asciiTree) {
        console.warn('[FileMapViewer] ASCII tree is empty. Generate it first.');
        return;
      }
      await navigator.clipboard.writeText(asciiTree);
      console.log('[FileMapViewer] Copied file map to clipboard.');
    } catch (err) {
      console.error('[FileMapViewer] Failed to copy to clipboard:', err);
    }
  };

  /**
   * Exports the asciiTree content to a file via a new IPC method "export-file-map".
   */
  const handleExport = async () => {
    if (!asciiTree) {
      console.warn('[FileMapViewer] ASCII tree is empty. Generate it first.');
      return;
    }
    if (!window.electronAPI?.exportFileMap) {
      console.warn('[FileMapViewer] Missing electronAPI.exportFileMap');
      return;
    }
    try {
      const defaultFileName = 'file_map.txt';
      const result = await window.electronAPI.exportFileMap({
        defaultFileName,
        fileMapContent: asciiTree
      });
      if (result) {
        console.log('[FileMapViewer] Successfully exported file map.');
      } else {
        console.log('[FileMapViewer] Export canceled or failed.');
      }
    } catch (err) {
      console.error('[FileMapViewer] Error exporting file map:', err);
    }
  };

  /**
   * Renders the collapsible directory structure in the UI
   * (just for viewing, not necessarily ASCII).
   * We do not edit or select files here; it's purely a read-only tree for reference.
   */
  const renderTree = (node: TreeNode, indent: number = 0): JSX.Element => {
    const isExpanded = expandedStates[node.path] || false;
    const hasChildren = node.type === 'directory' && node.children && node.children.length > 0;
    const toggleIcon = hasChildren ? (isExpanded ? '▾' : '▸') : ' ';

    const label = node.name + (node.type === 'directory' ? '/' : '');
    const indentStyle = { marginLeft: indent * 16 }; // 16px per indent level

    return (
      <div key={node.path}>
        <div
          className="flex items-center cursor-pointer"
          style={indentStyle}
          onClick={() => {
            if (hasChildren) {
              toggleExpand(node.path);
            }
          }}
        >
          <span className="mr-1">{toggleIcon}</span>
          <span className="text-gray-700 dark:text-gray-100">{label}</span>
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
          Failed to load file map: {error}
        </div>
      )}

      {!rootNode ? (
        <div className="text-xs text-gray-600 dark:text-gray-300">
          Loading file map...
        </div>
      ) : (
        <>
          {/* Collapsible Tree UI */}
          <div className="mb-2">
            <div className="text-xs">
              <div className="font-medium">
                Root: <span className="italic">{rootNode.path}</span>
              </div>
              <div className="mt-1">
                {renderTree(rootNode, 0)}
              </div>
            </div>
          </div>

          {/* Generate ASCII Button */}
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

          {/* ASCII Output */}
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
