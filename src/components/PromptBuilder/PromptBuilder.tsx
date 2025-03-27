
/**
 * @file PromptBuilder.tsx
 * @description
 * Provides the UI for adding text, template, and file blocks, plus a toggle
 * for plain text preview. We now update the "Add Template Block" functionality
 * to open a modal (TemplateSelectorModal) listing available templates from
 * global + project sources, rather than just inserting an empty template block.
 *
 * Step 2 Changes:
 *  - Import TemplateSelectorModal
 *  - Add state showTemplateModal
 *  - When user clicks "Add Template Block," we set showTemplateModal = true
 *  - On selection, we parse the chosen .txt or .md file into multiple blocks
 *    with parseTemplateBlocks, then call addBlocks(newBlocks).
 *
 * Implementation Details:
 *  - The rest of PromptBuilder remains the same except for handleAddTemplateBlock, which
 *    now toggles the modal.
 */

import React, { useState, useEffect } from 'react';
import { nanoid } from 'nanoid';
import BlockList from './BlockList';
import { usePrompt } from '../../context/PromptContext';
import PromptPreview from './PromptPreview';
import { useProject } from '../../context/ProjectContext';
import TemplateSelectorModal from './TemplateSelectorModal';

export const PromptBuilder: React.FC = () => {
  const { addBlock, addBlocks, updateFileBlock } = usePrompt();
  const { getSelectedFileEntries, generateAsciiTree, directoryCache } = useProject();
  const [showPreview, setShowPreview] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [rootFolders, setRootFolders] = useState<string[]>([]);

  useEffect(() => {
    const folderPaths = Object.keys(directoryCache);
    if (folderPaths.length > 0) {
      setRootFolders(folderPaths);
    }
  }, [directoryCache]);

  const handleAddTextBlock = () => {
    addBlock({
      id: nanoid(),
      type: 'text',
      label: 'Text Block',
      content: ''
    });
  };

  /**
   * Instead of creating a blank template, we now open a modal to select from available .txt/.md files.
   */
  const handleAddTemplateBlock = () => {
    setShowTemplateModal(true);
  };

  /**
   * Insert or update the File Block with selected file entries
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

    // fallback
    const simpleMap = generateSimpleFileList(fileEntries);
    updateFileBlock(fileEntries, simpleMap);
  };

  /**
   * Helper: findRootFolderForFiles
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

  const togglePreview = () => setShowPreview(!showPreview);

  /**
   * handleInsertTemplateBlocks
   * Called by TemplateSelectorModal once the user picks a file, it's parsed into blocks,
   * we simply add them all here with addBlocks.
   */
  const handleInsertTemplateBlocks = (parsedBlocks: any[]) => {
    addBlocks(parsedBlocks);
  };

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

      {/* Step 2: Template selector modal */}
      <TemplateSelectorModal
        isOpen={showTemplateModal}
        onClose={() => setShowTemplateModal(false)}
        onInsertBlocks={handleInsertTemplateBlocks}
      />
    </div>
  );
};
