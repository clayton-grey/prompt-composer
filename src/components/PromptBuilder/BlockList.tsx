/**
 * @file BlockList.tsx
 * @description
 * Renders the list of blocks in order, each with its own editor. Blocks can be reordered or deleted,
 * but if they share a groupId, they move/delete as a single unit. We also handle special icons:
 *  - Move Up/Down
 *  - Block vs. Template Delete
 *  - Raw Edit icon (pencil) for template block leads only
 *
 * This file was updated in Step 2 to extract reorder logic into blockReorderHelpers.ts.
 * In Step 6, we changed the aria-label from "Edit raw template" to "Edit Raw Template"
 * for consistency with naming conventions.
 *
 * Step 5 Changes (Accessibility):
 *  - Added aria-label attributes for reorder and delete buttons
 *  - Added aria-label for raw edit pencil icon
 *
 * Implementation Details:
 *  - We rely on PromptContext for block data and reorder operations
 *  - findGroupRange, reorderBlocksInRange come from blockReorderHelpers
 *  - handleMoveUp/handleMoveDown handle group or single block moves
 *  - handleDelete removes the entire group if lead or single if ungrouped
 *  - handleRawEdit toggles the lead template block into editingRaw mode
 *
 * Edge Cases:
 *  - If a block is locked, user cannot reorder or delete it individually
 *  - If it's part of a group, only the isGroupLead block can reorder/delete
 *
 * @author Prompt Composer
 */

import React, { useEffect } from 'react';
import { usePrompt } from '../../context/PromptContext';
import type { Block } from '../../types/Block';
import BlockEditor from './BlockEditor';
import { findGroupRange, reorderBlocksInRange } from '../../utils/blockReorderHelpers';

/**
 * getBlockTailClass
 * Returns the pastel color classes for the block background + tail, by block type.
 *
 * @param block - The block whose style we are determining
 * @returns The combined className string for styling
 */
function getBlockTailClass(block: Block): string {
  switch (block.type) {
    case 'text':
      return 'block-tail block-tail-blue';
    case 'template':
      return 'block-tail block-tail-purple';
    case 'files':
      return 'block-tail block-tail-green';
    default:
      return 'block-tail block-tail-blue';
  }
}

/**
 * renderDeleteIcon
 * Renders the correct SVG for the delete button:
 *  - If it's a template block lead, show the "template delete" icon
 *  - Otherwise, show the standard block delete icon
 *
 * @param block - The block being considered
 * @param onClick - The click handler to invoke on delete
 * @returns JSX for the delete icon
 */
function renderDeleteIcon(block: Block, onClick: () => void) {
  // If it's a template block lead, we show the "template delete" icon
  if (block.type === 'template' && block.isGroupLead) {
    return (
      <button
        onClick={onClick}
        className="p-1 text-gray-700 dark:text-gray-200 hover:bg-red-100 dark:hover:bg-red-600 rounded"
        aria-label="Delete template group"
      >
        {/* Template delete icon (grid2x2-x) */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="lucide lucide-grid2x2-x-icon lucide-grid-2x2-x"
        >
          <path d="M12 3v17a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1H3"></path>
          <path d="m16 16 5 5"></path>
          <path d="m16 21 5-5"></path>
        </svg>
      </button>
    );
  }

  // Otherwise, standard block delete icon (square-x)
  return (
    <button
      onClick={onClick}
      className="p-1 text-gray-700 dark:text-gray-200 hover:bg-red-100 dark:hover:bg-red-600 rounded"
      aria-label="Delete block"
    >
      {/* block delete icon (square-x) */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="lucide lucide-square-x-icon lucide-square-x"
      >
        <rect width="18" height="18" x="3" y="3" rx="2" ry="2"></rect>
        <path d="m15 9-6 6"></path>
        <path d="m9 9 6 6"></path>
      </svg>
    </button>
  );
}

const BlockList: React.FC = () => {
  const { blocks, addBlock, removeBlock, updateBlock, moveBlock } = usePrompt();

  /**
   * handleMoveUp
   * Moves the block or block group at index up one position if possible.
   *
   * @param index - The index of the block to move
   */
  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    const block = blocks[index];

    // If it's a group lead, we find the group range
    if (block.groupId && block.isGroupLead) {
      const [groupStart, groupEnd] = findGroupRange(blocks, index);
      if (groupStart <= 0) return;
      reorderChunk(groupStart, groupEnd, 'up');
    } else if (!block.groupId && !block.locked) {
      // Single block, just move up
      moveBlock(index, index - 1);
    }
  };

  /**
   * handleMoveDown
   * Moves the block or block group at index down one position if possible.
   *
   * @param index - The index of the block to move
   */
  const handleMoveDown = (index: number) => {
    if (index >= blocks.length - 1) return;
    const block = blocks[index];

    if (block.groupId && block.isGroupLead) {
      const [groupStart, groupEnd] = findGroupRange(blocks, index);
      if (groupEnd >= blocks.length - 1) return;
      reorderChunk(groupStart, groupEnd, 'down');
    } else if (!block.groupId && !block.locked) {
      // Single block, just move down
      moveBlock(index, index + 1);
    }
  };

  /**
   * reorderChunk
   * Internal function to reorder a chunk of blocks from start->end up or down by one step.
   * After computing the new array, we remove all old blocks, then add them back in the new order.
   *
   * @param start - starting index of the chunk
   * @param end - ending index of the chunk
   * @param direction - 'up' or 'down'
   */
  function reorderChunk(start: number, end: number, direction: 'up' | 'down') {
    const newBlocks = reorderBlocksInRange(blocks, start, end, direction);

    // Remove all old blocks from the PromptContext
    const oldBlocks = [...blocks];
    for (let i = oldBlocks.length - 1; i >= 0; i--) {
      removeBlock(oldBlocks[i].id);
    }

    // Add the updated blocks back
    for (const b of newBlocks) {
      addBlock({ ...b });
    }
  }

  /**
   * handleDelete
   * Deletes a block or block group from the composition.
   *
   * @param index - The index of the block to delete
   */
  const handleDelete = (index: number) => {
    const block = blocks[index];

    if (block.groupId && block.isGroupLead) {
      const [groupStart, groupEnd] = findGroupRange(blocks, index);
      const size = groupEnd - groupStart + 1;
      const newBlocks = [...blocks];
      newBlocks.splice(groupStart, size);

      // Clear old blocks
      const oldBlocks = [...blocks];
      for (let i = oldBlocks.length - 1; i >= 0; i--) {
        removeBlock(oldBlocks[i].id);
      }
      // Add the new array back
      for (const b of newBlocks) {
        addBlock({ ...b });
      }
    } else if (!block.groupId && !block.locked) {
      removeBlock(block.id);
    }
  };

  /**
   * handleRawEdit
   * Toggles raw edit mode for a template block lead.
   *
   * @param block - The block to flip into raw editing
   */
  const handleRawEdit = (block: Block) => {
    // Only valid for template leads
    if (block.type !== 'template' || !block.isGroupLead) return;
    updateBlock({ ...block, editingRaw: true });
  };

  // Debugging: print current blocks
  useEffect(() => {
    console.log('[BlockList] current blocks:', blocks);
  }, [blocks]);

  /**
   * shouldRenderBlock
   * If the block is in a group where the lead is editing raw, we hide all other blocks.
   */
  function shouldRenderBlock(block: Block, index: number): boolean {
    if (block.isGroupLead && block.editingRaw) {
      return true;
    }
    if (block.groupId) {
      const leadIndex = blocks.findIndex(b => b.groupId === block.groupId && b.isGroupLead);
      if (leadIndex !== -1) {
        const leadBlock = blocks[leadIndex];
        if (leadBlock.editingRaw && leadIndex !== index) {
          return false;
        }
      }
    }
    return true;
  }

  return (
    <div className="space-y-4">
      {blocks.map((block, index) => {
        if (!shouldRenderBlock(block, index)) {
          return null;
        }

        let canReorderOrDelete = false;
        if (!block.locked) {
          if (block.groupId) {
            if (block.isGroupLead) {
              canReorderOrDelete = true;
            }
          } else {
            canReorderOrDelete = true;
          }
        }

        const blockTailClass = getBlockTailClass(block);

        return (
          <div
            key={block.id}
            className={`relative group p-4 shadow rounded flex flex-col gap-2 border border-gray-200 dark:border-gray-600 ${blockTailClass}`}
          >
            {/* Top-right: reorder + delete icons, shown on hover */}
            {canReorderOrDelete && (
              <div className="absolute top-2 right-2 flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                {/* Move Up button */}
                <button
                  onClick={() => handleMoveUp(index)}
                  className="p-1 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={index <= 0}
                  aria-label="Move block or group up"
                >
                  {/* Move up icon */}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="lucide lucide-move-up-icon lucide-move-up"
                  >
                    <path d="M8 6L12 2L16 6"></path>
                    <path d="M12 2V22"></path>
                  </svg>
                </button>

                {/* Move Down button */}
                <button
                  onClick={() => handleMoveDown(index)}
                  className="p-1 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={index >= blocks.length - 1}
                  aria-label="Move block or group down"
                >
                  {/* Move down icon */}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="lucide lucide-move-down-icon lucide-move-down"
                  >
                    <path d="M8 18L12 22L16 18"></path>
                    <path d="M12 2V22"></path>
                  </svg>
                </button>

                {/* Delete button (block or template) */}
                {renderDeleteIcon(block, () => handleDelete(index))}
              </div>
            )}

            {/* Bottom-right: raw edit pencil icon if template group lead */}
            {block.type === 'template' && block.isGroupLead && !block.editingRaw && (
              <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                <button
                  onClick={() => handleRawEdit(block)}
                  className="p-1 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 rounded"
                  aria-label="Edit Raw Template"
                >
                  {/* Pencil icon for raw edit */}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="lucide lucide-pencil-icon lucide-pencil"
                  >
                    <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"></path>
                    <path d="m15 5 4 4"></path>
                  </svg>
                </button>
              </div>
            )}

            {/* The block editor content (text, template, or file) */}
            <BlockEditor block={block} onChange={updated => updateBlock(updated)} />
          </div>
        );
      })}

      {blocks.length === 0 && (
        <div className="text-sm text-gray-700 dark:text-gray-300">
          No blocks. Use the Add buttons above.
        </div>
      )}
    </div>
  );
};

export default BlockList;
