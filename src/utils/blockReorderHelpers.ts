
/**
 * @file blockReorderHelpers.ts
 * @description
 * Provides reusable helper functions for reordering blocks in the Prompt Composer.
 * 
 * Exported Functions:
 * 1) findGroupRange(blocks, startIdx):
 *    - Given an array of blocks and a starting index, returns the min and max
 *      indices of all blocks sharing the same groupId as the block at startIdx.
 *    - If the block at startIdx has no groupId, it simply returns [startIdx, startIdx].
 *
 * 2) reorderBlocksInRange(blocks, start, end, direction):
 *    - Creates a new array of blocks by moving the chunk spanning [start, end] up or down by one position.
 *    - If direction is "up", the chunk is inserted just before start-1.
 *    - If direction is "down", the chunk is inserted right after end+1.
 *    - Returns the newly reordered array without mutating the original.
 *
 * Usage:
 *   import { findGroupRange, reorderBlocksInRange } from '../utils/blockReorderHelpers';
 *   const [groupStart, groupEnd] = findGroupRange(blocks, index);
 *   const newBlocks = reorderBlocksInRange(blocks, groupStart, groupEnd, 'up');
 *
 * Implementation Note:
 *   This refactor is part of Step 2 in the implementation plan: "Extract Reorder Logic from BlockList".
 *   We move logic from BlockList.tsx into this dedicated helper for clarity and reuse.
 *
 * @author Prompt Composer
 * @version 1.0
 */

import { Block } from '../types/Block';

/**
 * findGroupRange
 * Identifies the min and max index of blocks that share the same groupId as the block
 * at position startIdx. If that block has no groupId, returns [startIdx, startIdx].
 * 
 * @param blocks - The array of blocks
 * @param startIdx - Index of the reference block
 * @returns A tuple [minIndex, maxIndex] representing the contiguous sub-array that shares groupId
 */
export function findGroupRange(blocks: Block[], startIdx: number): [number, number] {
  const referenceBlock = blocks[startIdx];
  if (!referenceBlock.groupId) {
    // No group, so it's just this block
    return [startIdx, startIdx];
  }
  const gid = referenceBlock.groupId;

  // Collect indices of all blocks with the same groupId
  const indices = blocks
    .map((blk, i) => (blk.groupId === gid ? i : -1))
    .filter(i => i !== -1);

  const minI = Math.min(...indices);
  const maxI = Math.max(...indices);
  return [minI, maxI];
}

/**
 * reorderBlocksInRange
 * Moves a chunk of blocks spanning [start, end] up or down by one position in the array.
 * 
 * @param blocks - The current array of blocks
 * @param start - The starting index of the chunk
 * @param end - The ending index of the chunk
 * @param direction - "up" or "down", indicating which direction to move the chunk
 * @returns A new array of blocks with the chunk moved in the specified direction
 *
 * Implementation detail:
 *   - We first copy the array (so we don't mutate the original).
 *   - We remove the chunk (splice) and then splice it back in the new position.
 *   - If direction is 'up', we insert at start-1.
 *   - If direction is 'down', we insert at start+1.
 */
export function reorderBlocksInRange(
  blocks: Block[],
  start: number,
  end: number,
  direction: 'up' | 'down'
): Block[] {
  // Copy the array so as not to mutate
  const newBlocks = [...blocks];

  // Remove the chunk
  const chunk = newBlocks.splice(start, end - start + 1);

  if (direction === 'up') {
    newBlocks.splice(start - 1, 0, ...chunk);
  } else {
    // direction === 'down'
    newBlocks.splice(start + 1, 0, ...chunk);
  }

  return newBlocks;
}
