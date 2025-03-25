
/**
 * @file flattenPrompt.ts
 * @description
 * Exports a utility function to convert an array of blocks (text, template, files)
 * into a single flattened string suitable for copy/paste into an AI model.
 *
 * Key Responsibilities:
 * 1) For text blocks, include the freeform text directly.
 * 2) For template blocks, include content as-is (placeholders not replaced).
 * 3) For file blocks:
 *    - If includeProjectMap is true, insert the projectAsciiMap first.
 *    - Then embed each file's content in <file_contents> sections.
 *
 * Step 17B Changes:
 *  - We now conditionally check `block.includeProjectMap` to decide if we push
 *    the ASCII map lines into the final output. If false, we skip them.
 *  - We still always embed the file contents (the user can handle skipping them
 *    by removing them in the UI, but typically we keep them).
 *
 * @notes
 *  - The UI no longer shows raw file content for editing, but it's still embedded.
 *  - This function does not strip out any files. If a user toggles "Include File Map"
 *    off, we just skip the map, not the actual files.
 */

import { Block, TextBlock, TemplateBlock, FilesBlock } from '../types/Block';

/**
 * flattenBlocks
 * @param blocks - An array of blocks in the order they appear in the prompt.
 * @returns A single multiline string representing the final prompt.
 *
 * Implementation details:
 *  - Blocks are separated by a blank line in the final output.
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
        // Conditionally include the projectAsciiMap
        const shouldIncludeMap = filesBlock.includeProjectMap ?? true;
        if (shouldIncludeMap && filesBlock.projectAsciiMap) {
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
