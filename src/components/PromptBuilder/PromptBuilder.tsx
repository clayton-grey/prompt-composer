
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
 *  - This file uses the PromptContext for block data (addBlock).
 *  - We rely on "uuid" for unique block IDs.
 *  - If you do not see new blocks, verify the console logs and that
 *    the "uuid" library is installed.
 */

import React from 'react';
import { v4 as uuidv4 } from 'uuid'; // Ensure uuid is installed: npm install uuid
import { usePrompt } from '../../context/PromptContext';
import { Block } from '../../types/Block';
import BlockList from './BlockList';

const PromptBuilder: React.FC = () => {
  const { addBlock } = usePrompt();

  /**
   * Creates a new text block with placeholder content.
   * We log to the console for debugging. If you do not see logs,
   * ensure that the dev console is open and no errors block execution.
   */
  const handleAddBlock = () => {
    const newBlock: Block = {
      id: uuidv4(),
      type: 'text',
      label: 'New Text Block',
      content: 'Your text goes here...'
    } as Block;

    console.log('[PromptBuilder] Adding new block:', newBlock);
    addBlock(newBlock);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
          Prompt Builder
        </h2>
        <button
          onClick={handleAddBlock}
          className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded text-sm"
        >
          + Add Text Block
        </button>
      </div>

      {/* The list of blocks, with reorder & delete */}
      <BlockList />
    </div>
  );
};

export default PromptBuilder;
