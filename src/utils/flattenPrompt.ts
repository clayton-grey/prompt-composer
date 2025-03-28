/**
 * @file flattenPrompt.ts
 * @description
 * Flatten the array of blocks into a single multiline string, embedding file block output
 * from the tri-state selection if the user has toggled "includeProjectMap" to true.
 *
 * In this update, we remove the fallback "?? true" for includeProjectMap, so we strictly
 * respect the boolean in the block. If it's false, we do not embed the ASCII map.
 */

import { Block, TextBlock, TemplateBlock, FilesBlock, PromptResponseBlock } from '../types/Block';

/**
 * Flatten blocks into a single string, using the user's tri-state file selection.
 */
export async function flattenBlocksAsync(
  blocks: Block[],
  selectedFileEntries: Array<{ path: string; content: string; language: string }>
): Promise<string> {
  let finalString = '';

  for (const block of blocks) {
    switch (block.type) {
      case 'text': {
        finalString += block.content;
        break;
      }

      case 'template': {
        finalString += block.content;
        break;
      }

      case 'files': {
        const fb = block as FilesBlock;
        // If includeProjectMap is true and we have a projectAsciiMap, embed it
        if (fb.includeProjectMap && fb.projectAsciiMap) {
          finalString += fb.projectAsciiMap.trimEnd() + '\n';
        }
        // Then embed the user-selected files
        for (const file of selectedFileEntries) {
          finalString += `<file_contents>\nFile: ${file.path}\n\`\`\`${file.language}\n${file.content}\n\`\`\`\n</file_contents>\n`;
        }
        break;
      }

      case 'promptResponse': {
        finalString += block.content;
        break;
      }

      default:
        // unknown block => skip or fallback
        break;
    }

    finalString += '\n';
  }

  return finalString.trim();
}
