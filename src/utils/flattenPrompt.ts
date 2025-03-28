/**
 * @file flattenPrompt.ts
 * @description
 * Generates a single multiline prompt string from an array of blocks,
 * resolving any nested placeholders. But we now remove the extra whitespace
 * (newlines) that was previously inserted around tags.
 */

import { Block, TextBlock, TemplateBlock, FilesBlock, PromptResponseBlock } from '../types/Block';
import { resolveNestedTemplates } from './templateResolver';

export async function flattenBlocksAsync(blocks: Block[]): Promise<string> {
  let finalString = '';

  for (const block of blocks) {
    if (block.type === 'text') {
      const textBlock = block as TextBlock;
      // Just pass the content directly into nested placeholders
      const resolved = await resolveNestedTemplates(textBlock.content);
      // Removed "\n\n", so we just append the content with no extra whitespace
      finalString += resolved;
    } else if (block.type === 'template') {
      const templateBlock = block as TemplateBlock;
      // Apply variable substitution
      let substituted = templateBlock.content;
      for (const variable of templateBlock.variables) {
        const varPattern = new RegExp(`\\{\\{${variable.name}\\}\\}`, 'g');
        substituted = substituted.replace(varPattern, variable.default);
      }
      const resolved = await resolveNestedTemplates(substituted);
      finalString += resolved;
    } else if (block.type === 'files') {
      const filesBlock = block as FilesBlock;
      const mapToInclude = filesBlock.includeProjectMap ?? true;
      if (mapToInclude && filesBlock.projectAsciiMap) {
        const resolvedMap = await resolveNestedTemplates(filesBlock.projectAsciiMap);
        finalString += resolvedMap;
      }
      for (const file of filesBlock.files) {
        const snippet = `<file_contents>
File: ${file.path}
\`\`\`${file.language}
${file.content}
\`\`\`
</file_contents>`;
        const resolvedSnippet = await resolveNestedTemplates(snippet);
        finalString += resolvedSnippet;
      }
    } else if (block.type === 'promptResponse') {
      const prBlock = block as PromptResponseBlock;
      const resolved = await resolveNestedTemplates(prBlock.content);
      finalString += resolved;
    }
  }

  // Trim leading/trailing whitespace
  return finalString.trim();
}
