/**
 * @file promptActions.ts
 * @description
 * Centralizes logic for:
 *   1) Flattening the entire prompt composition into a single string.
 *   2) Calculating token usage across all blocks.
 *
 * This step extracts these responsibilities out of PromptContext to keep the context
 * focused on state management, not heavy logic. We now expose two primary functions:
 *
 *   - flattenPrompt()
 *   - calculateTokenUsage()
 *
 * The PromptContext can call these functions to generate the final prompt or compute
 * token counts.
 *
 * @notes
 * - flattenPrompt() calls generateAsciiTree() to inject the file map if needed
 *   for any FilesBlock that lacks a cached projectAsciiMap.
 * - calculateTokenUsage() sums tokens for each block (using tokenEstimator).
 * - We rely on flattenBlocksAsync to do the actual insertion of file content
 *   and final assembly of the multiline string once placeholders are resolved.
 */

import { Block, FilesBlock } from '../types/Block';
import { generateAsciiTree } from './asciiTreeGenerator';
import { flattenBlocksAsync } from './flattenPrompt';
import { estimateTokens } from './tokenEstimator';

/**
 * Represents the structure of token usage results,
 * with a total token count plus per-block breakdown.
 */
export interface TokenUsage {
  total: number;
  byBlock: Array<{
    blockId: string;
    tokens: number;
  }>;
}

/**
 * flattenPrompt
 * @description
 * Produces a final multiline string from the composition. This includes:
 *  - Generating an ASCII file map for any FilesBlock with includeProjectMap=true
 *    if it doesn't already have a projectAsciiMap cached.
 *  - Appending all selected files inside <file_contents> tags.
 *  - Concatenating text/template blocks as raw text.
 *  - Preserving promptResponse block content in place.
 *
 * @param blocks - The array of blocks from the prompt composition
 * @param projectFolders - The array of project root folders used to build the ASCII file map if needed
 * @param selectedFileEntries - The user's tri-state selected file list
 * @returns A promise resolving to the fully flattened prompt string
 */
export async function flattenPrompt(
  blocks: Block[],
  projectFolders: string[],
  selectedFileEntries: Array<{ path: string; content: string; language: string }>
): Promise<string> {
  // Make a shallow copy of blocks to manipulate any file block's projectAsciiMap
  const updatedBlocks = [...blocks];

  // For each files block that wants a project map, try generating it if it's missing
  for (let i = 0; i < updatedBlocks.length; i++) {
    const blk = updatedBlocks[i];
    if (blk.type === 'files') {
      const fb = blk as FilesBlock;
      const needsMap = fb.includeProjectMap && (!fb.projectAsciiMap || !fb.projectAsciiMap.trim());
      if (needsMap) {
        if (projectFolders.length > 0) {
          fb.projectAsciiMap = await generateAsciiTree(projectFolders);
        } else {
          fb.projectAsciiMap = '';
        }
        updatedBlocks[i] = fb;
      }
    }
  }

  // Now flatten everything (insert file contents, etc.)
  const finalPrompt = await flattenBlocksAsync(updatedBlocks, selectedFileEntries);
  return finalPrompt;
}

/**
 * calculateTokenUsage
 * @description
 * Computes the total tokens used by each block. For files blocks, we combine
 * the optional ASCII map (if included) plus each selected file's content into one string
 * before counting. For text/template/promptResponse blocks, we count them directly.
 *
 * @param blocks - The array of blocks from the prompt composition
 * @param model - The language model name to pass to the Tiktoken library
 * @param selectedFileEntries - The user's tri-state selected file list
 * @returns A TokenUsage object with total and a byBlock array
 */
export function calculateTokenUsage(
  blocks: Block[],
  model: string,
  selectedFileEntries: Array<{ path: string; content: string; language: string }>
): TokenUsage {
  const usage: TokenUsage = {
    total: 0,
    byBlock: [],
  };

  for (const block of blocks) {
    let contentToCount = '';

    switch (block.type) {
      case 'text':
      case 'template':
      case 'promptResponse':
        contentToCount = block.content || '';
        break;

      case 'files':
        {
          const fb = block as FilesBlock;
          // Possibly include ASCII map
          if (fb.includeProjectMap && fb.projectAsciiMap) {
            contentToCount += fb.projectAsciiMap.trimEnd() + '\n';
          }
          // Then append the selected files
          for (const entry of selectedFileEntries) {
            contentToCount += `<file_contents>\nFile: ${entry.path}\n\`\`\`${entry.language}\n${entry.content}\n\`\`\`\n</file_contents>\n`;
          }
        }
        break;

      default:
        // unknown block => skip or fallback to empty
        break;
    }

    const tokens = estimateTokens(contentToCount, model) || 0;
    usage.total += tokens;
    usage.byBlock.push({ blockId: block.id, tokens });
  }

  return usage;
}
