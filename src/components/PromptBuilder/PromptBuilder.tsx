
/**
 * @file PromptBuilder.tsx
 * @description
 * Provides the UI for adding text blocks, updating file blocks, etc. 
 * 
 * After Step 3, we fetch the selected file entries from ProjectContext 
 * (useProject().getSelectedFileEntries) instead of PromptContext, 
 * then pass them to updateFileBlock(...) in PromptContext.
 */

import React, { useState } from 'react';
import { Block } from '../../types/Block';
import BlockList from './BlockList';
import { usePrompt } from '../../context/PromptContext';
import PromptPreview from './PromptPreview';
import { useProject } from '../../context/ProjectContext';

export const PromptBuilder: React.FC = () => {
  const { addBlock, updateFileBlock } = usePrompt();
  const { getSelectedFileEntries } = useProject();

  const [showPreview, setShowPreview] = useState(false);

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
   * Now we use getSelectedFileEntries from ProjectContext
   */
  const handleUpdateFileBlock = () => {
    const fileEntries = getSelectedFileEntries();
    if (!fileEntries || fileEntries.length === 0) {
      console.log('[PromptBuilder] No files currently selected in the sidebar. Nothing to update.');
      return;
    }
    updateFileBlock(fileEntries);
  };

  const togglePreview = () => {
    setShowPreview((prev) => !prev);
  };

  return (
    <div className="flex flex-col h-full">
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

      <div className="flex-1 overflow-auto p-4">
        <BlockList />
        {showPreview && <PromptPreview />}
      </div>
    </div>
  );
};
