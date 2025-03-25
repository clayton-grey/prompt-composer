
/**
 * @file PromptBuilder.tsx
 * @description
 * High-level component that coordinates the prompt-building UI:
 *  - Displays a button to add a new text block
 *  - Displays a button to add a file block from the user's currently selected files
 *  - Renders the BlockList for reordering and deletion
 *  - Provides a toggle to show/hide the final "Plain Text View" (PromptPreview)
 *
 * Step 12 Changes:
 * 1. Introduce "showPreview" state, with a button to toggle its value.
 * 2. When showPreview is true, we render <PromptPreview /> below the BlockList.
 */

import React, { useState } from 'react';
import { Block } from '../../types/Block';
import BlockList from './BlockList';
import { usePrompt } from '../../context/PromptContext';
import PromptPreview from './PromptPreview';

export const PromptBuilder: React.FC = () => {
  const {
    addBlock,
    getSelectedFileEntries,
    setSingleFileBlock
  } = usePrompt();

  // Step 12: Add local state for toggling the "Plain Text View"
  const [showPreview, setShowPreview] = useState(false);

  /**
   * Adds a new text block to the prompt.
   */
  const handleAddTextBlock = () => {
    const newBlock: Block = {
      id: Date.now().toString(),
      type: 'text',
      label: 'New Text Block',
      content: ''
    };
    addBlock(newBlock);
  };

  /**
   * Step 3: Instead of creating an empty file block, 
   * we take the selected files from the context and set them as a single file block in the prompt flow.
   */
  const handleAddFileBlock = () => {
    const fileEntries = getSelectedFileEntries();
    if (!fileEntries || fileEntries.length === 0) {
      console.log('[PromptBuilder] No files are currently selected in the sidebar.');
      return;
    }
    setSingleFileBlock(fileEntries);
  };

  /**
   * Toggles the display of the final prompt preview (Plain Text View).
   */
  const togglePreview = () => {
    setShowPreview((prev) => !prev);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Top area with actions */}
      <div className="flex justify-between items-center p-4 border-b dark:border-gray-600">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
          Prompt Builder
        </h2>
        <div className="flex gap-2">
          <button
            onClick={handleAddTextBlock}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Add Text Block
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

      {/* BlockList for all blocks */}
      <div className="flex-1 overflow-auto p-4">
        <BlockList />
        {/*
          If showPreview is true, show the final prompt preview
        */}
        {showPreview && <PromptPreview />}
      </div>
    </div>
  );
};
