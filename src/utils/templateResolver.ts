/**
 * @file templateResolver.ts
 * @description
 * Provides functions to recursively resolve placeholders of the form {{TEMPLATE_NAME}}
 * by loading template files from project or global .prompt-composer directories,
 * then expanding further placeholders found in those files.
 *
 * Implementation logic:
 *  - For each {{NAME}}, we do:
 *    1) tryReadTemplateFile(NAME)
 *    2) If found, recursively expand placeholders in that file content
 *    3) If not found, leave placeholder as-is
 *  - We maintain a visited set to avoid infinite loops from cyclical references.
 *
 * Step 3 Changes:
 *  - We removed the local tryReadTemplateFile function in favor of the shared
 *    function from './readTemplateFile'.
 */

import { tryReadTemplateFile } from './readTemplateFile';

const PLACEHOLDER_REGEX = /\{\{([A-Za-z0-9_\-]+(\.[A-Za-z0-9]+)?)\}\}/g;

/**
 * Recursively resolves placeholders in the given content by loading
 * corresponding files from either project or global .prompt-composer.
 *
 * @param content - The text containing placeholders like {{SOME_TEMPLATE}}
 * @param visited - A set of placeholder names already visited, to avoid infinite recursion
 * @returns The fully expanded text
 */
export async function resolveNestedTemplates(
  content: string,
  visited: Set<string> = new Set()
): Promise<string> {
  if (!content) return content;

  let match: RegExpExecArray | null;
  let resolvedContent = content;

  // We keep looping to handle newly introduced placeholders after replacements
  while ((match = PLACEHOLDER_REGEX.exec(resolvedContent)) !== null) {
    const placeholderFull = match[0]; // e.g. "{{HELLO}}"
    const placeholderName = match[1]; // e.g. "HELLO" or "HELLO.txt"

    if (visited.has(placeholderName)) {
      console.warn(
        `[templateResolver] Detected loop for placeholder "{{${placeholderName}}}". Skipping expansion.`
      );
      continue;
    }

    visited.add(placeholderName);

    let replacementText: string | null = null;
    try {
      const fileContent = await tryReadTemplateFile(placeholderName);
      if (fileContent) {
        replacementText = await resolveNestedTemplates(fileContent, visited);
      }
    } catch (err) {
      console.error(`[templateResolver] Error loading template "${placeholderName}"`, err);
    }

    if (replacementText) {
      resolvedContent = resolvedContent.replace(placeholderFull, replacementText);
      PLACEHOLDER_REGEX.lastIndex = 0;
    } else {
      console.warn(
        `[templateResolver] No file found for "{{${placeholderName}}}". Leaving placeholder as-is.`
      );
    }
  }

  return resolvedContent;
}
