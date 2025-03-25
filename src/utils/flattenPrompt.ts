
/**
 * @file flattenPrompt.ts
 * @description
 * Exports a utility function to convert an array of blocks (text, template, files)
 * into a single flattened string suitable for copy/paste into an AI model.
 *
 * Key Responsibilities:
 * 1) For text blocks, include the freeform text directly.
 * 2) For template blocks, include content as-is (placeholders are NOT replaced in MVP).
 * 3) For file blocks, wrap each file content in:
 *    <file_contents>
 *    File: /path/to/file
 *    ```language
 *    [file content]
 *    ```
 *    </file_contents>
 * 4) Separate each block with blank lines for readability.
 *
 * @notes
 * - We keep template placeholders (e.g. {{variable}}) as-is for now.
 * - Future enhancements could replace placeholders with default or user-supplied variables.
 * - This function is used by the getFlattenedPrompt() method in PromptContext and 
 *   by any UI elements that display or copy the final prompt.
 */

import { Block, TextBlock, TemplateBlock, FilesBlock } from '../types/Block';

/**
 * flattenBlocks
 * @param blocks - An array of blocks in the order they appear in the prompt.
 * @returns A single multiline string representing the final prompt.
 *
 * Example usage:
 *   const promptString = flattenBlocks(blocks);
 *   console.log(promptString);
 */
export function flattenBlocks(blocks: Block[]): string {
  const lines: string[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case 'text': {
        const textBlock = block as TextBlock;
        lines.push(textBlock.content);
        break;
      }

      case 'template': {
        const templateBlock = block as TemplateBlock;
        // MVP approach: just push the template content as-is, placeholders included
        lines.push(templateBlock.content);
        break;
      }

      case 'files': {
        const filesBlock = block as FilesBlock;
        for (const fileObj of filesBlock.files) {
          // Example format:
          // <file_contents>
          // File: /path/to/file.ext
          // ```ext
          // [file content]
          // ```
          // </file_contents>
          const filePath = fileObj.path;
          const language = fileObj.language || 'plaintext';
          const fileContent = fileObj.content;

          const fileString = [
            '<file_contents>',
            `File: ${filePath}`,
            '```' + language,
            fileContent.trimEnd(),
            '```',
            '</file_contents>'
          ].join('\n');

          lines.push(fileString);
        }
        break;
      }

      default:
        // Fallback, should not happen if we've covered all block types
        lines.push(`(Unknown block type: ${block.type})`);
        break;
    }
  }

  // Separate blocks with a blank line for readability
  return lines.join('\n\n');
}
