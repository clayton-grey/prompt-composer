
/**
 * @file PromptBuilder.tsx
 * @description
 * The main prompt composition UI. Lets users add text blocks, handle 
 * the single file block usage, reorder blocks, and show a plain-text preview.
 *
 * Changes for "Architecture & State Management - Step 2: Clarify or Extend File Block Usage":
 *  - We rename "handleAddFileBlock" to "handleUpdateFileBlock"
 *  - We call "updateFileBlock(...)" instead of "setSingleFileBlock(...)"
 *  - The button label is changed from "Add File Block" to "Update File Block"
 *
 * @notes
 *  - The user can select files in the Sidebar, and we retrieve them with getSelectedFileEntries().
 *    Then we pass them to updateFileBlock() to unify or overwrite the single file block.
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
    updateFileBlock
  } = usePrompt();

  // Local state to toggle the plain text view
  const [showPreview, setShowPreview] = useState(false);

  /**
   * Adds a new text block to the prompt for freeform text usage.
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
   * handleUpdateFileBlock:
   *  - Fetch the user-selected files from the tri-state file tree
   *  - If none are selected, we do nothing (or log).
   *  - Otherwise, pass them all to updateFileBlock()
   */
  const handleUpdateFileBlock = () => {
    const fileEntries = getSelectedFileEntries();
    if (!fileEntries || fileEntries.length === 0) {
      console.log('[PromptBuilder] No files currently selected in the sidebar. Nothing to update.');
      return;
    }
    updateFileBlock(fileEntries);
  };

  /**
   * Toggles the display of the final prompt preview.
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
            onClick={handleUpdateFileBlock}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
          >
            Update File Block
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

        {/* If showPreview is true, show the final prompt preview */}
        {showPreview && <PromptPreview />}
      </div>
    </div>
  );
};
      