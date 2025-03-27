
/**
 * @file BlockList.tsx
 * @description
 * Lists blocks in order, each with its own editor. 
 * Blocks can be reordered or deleted, but if they share a groupId, they
 * move/delete as a single unit. 
 *
 * Changes:
 *  - Removed the display of label and block type from the UI.
 *  - Added background color differences for each block type to visually differentiate:
 *    text => bg-blue-50,
 *    template => bg-purple-50,
 *    files => bg-green-50.
 *  - Buttons remain, but we no longer show the block label or type in the header.
 */

import React, { useEffect } from 'react';
import { usePrompt } from '../../context/PromptContext';
import type { Block } from '../../types/Block';
import BlockEditor from './BlockEditor';

const BlockList: React.FC = () => {
  const { blocks, addBlock, removeBlock, updateBlock, moveBlock } = usePrompt();

  /**
   * findGroupRange
   * If the block has a groupId, gather all blocks that share that groupId.
   * We'll return the min and max indices so we can move them as a chunk.
   */
  const findGroupRange = (startIdx: number): [number, number] => {
    const b = blocks[startIdx];
    if (!b.groupId) {
      return [startIdx, startIdx];
    }
    const gid = b.groupId;
    // gather indices of all blocks that share the same groupId
    const indices = blocks
      .map((x, i) => ({ block: x, idx: i }))
      .filter(x => x.block.groupId === gid)
      .map(x => x.idx);
    const minI = Math.min(...indices);
    const maxI = Math.max(...indices);
    return [minI, maxI];
  };

  /**
   * handleMoveUp
   * If block is group lead, move entire group. Otherwise, move just the block.
   */
  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    const block = blocks[index];
    if (block.groupId && block.isGroupLead) {
      const [groupStart, groupEnd] = findGroupRange(index);
      if (groupStart <= 0) return;
      reorderChunk(groupStart, groupEnd, 'up');
    } else if (!block.groupId && !block.locked) {
      moveBlock(index, index - 1);
    }
  };

  /**
   * handleMoveDown
   * If block is group lead, move entire group. Otherwise, move just the block.
   */
  const handleMoveDown = (index: number) => {
    if (index >= blocks.length - 1) return;
    const block = blocks[index];
    if (block.groupId && block.isGroupLead) {
      const [groupStart, groupEnd] = findGroupRange(index);
      if (groupEnd >= blocks.length - 1) return;
      reorderChunk(groupStart, groupEnd, 'down');
    } else if (!block.groupId && !block.locked) {
      moveBlock(index, index + 1);
    }
  };

  /**
   * reorderChunk
   * Moves the chunk [start, end] up or down by 1 in blocks array
   */
  const reorderChunk = (start: number, end: number, direction: 'up' | 'down') => {
    const newBlocks = [...blocks];
    const chunk = newBlocks.splice(start, end - start + 1);
    if (direction === 'up') {
      newBlocks.splice(start - 1, 0, ...chunk);
    } else {
      newBlocks.splice(start + 1, 0, ...chunk);
    }
    // forcibly reset context blocks
    const oldBlocks = [...blocks];
    for (let i = oldBlocks.length - 1; i >= 0; i--) {
      removeBlock(oldBlocks[i].id);
    }
    for (const b of newBlocks) {
      addBlock({ ...b });
    }
  };

  /**
   * handleDelete
   * If block is group lead, we delete the entire group. Otherwise, just the single block.
   */
  const handleDelete = (index: number) => {
    const block = blocks[index];
    if (block.groupId && block.isGroupLead) {
      const [groupStart, groupEnd] = findGroupRange(index);
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
   * If the lead block is in raw editing mode, we skip rendering the children in that group.
   */
  function shouldRenderBlock(block: Block, index: number): boolean {
    if (block.isGroupLead && block.editingRaw) {
      return true;
    }
    if (block.groupId) {
      const leadIndex = blocks.findIndex(
        b => b.groupId === block.groupId && b.isGroupLead
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

  /**
   * Decide a background color based on block.type.
   */
  function getBlockBgClass(block: Block): string {
    switch (block.type) {
      case 'text':
        return 'bg-blue-50';
      case 'template':
        return 'bg-purple-50';
      case 'files':
        return 'bg-green-50';
      default:
        return 'bg-gray-50';
    }
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

        // Determine block background
        const blockBgClass = getBlockBgClass(block);

        return (
          <div
            key={block.id}
            className={`${blockBgClass} p-4 shadow rounded flex flex-col gap-2 border border-gray-200 dark:border-gray-600`}
          >
            {/* Top row: reorder/delete if allowed */}
            {canReorderOrDelete && (
              <div className="flex items-center justify-end space-x-2">
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

            {/* Block editor */}
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
