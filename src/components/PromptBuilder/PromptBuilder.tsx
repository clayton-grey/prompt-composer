
/**
 * @file PromptBuilder.tsx
 * @description
 * Provides the UI for adding text/template/file blocks, plus a toggle
 * for plain text preview. Previously, we also had an "Add Prefab" button
 * and related state/menu for prefabs; that has now been removed.
 *
 * Step 1 Changes (Refactor Prefab → Template):
 *  - Removed all references to "prefab," including:
 *    - Removed the "Add Prefab" button
 *    - Removed showPrefabMenu, handleAddPrefabClick, handleInsertExamplePrefab, examplePrefab
 *    - Removed import { parsePrefab } from '../../utils/prefabParser'
 *  - Preserved "Add Template Block" button as is.
 *
 * Key Responsibilities:
 *  - Add text blocks, add template blocks, add file block
 *  - Toggling a plain text preview of the current prompt
 *  - The actual layout (BlockList, PromptPreview) is below
 *
 * Dependencies:
 *  - usePrompt from PromptContext for block management
 *  - useProject from ProjectContext for file selection
 *  - nanoid for unique IDs
 *
 * @notes
 *  - The next steps will handle the consolidated “Add Template Block” pop-up and
 *    other template logic.
 */

import React, { useState, useEffect } from 'react';
import { nanoid } from 'nanoid';
import BlockList from './BlockList';
import { usePrompt } from '../../context/PromptContext';
import PromptPreview from './PromptPreview';
import { useProject } from '../../context/ProjectContext';

export const PromptBuilder: React.FC = () => {
  const { addBlock, addBlocks, updateFileBlock, tokenUsage } = usePrompt();
  const { getSelectedFileEntries, generateAsciiTree, directoryCache } = useProject();
  const [showPreview, setShowPreview] = useState(false);
  const [rootFolders, setRootFolders] = useState<string[]>([]);

  // Gather project root folder paths from directoryCache on mount/updates
  useEffect(() => {
    const folderPaths = Object.keys(directoryCache);
    if (folderPaths.length > 0) {
      setRootFolders(folderPaths);
    }
  }, [directoryCache]);

  /**
   * Add a new text block
   */
  const handleAddTextBlock = () => {
    addBlock({
      id: nanoid(),
      type: 'text',
      label: 'Text Block',
      content: ''
    });
  };

  /**
   * Add a new template block (currently just empty content)
   */
  const handleAddTemplateBlock = () => {
    addBlock({
      id: nanoid(),
      type: 'template',
      label: 'Template Block',
      content: '',
      variables: []
    });
  };

  /**
   * Add or update the single File Block using the selected file entries
   */
  const handleAddFileBlock = async () => {
    const fileEntries = getSelectedFileEntries();
    if (fileEntries.length === 0) {
      console.log('[PromptBuilder] No files selected in sidebar. Nothing to add.');
      return;
    }

    const rootFolder = findRootFolderForFiles(fileEntries, rootFolders);
    try {
      if (rootFolder) {
        const completeMap = await generateAsciiTree(rootFolder);
        if (completeMap) {
          updateFileBlock(fileEntries, completeMap);
          return;
        }
      }
    } catch (err) {
      console.error('[PromptBuilder] generateAsciiTree error:', err);
    }

    // If generating a fancy ASCII map fails, fallback to a simple file list
    const simpleMap = generateSimpleFileList(fileEntries);
    updateFileBlock(fileEntries, simpleMap);
  };

  /**
   * Helper to find which root folder all files belong to (if any).
   * Returns the longest matching root. If none match, returns null.
   */
  function findRootFolderForFiles(
    files: Array<{ path: string }>,
    rootFolders: string[]
  ): string | null {
    if (files.length === 0 || rootFolders.length === 0) return null;
    const sortedRoots = [...rootFolders].sort((a, b) => b.length - a.length);
    for (const root of sortedRoots) {
      const allInRoot = files.every((f) => f.path.startsWith(root));
      if (allInRoot) return root;
    }
    const first = files[0].path;
    for (const root of sortedRoots) {
      if (first.startsWith(root)) return root;
    }
    return null;
  }

  /**
   * If the fancy tree generation fails, produce a minimal listing
   */
  function generateSimpleFileList(
    files: { path: string; content: string; language: string }[]
  ): string {
    let map = '<file_map>\n';
    if (files.length > 0) {
      const paths = files.map((f) => f.path);
      const firstPath = paths[0];
      const parts = firstPath.split('/');
      for (let i = parts.length; i > 0; i--) {
        const prefix = parts.slice(0, i).join('/');
        if (paths.every((p) => p.startsWith(prefix))) {
          map += prefix + '\n';
          break;
        }
      }
      files.forEach((file, idx) => {
        const isLast = idx === files.length - 1;
        const prefix = isLast ? '└── ' : '├── ';
        const lines = map.split('\n');
        const secondLine = lines[1] || '';
        const relativePath = file.path.substring(secondLine.length + 1);
        map += prefix + relativePath + '\n';
      });
    } else {
      map += 'No files selected\n';
    }
    map += '</file_map>';
    return map;
  }

  /**
   * Toggle to show/hide plain text preview
   */
  const togglePreview = () => setShowPreview(!showPreview);

  return (
    <div className="flex flex-col h-full">
      {/* Header row */}
      <div className="flex justify-between items-center p-4 border-b dark:border-gray-600">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
          Prompt Builder
        </h2>
        <div className="relative inline-block">
          <div className="flex gap-2">
            <button
              onClick={handleAddTextBlock}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Add Text Block
            </button>
            <button
              onClick={handleAddTemplateBlock}
              className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600"
            >
              Add Template Block
            </button>
            <button
              onClick={handleAddFileBlock}
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
            >
              Add File Block
            </button>
            {/* Removed the "Add Prefab" button */}
            <button
              onClick={togglePreview}
              className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
            >
              {showPreview ? 'Hide Plain Text View' : 'Show Plain Text View'}
            </button>
          </div>
        </div>
      </div>

      {/* Scrolling area for blocks */}
      <div className="flex-1 overflow-auto p-4 bg-gray-100 dark:bg-gray-800">
        <BlockList />
        {showPreview && <PromptPreview />}
      </div>
    </div>
  );
};
