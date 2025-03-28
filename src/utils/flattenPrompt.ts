/**
 * @file flattenPrompt.ts
 * @description
 * Generates a single multiline prompt string from the array of blocks,
 * resolving any nested placeholders.
 *
 * Step 4 Changes:
 *  - Add support for 'promptResponse' block type, which simply appends its content
 *    like a normal text block.
 */

import { Block, TextBlock, TemplateBlock, FilesBlock, PromptResponseBlock } from '../types/Block';
import { resolveNestedTemplates } from './templateResolver';

export async function flattenBlocksAsync(blocks: Block[]): Promise<string> {
  let finalString = '';

  for (const block of blocks) {
    if (block.type === 'text') {
      const textBlock = block as TextBlock;
      const resolved = await resolveNestedTemplates(textBlock.content);
      finalString += resolved + '\n\n';
    } else if (block.type === 'template') {
      const templateBlock = block as TemplateBlock;
      let substituted = templateBlock.content;
      for (const variable of templateBlock.variables) {
        const varPattern = new RegExp(`\\{\\{${variable.name}\\}\\}`, 'g');
        substituted = substituted.replace(varPattern, variable.default);
      }
      const resolved = await resolveNestedTemplates(substituted);
      finalString += resolved + '\n\n';
    } else if (block.type === 'files') {
      const filesBlock = block as FilesBlock;
      const mapToInclude = filesBlock.includeProjectMap ?? true;
      if (mapToInclude && filesBlock.projectAsciiMap) {
        const resolvedMap = await resolveNestedTemplates(filesBlock.projectAsciiMap);
        finalString += resolvedMap + '\n';
      }
      for (const file of filesBlock.files) {
        const snippet = `<file_contents>
File: ${file.path}
\`\`\`${file.language}
${file.content}
\`\`\`
</file_contents>`;
        const resolvedSnippet = await resolveNestedTemplates(snippet);
        finalString += resolvedSnippet + '\n\n';
      }
    } else if (block.type === 'promptResponse') {
      // Step 4: just treat it as text appended to the final
      const prBlock = block as PromptResponseBlock;
      const resolved = await resolveNestedTemplates(prBlock.content);
      finalString += resolved + '\n\n';
    }
  }

  return finalString.trim();
}
