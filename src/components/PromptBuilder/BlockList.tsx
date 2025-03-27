
/**
 * @file BlockList.tsx
 * @description
 * We list blocks in order, each with its own editor. Blocks can be reordered or deleted,
 * but if they share a groupId, they must move or delete as a single unit.
 *
 * NEW: If the lead block of a template group is in raw editing mode (editingRaw=true),
 * we skip rendering all other blocks in that group, effectively hiding them so the user
 * only sees the lead block's raw edit UI.
 *
 * Also, we fix the reorder logic for grouped blocks. That remains the same.
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
      // single block
      return [startIdx, startIdx];
    }
    const gid = b.groupId;
    // gather indices of all blocks that share the same groupId
    const indices = blocks.map((x, i) => ({ block: x, idx: i }))
      .filter(x => x.block.groupId === gid)
      .map(x => x.idx);
    const minI = Math.min(...indices);
    const maxI = Math.max(...indices);
    return [minI, maxI];
  };

  /**
   * handleMoveUp
   * If block is group lead, move the entire group. Otherwise move just the block.
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
   * If block is group lead, move the entire group. Otherwise move just the block.
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
   * Rendering logic:
   * If a lead block has editingRaw=true, we skip rendering all child blocks
   * in that group. Only the lead block is shown. This way, the user only sees
   * the raw editing UI for the lead block (in TemplateBlockEditor).
   */
  function shouldRenderBlock(block: Block, index: number): boolean {
    // If this block is the group lead and has editingRaw, always render it
    if (block.isGroupLead && block.editingRaw) {
      return true;
    }
    // If this block is in a group whose lead is editing raw, skip it
    if (block.groupId) {
      // find the lead for this group
      const leadIndex = blocks.findIndex(b => b.groupId === block.groupId && b.isGroupLead);
      if (leadIndex !== -1) {
        const leadBlock = blocks[leadIndex];
        if (leadBlock.editingRaw && leadIndex !== index) {
          // It's a child block in an editing group => hide
          return false;
        }
      }
    }
    return true;
  }

  return (
    <div className="space-y-4">
      {blocks.map((block, index) => {
        // Skip rendering if the group lead is in editingRaw mode and this is not the lead
        if (!shouldRenderBlock(block, index)) {
          return null;
        }

        let canReorderOrDelete = false;
        if (!block.locked) {
          // If block.groupId => only if isGroupLead => reorder entire group
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
