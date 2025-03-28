/**
 * @file flattenPrompt.ts
 * @description
 * Functions to generate a single multiline prompt from an array of blocks (text, template, files).
 * 
 * Now we handle nested template expansion by calling `resolveNestedTemplates` if we detect
 * placeholders of the form {{TEMPLATE_NAME}}. For TemplateBlocks, we also apply their variable
 * substitutions before calling the nested resolver.
 *
 * Exports:
 * - flattenBlocksAsync(blocks: Block[]): Promise<string>
 *   Asynchronously resolves all block content, including reading .prompt-composer files.
 */

import { Block, TextBlock, TemplateBlock, FilesBlock } from '../types/Block';
import { resolveNestedTemplates } from './templateResolver';

/**
 * Flatten the array of blocks into a single string, asynchronously substituting nested templates.
 */
export async function flattenBlocksAsync(blocks: Block[]): Promise < string > {
  let finalString = '';

  for (const block of blocks) {
    if (block.type === 'text') {
      const textBlock = block as TextBlock;
      // Just pass the content directly into nested placeholders if any
      const resolved = await resolveNestedTemplates(textBlock.content);
      finalString += resolved + '\n\n';
    } else if (block.type === 'template') {
      const templateBlock = block as TemplateBlock;

      // 1) Apply variable substitution
      let substituted = templateBlock.content;
      for (const variable of templateBlock.variables) {
        // Replace all occurrences of {{variable.name}} with variable.default
        const varPattern = new RegExp(`\\{\\{${variable.name}\\}\\}`, 'g');
        substituted = substituted.replace(varPattern, variable.default);
      }

      // 2) Now handle any nested references to .prompt-composer files
      const resolved = await resolveNestedTemplates(substituted);
      finalString += resolved + '\n\n';
    } else if (block.type === 'files') {
      const filesBlock = block as FilesBlock;

      // If includeProjectMap is true, add the ascii map first
      const mapToInclude = filesBlock.includeProjectMap ?? true;
      if (mapToInclude && filesBlock.projectAsciiMap) {
        // Potentially also has placeholders that reference .prompt-composer
        const resolvedMap = await resolveNestedTemplates(filesBlock.projectAsciiMap);
        finalString += resolvedMap + '\n';
      }

      // Now add each file's content with <file_contents> wrappers
      for (const file of filesBlock.files) {
        // We'll do a standard snippet
        const snippet = `<file_contents>
File: ${file.path}
\`\`\`${file.language}
${file.content}
\`\`\`
</file_contents>`;

        // Potentially the file content might also have placeholders (rare, but possible)
        const resolvedSnippet = await resolveNestedTemplates(snippet);
        finalString += resolvedSnippet + '\n\n';
      }
    }
  }

  return finalString.trim();
}
