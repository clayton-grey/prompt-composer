
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
 * Usage:
 *  - Called by flattenBlocksAsync in flattenPrompt.ts or other code that needs
 *    to expand placeholders in text content.
 *
 * Implementation logic:
 *  - For each {{NAME}}, we do:
 *    1) try readPromptComposerFile(NAME) from project
 *    2) if not found, try readGlobalPromptComposerFile(NAME) from global
 *    3) if no extension in NAME, also try appending .txt / .md for both project
 *       and global directories
 *    4) if still not found, leave placeholder as-is
 *
 *  - We maintain a visited set to avoid infinite loops when expansions themselves
 *    contain the same template references. If we encounter an already visited
 *    placeholder, we skip it and leave it as a placeholder.
 *
 *  - The visited set is passed recursively so deeper expansions can also detect
 *    placeholders that have already been seen in the chain.
 *
 * Limitations:
 *  - Filenames with unusual characters (spaces, special symbols) might not match the
 *    placeholder regex. The current pattern is fairly strict ([A-Za-z0-9_\-]+).
 *  - If the user references a template with no extension, we only try .txt and .md.
 *
 * Edge cases:
 *  - Self-referential or circular references (e.g., HELLO references HELLO) are
 *    prevented by the visited set. We do not re-expand placeholders that are already visited.
 *  - Missing templates leave the placeholder unchanged in the final text.
 */

const PLACEHOLDER_REGEX = /\{\{([A-Za-z0-9_\-]+(\.[A-Za-z0-9]+)?)\}\}/g;

/**
 * Attempts to read a template from the project or global .prompt-composer, including
 * trying .txt/.md if no extension is present.
 *
 * @param baseName - The placeholder name extracted from {{...}}
 * @returns The file's content if found, otherwise null
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

    // Try project
    let c = await window.electronAPI.readPromptComposerFile(fullName);
    if (c) {
      return c;
    }
    // Try global
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
 * @param visited - A set of placeholder names already visited, to avoid infinite loops
 * @returns The fully expanded text, with found placeholders replaced by their file contents
 */
export async function resolveNestedTemplates(
  content: string,
  visited: Set<string> = new Set()
): Promise<string> {
  if (!content) return content;

  let match: RegExpExecArray | null;
  let resolvedContent = content;

  // We keep looping until no more placeholders are found in the current pass.
  // If expansions insert new placeholders, we handle them in subsequent iterations
  // by resetting the regex lastIndex after each replacement.
  while ((match = PLACEHOLDER_REGEX.exec(resolvedContent)) !== null) {
    const placeholderFull = match[0];     // e.g. "{{HELLO}}"
    const placeholderName = match[1];     // e.g. "HELLO" or "HELLO.md"

    // If we've seen this placeholderName before, we skip it to avoid infinite loops
    if (visited.has(placeholderName)) {
      console.warn(`[templateResolver] Detected loop for placeholder "{{${placeholderName}}}". Skipping expansion.`);
      continue;
    }

    // Mark this placeholder as visited
    visited.add(placeholderName);

    // Attempt to read from project or global .prompt-composer
    let replacementText: string | null = null;
    try {
      const fileContent = await tryReadTemplateFile(placeholderName);
      if (fileContent) {
        // Recursively expand placeholders in the loaded text
        replacementText = await resolveNestedTemplates(fileContent, visited);
      }
    } catch (err) {
      console.error(`[templateResolver] Error loading template "${placeholderName}"`, err);
    }

    // If we found text to replace
    if (replacementText) {
      // Replace all occurrences of this exact placeholder
      resolvedContent = resolvedContent.replace(placeholderFull, replacementText);
      // Reset the regex so we can re-check from the start, in case new placeholders emerged
      PLACEHOLDER_REGEX.lastIndex = 0;
    } else {
      // No file found. Leave the placeholder as-is.
      console.warn(`[templateResolver] No file found for "{{${placeholderName}}}". Leaving placeholder unchanged.`);
    }
  }

  return resolvedContent;
}
