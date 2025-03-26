
/**
 * @file FileMapViewer.tsx
 * @description
 * Refactored to rely on the ProjectContext for directory data and ASCII generation. 
 * We no longer store expansions or child states here. We simply call generateAsciiTree(rootPath) 
 * from the context when the user requests it, and we display the result.
 *
 * Implementation:
 *  - We have a single piece of local state: asciiTree, representing the last generated ASCII
 *  - The user clicks "Generate ASCII Tree" to call context.generateAsciiTree, 
 *    then we store the result in asciiTree for display.
 *  - We also support copying and exporting the asciiTree to a file via electronAPI. 
 *  - We do not store expansions in this file. That is the job of FileTree and ProjectContext.
 */

import React, { useState } from 'react';
import { useProject } from '../../context/ProjectContext';

interface FileMapViewerProps {
  /**
   * The root path from which to generate the ASCII tree. 
   * Often '.' or a specific folder path.
   */
  rootPath?: string;
}

const FileMapViewer: React.FC<FileMapViewerProps> = ({ rootPath = '.' }) => {
  const { generateAsciiTree } = useProject();
  const [asciiTree, setAsciiTree] = useState<string>('');

  /**
   * Build the ASCII tree by calling context.generateAsciiTree(rootPath)
   */
  async function handleGenerateClick() {
    const treeString = await generateAsciiTree(rootPath);
    setAsciiTree(treeString);
  }

  /**
   * Copy the asciiTree to clipboard
   */
  const handleCopy = async () => {
    if (!asciiTree) return;
    try {
      await navigator.clipboard.writeText(asciiTree);
      console.log('[FileMapViewer] Copied file map to clipboard.');
    } catch (err) {
      console.error('[FileMapViewer] Failed to copy to clipboard:', err);
    }
  };

  /**
   * Export the asciiTree to a file
   */
  const handleExport = async () => {
    if (!asciiTree) return;
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

  return (
    <div className="p-2">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
        File Map Viewer
      </h2>
      <div className="flex gap-2 mb-2">
        <button
          onClick={handleGenerateClick}
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
    </div>
  );
};

export default FileMapViewer;
