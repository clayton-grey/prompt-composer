
/**
 * @file templateResolver.ts
 * @description
 * Provides functions to recursively resolve placeholders of the form {{TEMPLATE_NAME}}
 * by loading template files from the project or global .prompt-composer directories.
 *
 * We fix nested references so that if reading from the project fails, we fallback
 * to reading from global. Also, if the placeholder has no extension, we try ".txt"
 * and ".md" in both project and global contexts.
 *
 * Implementation logic:
 *  - For each {{NAME}}, we do:
 *    1) try readPromptComposerFile(NAME)
 *    2) if not found, try readGlobalPromptComposerFile(NAME)
 *    3) if no extension in NAME, try appending .txt / .md for project, then global
 *    4) if still not found, leave placeholder as-is
 *
 *  - We maintain a visited set to avoid infinite loops.
 */

const PLACEHOLDER_REGEX = /\{\{([A-Za-z0-9_\-]+(\.[A-Za-z0-9]+)?)\}\}/g;

/**
 * Attempts to read a template from the project or global .prompt-composer, including
 * trying .txt/.md if no extension is present.
 */
async function tryReadTemplateFile(baseName: string): Promise<string | null> {
  if (!window.electronAPI) {
    console.warn('[templateResolver] electronAPI not available. Skipping read attempts.');
    return null;
  }

  // Direct attempt in project
  let content = await window.electronAPI.readPromptComposerFile(baseName);
  if (content) {
    return content;
  }

  // Direct attempt in global
  content = await window.electronAPI.readGlobalPromptComposerFile(baseName);
  if (content) {
    return content;
  }

  // If the baseName has an extension, we're done
  if (baseName.includes('.')) {
    return null;
  }

  // If no extension, try .txt and .md in project, then global
  const possibleExts = ['.txt', '.md'];
  for (const ext of possibleExts) {
    const fullName = baseName + ext;

    // project
    let c = await window.electronAPI.readPromptComposerFile(fullName);
    if (c) {
      return c;
    }
    // global
    c = await window.electronAPI.readGlobalPromptComposerFile(fullName);
    if (c) {
      return c;
    }
  }

  return null;
}

/**
 * Recursively resolves placeholders in the given content by loading
 * corresponding files from either project or global .prompt-composer.
 *
 * @param content - The text in which to search for {{Placeholder}} patterns
 * @param visited - Set of placeholder names already visited
 * @returns fully resolved text
 */
export async function resolveNestedTemplates(
  content: string,
  visited: Set<string> = new Set()
): Promise<string> {
  if (!content) return content;

  let match: RegExpExecArray | null;
  let resolvedContent = content;

  // We'll keep looping until no more placeholders or we can break after
  // we've replaced the first occurrence in each iteration. But typically
  // we do a "global" search. We'll do a single pass, replace each found,
  // then run again if we find new placeholders from expansions.

  while ((match = PLACEHOLDER_REGEX.exec(resolvedContent)) !== null) {
    const placeholderFull = match[0];     // e.g. "{{HELLO}}"
    const placeholderName = match[1];     // e.g. "HELLO" or "HELLO.md"
    if (visited.has(placeholderName)) {
      console.warn(`[templateResolver] Detected loop for placeholder "{{${placeholderName}}}". Skipping.`);
      continue;
    }
    visited.add(placeholderName);

    // Attempt to read from project or global
    let replacementText: string | null = null;
    try {
      const fileContent = await tryReadTemplateFile(placeholderName);
      if (fileContent) {
        // recursively expand placeholders in the loaded text
        replacementText = await resolveNestedTemplates(fileContent, visited);
      }
    } catch (err) {
      console.error(`[templateResolver] Error loading template "${placeholderName}"`, err);
    }

    // If we found text to replace
    if (replacementText) {
      resolvedContent = resolvedContent.replace(placeholderFull, replacementText);
      // We should reset the regex lastIndex to re-check new content if needed
      PLACEHOLDER_REGEX.lastIndex = 0;
    } else {
      // No file found. Leave the placeholder as-is.
      console.warn(`[templateResolver] No file found for "{{${placeholderName}}}". Leaving as placeholder.`);
    }
  }

  return resolvedContent;
}
