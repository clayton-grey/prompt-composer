
/**
 * @file templateResolver.ts
 * @description
 * Provides a function `expandTemplatePlaceholders` that parses template content
 * for placeholders like {{SOMETHING}}, attempts to read a corresponding file
 * in the `.prompt-composer` folder named `SOMETHING.md` or `SOMETHING.txt`,
 * and recursively expands any placeholders found in that file.
 *
 * Key Exports:
 *  - expandTemplatePlaceholders(content: string): Promise<string>
 *
 * Implementation Details:
 *  1) We parse the input content looking for any occurrences of {{PLACEHOLDER}}.
 *  2) For each placeholder "PLACEHOLDER", we try the following file paths:
 *     - .prompt-composer/PLACEHOLDER.md
 *     - .prompt-composer/PLACEHOLDER.txt
 *     (We can expand with .template or other extensions if needed.)
 *  3) If found, we read the file, then recursively expand placeholders inside
 *     that file content as well.
 *  4) We guard against infinite recursion by tracking visited placeholders.
 *     If a placeholder is already in visited, we skip further expansion and
 *     insert a warning message or partially expanded text.
 *  5) Return the fully expanded text or partial expansions if files not found.
 *
 * Dependencies:
 *  - window.electronAPI.readPromptComposerFile (a new IPC call we define).
 *  - This function is async to allow for filesystem reads from Electron's main process.
 *
 * Edge Cases:
 *  - If a file is not found for a placeholder, we keep the placeholder as-is (e.g. {{XYZ}}).
 *  - If infinite recursion is detected, we inject a note "[Circular reference!]" or similar.
 */

const PLACEHOLDER_PATTERN = /\{\{\s*([A-Za-z0-9_\-]+)\s*\}\}/g;

/**
 * expandTemplatePlaceholders
 * Recursively expands placeholders in the given content by loading them
 * from .prompt-composer folder. 
 *
 * @param content - The template content to expand
 * @param visited - A set of placeholders we've expanded (to detect recursion)
 * @returns A Promise resolving to the expanded content
 */
export async function expandTemplatePlaceholders(
  content: string,
  visited: Set<string> = new Set()
): Promise<string> {
  if (!content) return content;

  let match: RegExpExecArray | null;
  const matches: { placeholder: string; fullMatch: string }[] = [];

  // We store all matches in an array so we can do async expansions in order
  while ((match = PLACEHOLDER_PATTERN.exec(content)) !== null) {
    const placeholder = match[1];        // e.g. "MY_TEMPLATE"
    const fullMatch = match[0];         // e.g. "{{MY_TEMPLATE}}"
    matches.push({ placeholder, fullMatch });
  }

  if (matches.length === 0) {
    // Nothing to replace
    return content;
  }

  // We do expansions in sequence to handle recursion in a controlled manner
  let expandedContent = content;

  for (const { placeholder, fullMatch } of matches) {
    // If already visited, we skip to avoid infinite recursion
    if (visited.has(placeholder)) {
      console.warn(
        `[expandTemplatePlaceholders] Detected circular reference for placeholder: {{${placeholder}}}. Skipping further expansion.`
      );
      expandedContent = expandedContent.replace(
        fullMatch,
        `[CircularReference: ${placeholder}]`
      );
      continue;
    }

    // Attempt to read the placeholder file from .prompt-composer (md or txt)
    let fileContent = '';
    let found = false;

    const possibleExtensions = ['.md', '.txt'];
    for (const ext of possibleExtensions) {
      try {
        // readPromptComposerFile is a new electronAPI method we define in ipcHandlers
        const readResult = await window.electronAPI.readPromptComposerFile(
          placeholder + ext
        );
        if (readResult !== null && typeof readResult === 'string') {
          fileContent = readResult;
          found = true;
          break;
        }
      } catch (err) {
        // if read fails, we continue to the next extension
      }
    }

    if (!found) {
      // We leave the placeholder as is. Could also remove it or log a warning.
      console.warn(
        `[expandTemplatePlaceholders] No template file found for placeholder: {{${placeholder}}} in .prompt-composer/ (tried .md, .txt). Leaving as-is.`
      );
      continue;
    }

    // If found, we recursively expand placeholders in that file content
    visited.add(placeholder); // Mark the placeholder visited to avoid loops
    const recursivelyExpanded = await expandTemplatePlaceholders(
      fileContent,
      visited
    );
    visited.delete(placeholder); // Remove after expansion so other placeholders can use it

    // Replace the placeholder in the expandedContent with the resolved text
    // Use a global replace for this single placeholder match. But to avoid 
    // interfering with other placeholders of the same name, we do a single replace 
    // for the exact match. If user wants multiple occurrences, they'll appear 
    // multiple times in matches anyway.
    expandedContent = expandedContent.replace(fullMatch, recursivelyExpanded);
  }

  return expandedContent;
}
