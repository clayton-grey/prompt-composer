/**
 * @file BlockList.tsx
 * @description
 * Renders the list of blocks in order, each with its own editor. We used to have
 * reorder buttons (move up/down), but per the new raw edit paradigm, we have removed
 * all reordering logic. The user now does not reorder blocks in the UI; instead,
 * they do a full raw edit if they want to change the template text or block positions.
 *
 * We retain the ability to delete entire groups (template + sub-blocks) or single
 * ungrouped blocks, and we still keep the raw edit pencil icon for template leads.
 * However, the "Move Up" and "Move Down" buttons and related logic are removed.
 *
 * Implementation details:
 *  - "renderDeleteIcon" still provides a delete button for blocks or entire template groups.
 *  - "handleDelete" is kept so the user can remove blocks.
 *  - The rest of the UI around reordering has been excised.
 *  - "shouldRenderBlock" ensures if the lead block is editing raw, all child blocks are hidden.
 *
 * @author Prompt Composer
 */

import React, { useEffect } from 'react';
import { usePrompt } from '../../context/PromptContext';
import type { Block } from '../../types/Block';
import BlockEditor from './BlockEditor';

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
  const { blocks, addBlock, removeBlock, updateBlock } = usePrompt();

  // Debugging: print current blocks whenever they change
  useEffect(() => {
    console.log('[BlockList] current blocks:', blocks);
  }, [blocks]);

  /**
   * handleDelete
   * Deletes a block or block group from the composition.
   *
   * @param index - The index of the block to delete
   */
  const handleDelete = (index: number) => {
    const block = blocks[index];

    // If this block is a template group lead, remove the entire group
    if (block.groupId && block.isGroupLead) {
      const groupId = block.groupId;
      const newBlocks = blocks.filter(b => b.groupId !== groupId);
      const oldBlocks = [...blocks];
      // Clear old blocks from context
      for (let i = oldBlocks.length - 1; i >= 0; i--) {
        removeBlock(oldBlocks[i].id);
      }
      // Add the new array back
      for (const b of newBlocks) {
        addBlock({ ...b });
      }
    } else if (!block.groupId && !block.locked) {
      // Single unlocked block
      removeBlock(block.id);
    }
    // If it's locked or not a lead but in a group, do nothing. It's not individually deleted in new design.
  };

  /**
   * shouldRenderBlock
   * If the block is in a group where the lead is editing raw, we hide all other blocks in that group.
   */
  function shouldRenderBlock(block: Block, index: number): boolean {
    if (block.isGroupLead && block.editingRaw) {
      return true; // The lead block shows (the raw editor).
    }
    if (block.groupId) {
      const leadIndex = blocks.findIndex(b => b.groupId === block.groupId && b.isGroupLead);
      if (leadIndex !== -1) {
        const leadBlock = blocks[leadIndex];
        if (leadBlock.editingRaw && leadIndex !== index) {
          return false; // Hide child blocks if lead is in raw edit
        }
      }
    }
    return true;
  }

  /**
   * handleRawEdit
   * Toggles raw edit mode for a template block lead.
   * This is triggered by the pencil icon in the bottom-right corner.
   *
   * @param block - The block to flip into raw editing
   */
  const handleRawEdit = (block: Block) => {
    // Only valid for template leads
    if (block.type !== 'template' || !block.isGroupLead) return;
    updateBlock({ ...block, editingRaw: true });
  };

  return (
    <div className="space-y-4">
      {blocks.map((block, index) => {
        if (!shouldRenderBlock(block, index)) {
          return null;
        }

        // In this new paradigm, we do not reorder blocks, so no reordering icons are displayed.
        // We do, however, keep the delete icon for certain blocks/groups.

        const canDelete = (!block.groupId && !block.locked) || (block.groupId && block.isGroupLead); // lead block can delete group

        const blockTailClass = getBlockTailClass(block);

        return (
          <div
            key={block.id}
            className={`relative group p-4 shadow rounded flex flex-col gap-2 border border-gray-200 dark:border-gray-600 ${blockTailClass}`}
          >
            {/* Top-right: we no longer show reorder icons, only delete if allowed */}
            {canDelete && (
              <div className="absolute top-2 right-2 flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                {renderDeleteIcon(block, () => handleDelete(index))}
              </div>
            )}

            {/* Bottom-right: raw edit pencil icon if template group lead (and not currently in raw mode) */}
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
          No blocks. Use or load a template to begin.
        </div>
      )}
    </div>
  );
};

export default BlockList;
