
/**
 * @file flattenPrompt.ts
 * @description
 * Exports a utility function to convert an array of blocks (text, template, files)
 * into a single flattened string suitable for copy/paste into an AI model.
 *
 * Key Responsibilities:
 * 1) For text blocks, include the freeform text directly.
 * 2) For template blocks, include content as-is (placeholders not replaced in MVP).
 * 3) For file blocks, now we first include the optional projectAsciiMap if present:
 *    <file_map>...</file_map>
 *    Then for each file, wrap file content in <file_contents> sections.
 *
 * The final output is a multiline string. Blocks are separated by blank lines.
 */

import { Block, TextBlock, TemplateBlock, FilesBlock } from '../types/Block';

/**
 * flattenBlocks
 * @param blocks - An array of blocks in the order they appear in the prompt.
 * @returns A single multiline string representing the final prompt.
 *
 * If a FilesBlock has projectAsciiMap, we place it right before the actual file contents.
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
        // MVP approach: just push the template content as-is
        lines.push(templateBlock.content);
        break;
      }

      case 'files': {
        const filesBlock = block as FilesBlock;
        // If we have a file map, insert it first
        if (filesBlock.projectAsciiMap && filesBlock.projectAsciiMap.trim().length > 0) {
          // Make sure it's separated nicely
          lines.push(filesBlock.projectAsciiMap.trim());
        }

        // Then each file's content is included
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
        lines.push(`(Unknown block type: ${block.type})`);
        break;
    }
  }

  // Separate blocks with a blank line
  return lines.join('\n\n');
}
