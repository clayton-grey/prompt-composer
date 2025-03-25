
/**
 * @file BlockList.tsx
 * @description
 * Renders a list of blocks from the global prompt context, providing
 * reorder (move up/down) and deletion features. Each block is displayed
 * with a label, plus "Up", "Down", and "Delete" buttons. We also show
 * the content for text blocks to confirm they exist and are rendered.
 *
 * Key Responsibilities:
 *  - Display the blocks in the order they appear in the prompt context
 *  - Provide a way to reorder blocks using moveBlock()
 *  - Provide a way to remove blocks using removeBlock()
 *  - Show text block content if block.type === 'text'
 *
 * @notes
 *  - If you still see no blocks, check console logs for errors or confirm
 *    that <PromptProvider> is wrapping your app in index.tsx.
 */

import React, { useEffect } from 'react';
import { usePrompt } from '../../context/PromptContext';
import type { Block } from '../../types/Block';

interface BlockListProps {
  renderBlockContent?: (block: Block) => JSX.Element;
}

/**
 * Renders a list of blocks from the prompt context with reorder & delete controls.
 */
const BlockList: React.FC<BlockListProps> = ({ renderBlockContent }) => {
  const { blocks, removeBlock, moveBlock } = usePrompt();

  /**
   * Moves a block up in the array if possible.
   */
  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    moveBlock(index, index - 1);
  };

  /**
   * Moves a block down in the array if possible.
   */
  const handleMoveDown = (index: number) => {
    if (index >= blocks.length - 1) return;
    moveBlock(index, index + 1);
  };

  /**
   * Removes a block from the array.
   */
  const handleDelete = (blockId: string) => {
    removeBlock(blockId);
  };

  /**
   * Debug log to ensure we see updated blocks in console
   */
  useEffect(() => {
    console.log('[BlockList] Current blocks:', blocks);
  }, [blocks]);

  return (
    <div className="space-y-4">
      {blocks.map((block, index) => {
        const isFirst = index === 0;
        const isLast = index === blocks.length - 1;

        // Display text block content or fallback if no custom renderer
        const textBlockContent = (block.type === 'text') ? (
          <p className="mt-1 text-gray-700 dark:text-gray-200 text-sm">
            {block.content}
          </p>
        ) : null;

        return (
          <div
            key={block.id}
            className="p-4 bg-white dark:bg-gray-700 shadow rounded flex flex-col gap-2"
          >
            {/* Top row: block label & reorder/delete controls */}
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-gray-800 dark:text-gray-100">
                {block.label} (Type: {block.type})
              </h2>

              <div className="space-x-2">
                {/* Up Button */}
                <button
                  onClick={() => handleMoveUp(index)}
                  disabled={isFirst}
                  className={`px-2 py-1 text-sm rounded ${
                    isFirst
                      ? 'bg-gray-300 dark:bg-gray-600 cursor-not-allowed text-gray-500 dark:text-gray-400'
                      : 'bg-blue-500 hover:bg-blue-600 text-white'
                  }`}
                >
                  Up
                </button>

                {/* Down Button */}
                <button
                  onClick={() => handleMoveDown(index)}
                  disabled={isLast}
                  className={`px-2 py-1 text-sm rounded ${
                    isLast
                      ? 'bg-gray-300 dark:bg-gray-600 cursor-not-allowed text-gray-500 dark:text-gray-400'
                      : 'bg-blue-500 hover:bg-blue-600 text-white'
                  }`}
                >
                  Down
                </button>

                {/* Delete Button */}
                <button
                  onClick={() => handleDelete(block.id)}
                  className="px-2 py-1 text-sm rounded bg-red-500 hover:bg-red-600 text-white"
                >
                  Delete
                </button>
              </div>
            </div>

            {/* If a custom renderer is provided, use it; otherwise show text if text block */}
            <div className="text-gray-700 dark:text-gray-200 text-sm mt-1">
              {renderBlockContent
                ? renderBlockContent(block)
                : textBlockContent}
            </div>
          </div>
        );
      })}
      {blocks.length === 0 && (
        <div className="text-gray-600 dark:text-gray-300 text-sm">
          No blocks yet. Use the "Add Text Block" button above.
        </div>
      )}
    </div>
  );
};

export default BlockList;
