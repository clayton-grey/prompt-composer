
/**
 * @file BlockList.tsx
 * @description
 * We revert to a simpler approach: we list blocks in order. 
 * For each block:
 *   - If it has a groupId, we treat it as part of a prefab:
 *       - If isGroupLead: show reorder/delete for the entire group
 *       - If not lead: no reorder/delete
 *   - If it has no groupId: it's a standalone block with reorder/delete (unless locked).
 *
 * We still want to reorder the entire group if we move the lead block. We'll gather all
 * blocks that share that groupId, move them as a chunk. If the block is standalone (no groupId),
 * we just move that single block. 
 * Deletion is likewise chunk-based if there's a groupId lead, or single if no group.
 *
 * This approach ensures the user can reorder or delete normal blocks (not locked). If a block is locked
 * but no groupId, it's individually locked. If a block is locked and has a groupId, that means it's
 * from a prefab. 
 *
 * Implementation details:
 *   - "moveBlockUp / moveBlockDown" either moves one block or the entire group in the array.
 *   - "deleteBlock" either deletes that single block or the entire group if groupId is set (and isGroupLead).
 */

import React, { useEffect, useCallback } from 'react';
import { usePrompt } from '../../context/PromptContext';
import type { Block } from '../../types/Block';
import BlockEditor from './BlockEditor';

const BlockList: React.FC = () => {
  const { blocks, addBlock, removeBlock, updateBlock, moveBlock } = usePrompt();

  /**
   * findGroupRange
   * If the block has a groupId, gather the range of consecutive blocks that share that groupId.
   * Returns [startIndex, endIndex].
   */
  const findGroupRange = (startIdx: number): [number, number] => {
    const b = blocks[startIdx];
    if (!b.groupId) {
      // single block
      return [startIdx, startIdx];
    }
    const gid = b.groupId;
    // We want to find all consecutive blocks from 'startIdx' onward that share groupId,
    // and also from 'startIdx' backward. However, the user might not want them scattered
    // if the user inserted them in certain ways. Usually prefab blocks are consecutive,
    // but let's be certain. We'll gather *all* blocks in the entire array that share groupId.
    // The user specifically wants them to move as a chunk. We can do a simpler approach:
    // We'll find all blocks with groupId in the entire array. We'll find the min index and max index
    // among them. That means the group is not necessarily consecutive, but let's do it anyway,
    // because the user wants them all to move together.
    // So let's gather indices:
    const indices = blocks.map((x, i) => ({ block: x, idx: i }))
      .filter(x => x.block.groupId === gid)
      .map(x => x.idx);
    const minI = Math.min(...indices);
    const maxI = Math.max(...indices);
    return [minI, maxI];
  };

  /**
   * handleMoveUp
   * If the block is group lead, we move the entire group. Otherwise, if it's a normal block, we move it alone.
   */
  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    const block = blocks[index];
    if (block.groupId && block.isGroupLead) {
      // move entire group
      const [groupStart, groupEnd] = findGroupRange(index);
      if (groupStart <= 0) return;
      // Move the entire chunk up by 1
      // We'll do a naive approach: move each block in that chunk one step up, from groupStart to groupEnd
      // But we want them to remain consecutive. The easiest is to do a "remove chunk then reinsert" approach
      reorderChunk(groupStart, groupEnd, 'up');
    } else if (!block.groupId && !block.locked) {
      // single block, move up
      moveBlock(index, index - 1);
    }
  };

  const handleMoveDown = (index: number) => {
    if (index >= blocks.length - 1) return;
    const block = blocks[index];
    if (block.groupId && block.isGroupLead) {
      // move entire group
      const [groupStart, groupEnd] = findGroupRange(index);
      if (groupEnd >= blocks.length - 1) return;
      reorderChunk(groupStart, groupEnd, 'down');
    } else if (!block.groupId && !block.locked) {
      // single block
      moveBlock(index, index + 1);
    }
  };

  /**
   * reorderChunk
   * Moves the chunk [start, end] up or down by 1 in the array of blocks, preserving order within the chunk.
   */
  const reorderChunk = (start: number, end: number, direction: 'up' | 'down') => {
    // We'll do a local array copy, remove the chunk, then reinsert.
    const newBlocks = [...blocks];
    const chunk = newBlocks.splice(start, end - start + 1); // the chunk

    if (direction === 'up') {
      // reinsert at start-1
      newBlocks.splice(start - 1, 0, ...chunk);
    } else {
      // reinsert at end+1
      newBlocks.splice(start + 1, 0, ...chunk);
    }

    // Now we remove everything from the context in the old order, then re-add them in the new order:
    // We'll do a quick hack: removeBlock from the end forward, then add them in new order. 
    // This is what we did previously. It's a bit hacky but works for now.
    const oldBlocks = [...blocks];
    for (let i = oldBlocks.length - 1; i >= 0; i--) {
      removeBlock(oldBlocks[i].id);
    }
    for (const b of newBlocks) {
      // We can do addBlock(b) if we have addBlock. We'll replicate the block data. 
      // We'll do a small omit or keep it as is. 
      addBlock({ ...b });
    }
  };

  /**
   * handleDelete
   * If the block is group lead, we delete the entire group. Else if it's a single block, delete it alone.
   */
  const handleDelete = (index: number) => {
    const block = blocks[index];
    if (block.groupId && block.isGroupLead) {
      // delete entire group
      const [groupStart, groupEnd] = findGroupRange(index);
      const groupSize = groupEnd - groupStart + 1;
      const newBlocks = [...blocks];
      newBlocks.splice(groupStart, groupSize);
      // forcibly replace in context
      const oldBlocks = [...blocks];
      for (let i = oldBlocks.length - 1; i >= 0; i--) {
        removeBlock(oldBlocks[i].id);
      }
      for (const b of newBlocks) {
        addBlock({ ...b });
      }
    } else if (!block.groupId && !block.locked) {
      // single block
      removeBlock(block.id);
    }
  };

  useEffect(() => {
    console.log('[BlockList] current blocks:', blocks);
  }, [blocks]);

  return (
    <div className="space-y-4">
      {blocks.map((block, index) => {
        const isFirst = index === 0;
        const isLast = index === blocks.length - 1;

        // Determine if we show reorder/delete:
        let canReorderOrDelete = false;

        // If block is locked => no
        if (!block.locked) {
          // If block.groupId => only if block.isGroupLead => reorder entire group
          if (block.groupId) {
            if (block.isGroupLead) {
              canReorderOrDelete = true;
            }
          } else {
            // no group => normal block
            canReorderOrDelete = true;
          }
        }

        return (
          <div key={block.id} className="p-4 bg-white dark:bg-gray-700 shadow rounded flex flex-col gap-2">
            {/* Top row: label + reorder/delete (if allowed) */}
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-gray-800 dark:text-gray-100">
                {block.label} (Type: {block.type})
              </h2>

              {canReorderOrDelete && (
                <div className="space-x-2">
                  <button
                    onClick={() => handleMoveUp(index)}
                    className={`px-2 py-1 text-sm rounded ${
                      index <= 0
                        ? 'bg-gray-300 dark:bg-gray-600 cursor-not-allowed text-gray-500 dark:text-gray-400'
                        : 'bg-blue-500 hover:bg-blue-600 text-white'
                    }`}
                    disabled={index <= 0}
                  >
                    Up
                  </button>
                  <button
                    onClick={() => handleMoveDown(index)}
                    className={`px-2 py-1 text-sm rounded ${
                      index >= blocks.length - 1
                        ? 'bg-gray-300 dark:bg-gray-600 cursor-not-allowed text-gray-500 dark:text-gray-400'
                        : 'bg-blue-500 hover:bg-blue-600 text-white'
                    }`}
                    disabled={index >= blocks.length - 1}
                  >
                    Down
                  </button>
                  <button
                    onClick={() => handleDelete(index)}
                    className="px-2 py-1 text-sm rounded bg-red-500 hover:bg-red-600 text-white"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>

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
