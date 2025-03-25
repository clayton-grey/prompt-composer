
/**
 * @file PromptBuilder.tsx
 * @description
 * High-level component that coordinates the prompt-building UI:
 *  - Displays a button to add new blocks
 *  - Renders the BlockList for reordering and deleting
 * 
 * Key Responsibilities:
 *  - Provide an interface for creating new blocks (e.g. "Add Block" button)
 *  - Show the current blocks with reorder/delete (BlockList)
 *
 * @notes
 *  - We have removed the electron showOpenDialog usage per the user's request.
 *    The "Add File Block" button now logs a message or does a placeholder.
 */

import React from 'react';
import { Block } from '../../types/Block';
import BlockList from './BlockList';
import { usePrompt } from '../../context/PromptContext';

export const PromptBuilder: React.FC = () => {
  const { addBlock } = usePrompt();

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
   * handleAddFileBlock:
   * We removed any code referencing the electronAPI.showOpenDialog.
   * If user wants to add file logic, they'd do it some other way.
   */
  const handleAddFileBlock = () => {
    console.log('[PromptBuilder] handleAddFileBlock called. The "openDialog" logic is removed.');
    // If needed, we can do some default file block or a manual path prompt
    // For now, we just add a placeholder block or do nothing.
    /*
    const newFileBlock: Block = {
      id: Date.now().toString(),
      type: 'files',
      label: 'Placeholder File Block',
      files: []
    };
    addBlock(newFileBlock);
    */
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center p-4 border-b">
        <h2 className="text-lg font-semibold">Prompt Builder</h2>
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
        </div>
      </div>
      <BlockList />
    </div>
  );
};
