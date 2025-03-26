
/**
 * @file flattenPrompt.ts
 * @description
 * Converts an array of blocks into a single flattened string for copy/paste.
 * We expand text blocks, template blocks, and files blocks in order.
 * 
 * Step 5 (Nested Template Support):
 *  - For template blocks, after we push the block.content, we pass it through
 *    a new utility function expandTemplatePlaceholders (from templateResolver.ts)
 *    to recursively load and expand placeholders referencing .prompt-composer
 *    files (e.g., {{MY_TEMPLATE}}).
 * 
 *  - If a file for a given placeholder is not found, we leave the placeholder 
 *    as-is. 
 *  - We handle infinite recursion in expandTemplatePlaceholders with a visited set.
 *
 * Dependencies:
 *  - expandTemplatePlaceholders from templateResolver.ts
 */

import { Block, TextBlock, TemplateBlock, FilesBlock } from '../types/Block';
import { expandTemplatePlaceholders } from './templateResolver';

/**
 * flattenBlocks
 * @param blocks - An array of blocks in the order they appear in the prompt.
 * @returns A single multiline string representing the final prompt.
 *
 * Implementation details:
 *  - Blocks are separated by a blank line in the final output.
 *  - For text/ template blocks, we expand them with or without placeholders.
 *  - For file blocks, we embed file contents. If includeProjectMap is true, 
 *    we also embed the projectAsciiMap.
 */
export function flattenBlocks(blocks: Block[]): string {
  // We'll build an array of partial strings, then join them with blank lines
  const lines: string[] = [];

  // We must handle template placeholders asynchronously, so we do that in 
  // a single pass at the end. However, flattenBlocks is synchronous. 
  // We'll do a 2-phase approach:
  //   1) Gather partial (text) expansions in memory
  //   2) Because expandTemplatePlaceholders is async, we can't easily do it inline 
  //      in a pure sync function. We'll do a synchronous approach with warnings,
  //      or we can convert flattenBlocks to an async function for real usage.
  // For now, let's convert flattenBlocks to an async approach for correctness.
  throw new Error(
    "[flattenBlocks] This function needs to be async to handle placeholder expansions properly. Please use flattenBlocksAsync instead."
  );
}

/**
 * flattenBlocksAsync
 * An async version of flattenBlocks that can expand placeholders using
 * electron-based file reads. This is the recommended function going forward.
 *
 * @param blocks - The array of blocks to flatten.
 * @returns A Promise<string> that resolves to the final flattened prompt.
 */
export async function flattenBlocksAsync(blocks: Block[]): Promise<string> {
  const blockOutputs: string[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case 'text': {
        const textBlock = block as TextBlock;
        // No placeholders by default, but user might have typed placeholders in a text block anyway:
        const expanded = await expandTemplatePlaceholders(textBlock.content);
        blockOutputs.push(expanded);
        break;
      }

      case 'template': {
        const templateBlock = block as TemplateBlock;
        // Expand placeholders in the template block content
        const expandedTemplate = await expandTemplatePlaceholders(templateBlock.content);
        blockOutputs.push(expandedTemplate);
        break;
      }

      case 'files': {
        const filesBlock = block as FilesBlock;
        const shouldIncludeMap = filesBlock.includeProjectMap ?? true;

        if (shouldIncludeMap && filesBlock.projectAsciiMap) {
          // We do not expand placeholders in the ASCII map, but if user wants that, we could
          blockOutputs.push(filesBlock.projectAsciiMap.trim());
        }

        // Then embed each file
        for (const fileObj of filesBlock.files) {
          const filePath = fileObj.path;
          const language = fileObj.language || 'plaintext';
          const fileContent = fileObj.content.trimEnd();

          const fileString = [
            '<file_contents>',
            `File: ${filePath}`,
            '```' + language,
            fileContent,
            '```',
            '</file_contents>'
          ].join('\n');

          blockOutputs.push(fileString);
        }

        break;
      }

      default:
        blockOutputs.push(`(Unknown block type: ${block.type})`);
        break;
    }
  }

  // Separate blocks with blank lines
  return blockOutputs.join('\n\n');
}
