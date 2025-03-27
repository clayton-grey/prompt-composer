
/**
 * @file BlockList.tsx
 * @description
 * Lists blocks in order, each with its own editor. 
 * Blocks can be reordered or deleted, but if they share a groupId, they
 * move/delete as a single unit.
 *
 * In this update (Step 5a):
 *  - We add a "group hover" approach so the reorder/delete buttons float
 *    and only show on mouse hover. 
 *  - We add "block tail" styling classes to each block to visually match
 *    the reference design with a "tail" shape, indicating that sub-blocks
 *    belong to a parent template.
 *  - We unify the prior background color logic into these block-tail classes
 *    so that the user sees the new design with pastel backgrounds and the
 *    triangular shape on the left for each block.
 */

import React, { useEffect } from 'react';
import { usePrompt } from '../../context/PromptContext';
import type { Block } from '../../types/Block';
import BlockEditor from './BlockEditor';

/**
 * Finds the min and max index for blocks sharing a groupId with the block at startIdx.
 */
function findGroupRange(blocks: Block[], startIdx: number): [number, number] {
  const b = blocks[startIdx];
  if (!b.groupId) {
    return [startIdx, startIdx];
  }
  const gid = b.groupId;
  const indices = blocks
    .map((x, i) => ({ block: x, idx: i }))
    .filter((x) => x.block.groupId === gid)
    .map((x) => x.idx);
  const minI = Math.min(...indices);
  const maxI = Math.max(...indices);
  return [minI, maxI];
}

/**
 * Helper to produce the CSS classes for block "tail" + color, based on type.
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
      return 'block-tail block-tail-blue'; // fallback
  }
}

const BlockList: React.FC = () => {
  const { blocks, addBlock, removeBlock, updateBlock, moveBlock } = usePrompt();

  /**
   * handleMoveUp / handleMoveDown / handleDelete:
   * We move or delete the entire group if it's a group lead,
   * otherwise we only affect the single block if groupId is not defined or locked is false.
   */
  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    const block = blocks[index];
    if (block.groupId && block.isGroupLead) {
      const [groupStart, groupEnd] = findGroupRange(blocks, index);
      if (groupStart <= 0) return;
      reorderChunk(groupStart, groupEnd, 'up');
    } else if (!block.groupId && !block.locked) {
      moveBlock(index, index - 1);
    }
  };

  const handleMoveDown = (index: number) => {
    if (index >= blocks.length - 1) return;
    const block = blocks[index];
    if (block.groupId && block.isGroupLead) {
      const [groupStart, groupEnd] = findGroupRange(blocks, index);
      if (groupEnd >= blocks.length - 1) return;
      reorderChunk(groupStart, groupEnd, 'down');
    } else if (!block.groupId && !block.locked) {
      moveBlock(index, index + 1);
    }
  };

  const reorderChunk = (start: number, end: number, direction: 'up' | 'down') => {
    const newBlocks = [...blocks];
    const chunk = newBlocks.splice(start, end - start + 1);
    if (direction === 'up') {
      newBlocks.splice(start - 1, 0, ...chunk);
    } else {
      newBlocks.splice(start + 1, 0, ...chunk);
    }
    const oldBlocks = [...blocks];
    for (let i = oldBlocks.length - 1; i >= 0; i--) {
      removeBlock(oldBlocks[i].id);
    }
    for (const b of newBlocks) {
      addBlock({ ...b });
    }
  };

  const handleDelete = (index: number) => {
    const block = blocks[index];
    if (block.groupId && block.isGroupLead) {
      const [groupStart, groupEnd] = findGroupRange(blocks, index);
      const size = groupEnd - groupStart + 1;
      const newBlocks = [...blocks];
      newBlocks.splice(groupStart, size);

      const oldBlocks = [...blocks];
      for (let i = oldBlocks.length - 1; i >= 0; i--) {
        removeBlock(oldBlocks[i].id);
      }
      for (const b of newBlocks) {
        addBlock({ ...b });
      }
    } else if (!block.groupId && !block.locked) {
      removeBlock(block.id);
    }
  };

  useEffect(() => {
    console.log('[BlockList] current blocks:', blocks);
  }, [blocks]);

  /**
   * If the lead block is in raw editing mode, hide the child blocks in that group.
   */
  function shouldRenderBlock(block: Block, index: number): boolean {
    if (block.isGroupLead && block.editingRaw) {
      return true;
    }
    if (block.groupId) {
      const leadIndex = blocks.findIndex(
        (b) => b.groupId === block.groupId && b.isGroupLead
      );
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

        // blockTailClass is e.g. 'block-tail block-tail-purple'
        const blockTailClass = getBlockTailClass(block);

        return (
          <div
            key={block.id}
            className={`relative group p-4 shadow rounded flex flex-col gap-2 border border-gray-200 dark:border-gray-600 ${blockTailClass}`}
          >
            {/* Float the reorder/delete buttons - show only on hover */}
            {canReorderOrDelete && (
              <div className="absolute top-2 right-2 flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                <button
                  onClick={() => handleMoveUp(index)}
                  className={`px-2 py-1 text-xs rounded ${
                    index <= 0
                      ? 'bg-gray-300 dark:bg-gray-600 cursor-not-allowed text-gray-500 dark:text-gray-400'
                      : 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200'
                  }`}
                  disabled={index <= 0}
                >
                  Up
                </button>
                <button
                  onClick={() => handleMoveDown(index)}
                  className={`px-2 py-1 text-xs rounded ${
                    index >= blocks.length - 1
                      ? 'bg-gray-300 dark:bg-gray-600 cursor-not-allowed text-gray-500 dark:text-gray-400'
                      : 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200'
                  }`}
                  disabled={index >= blocks.length - 1}
                >
                  Down
                </button>
                <button
                  onClick={() => handleDelete(index)}
                  className="px-2 py-1 text-xs rounded bg-red-200 hover:bg-red-300 text-red-800"
                >
                  Delete
                </button>
              </div>
            )}

            {/* Render the block editor */}
            <BlockEditor
              block={block}
              onChange={(updated) => updateBlock(updated)}
            />
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
