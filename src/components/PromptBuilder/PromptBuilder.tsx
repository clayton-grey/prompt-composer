
/**
 * @file PromptBuilder.tsx
 * @description
 * The main container for listing and editing prompt blocks. This component
 * renders the current list of blocks from the PromptContext and provides a UI
 * to add new blocks of different types (text, template, files).
 *
 * Key Responsibilities:
 *  - Display the list of blocks
 *  - Provide an interface for adding new blocks
 *  - Pass individual block data and update handlers to child components
 *
 * @notes
 *  - We do NOT handle block reordering or deletion in this step; that is Step 7.
 *  - For now, we simply render each block in order.
 *  - The actual editing UI for each block is delegated to BlockEditor.tsx.
 */

import React, { useState } from 'react';
import { usePrompt } from '../../context/PromptContext';
import { Block } from '../../types/Block';
import BlockEditor from './BlockEditor';

const PromptBuilder: React.FC = () => {
  /**
   * Our global state containing the array of prompt blocks and methods
   * to add or update them.
   */
  const { blocks, addBlock, updateBlock } = usePrompt();

  /**
   * Local UI state to handle the dropdown or selection of which block type
   * to create. 
   */
  const [showBlockTypeMenu, setShowBlockTypeMenu] = useState(false);

  /**
   * Handle adding a new block by creating an initial data structure for the
   * given type. This uses the 'addBlock' method from our PromptContext.
   * 
   * @param type The type of block to create ('text', 'template', or 'files').
   */
  const handleAddBlock = (type: Block['type']) => {
    const newBlock: Block = {
      id: `block_${Math.random().toString(36).slice(2)}`,
      type,
      label: `New ${type.charAt(0).toUpperCase() + type.slice(1)} Block`
    };

    // Populate unique fields depending on type
    if (type === 'text') {
      newBlock['content'] = '';
    } else if (type === 'template') {
      newBlock['content'] = '';
      newBlock['variables'] = [];
    } else if (type === 'files') {
      newBlock['files'] = [];
    }

    addBlock(newBlock);
    setShowBlockTypeMenu(false);
  };

  /**
   * Renders a dropdown menu for selecting which type of block to create.
   */
  const renderAddBlockMenu = () => {
    if (!showBlockTypeMenu) {
      return null;
    }

    return (
      <div className="absolute mt-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded shadow p-2 z-10">
        <button
          className="block w-full text-left px-2 py-1 text-sm text-gray-700 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-600"
          onClick={() => handleAddBlock('text')}
        >
          Text Block
        </button>
        <button
          className="block w-full text-left px-2 py-1 text-sm text-gray-700 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-600"
          onClick={() => handleAddBlock('template')}
        >
          Template Block
        </button>
        <button
          className="block w-full text-left px-2 py-1 text-sm text-gray-700 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-600"
          onClick={() => handleAddBlock('files')}
        >
          Files Block
        </button>
      </div>
    );
  };

  /**
   * Renders the list of blocks using the BlockEditor component. 
   * The 'updateBlock' method from context is passed to handle changes.
   */
  const renderBlocks = () => {
    return blocks.map((block) => (
      <div key={block.id} className="mb-4">
        <BlockEditor
          block={block}
          onChange={(updated) => updateBlock(updated)}
        />
      </div>
    ));
  };

  return (
    <div className="relative">
      {/* A button to show/hide the block creation menu */}
      <div className="mb-4">
        <button
          className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded"
          onClick={() => setShowBlockTypeMenu((prev) => !prev)}
        >
          + Add Block
        </button>
        {renderAddBlockMenu()}
      </div>

      {/* List out existing blocks */}
      {renderBlocks()}
    </div>
  );
};

export default PromptBuilder;
