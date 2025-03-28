/**
 * @file flattenTemplate.ts
 * @description
 * Provides a function `flattenTemplate` that takes an initial template text with possible
 * nested references (e.g. {{SOME_TEMPLATE}}) and recursively inlines those references,
 * producing a single-level template with all references resolved.
 *
 * Special tags like:
 *    {{TEXT_BLOCK=some text}}
 *    {{FILE_BLOCK}}
 *    {{PROMPT_RESPONSE=fileName.txt}}
 * are left in place untouched, because we don't want to expand them here. They are
 * "special placeholders" that remain for future usage by the normal block parser
 * or other UI logic.
 *
 * Implementation:
 *  - We define a placeholderRegex that captures any {{SOMETHING}} pattern.
 *  - For each match, we distinguish:
 *      - If it looks like a known "special" block (TEXT_BLOCK=..., FILE_BLOCK, PROMPT_RESPONSE=...)
 *        or if it has an '=' that doesn't match known patterns, we skip expansion.
 *      - Else, we interpret it as a reference to another template (like {{MY_TEMPLATE}}).
 *        We attempt to read that file from .prompt-composer. If found, we recursively flatten
 *        its content, then replace the placeholder with that flattened result in the parent text.
 *  - We do multiple passes or recursion until no more references remain or we detect a cycle.
 *  - We track visited placeholders to avoid infinite loops in case of cyclical references.
 *
 * Steps:
 *    flattenTemplate("some text with {{NESTED}} etc.")
 *      => checks if NESTED is a special block or a template reference. If template reference,
 *         read the file, flatten that file (recursively), replace in the parent text.
 *      => final single-level text with no further references to external templates.
 *
 * Usage:
 *  1) flattenTemplateAsync(templateString) -> flattened string
 *  2) Then parse the final string for TEXT_BLOCK, FILE_BLOCK, PROMPT_RESPONSE, or custom placeholders.
 */

import { tryReadTemplateFile } from './readTemplateFile';

/**
 * Regex capturing any placeholder of the form {{SOMETHING}}:
 * - Group(1) => full match including braces
 * - Group(2) => content inside the braces e.g. "SOMETHING"
 */
const placeholderRegex = /(\{\{([^}]*)\}\})/g;

/**
 * Flatten the template by replacing references to other templates.
 * Known special placeholders are left as-is.
 *
 * @param sourceText The text to flatten
 * @param visited A set of references we've already expanded, used to detect cycles
 * @returns The flattened text with no nested references (except for known special placeholders).
 */
export async function flattenTemplate(
  sourceText: string,
  visited: Set<string> = new Set()
): Promise<string> {
  if (!sourceText) return sourceText;

  // We'll attempt multiple passes or recursion until no changes are made.
  // But we actually do it in a single pass if possible, recursing for each reference as found.
  let text = sourceText;

  // We use a while loop or recursion approach. Let's do recursion approach for clarity:
  // We'll parse, building an updated string by scanning placeholders.
  // If we find a template reference, we read & flatten that file, then replace.
  // We'll re-scan from the start to handle newly introduced references.

  let match: RegExpExecArray | null;
  // A safeguard to avoid infinite loops if references keep reintroducing placeholders
  let iterationCount = 0;

  // We'll do an iterative approach so we can handle newly inserted placeholders:
  while ((match = placeholderRegex.exec(text)) !== null) {
    iterationCount++;
    if (iterationCount > 2000) {
      // Arbitrary large iteration to prevent infinite loops
      console.warn('[flattenTemplate] Exceeded 2000 expansions - possible recursion loop?');
      break;
    }

    const fullPlaceholder = match[1]; // e.g. "{{SOMETHING}}"
    const innerName = match[2].trim(); // e.g. "SOMETHING"

    // Decide if it's a "special" tag or a template reference we should expand
    if (isSpecialTag(innerName)) {
      // It's a known special block or something with an '=' that we do NOT expand.
      // We'll skip replacing it, leaving it in place. Move on.
      continue;
    }

    // If we've visited this placeholder name, skip to avoid cycles
    if (visited.has(innerName)) {
      console.warn(
        `[flattenTemplate] Detected cycle or repeated reference for "{{${innerName}}}", leaving as-is`
      );
      continue;
    }

    visited.add(innerName);

    // Try reading from .prompt-composer. If not found, skip expansion
    let replacement: string | null = null;
    try {
      replacement = await tryReadTemplateFile(innerName);
    } catch (err) {
      console.warn(
        `[flattenTemplate] Error reading template file for "{{${innerName}}}": ${String(err)}`
      );
    }

    if (!replacement) {
      // We do not expand unknown or missing references, just skip
      console.warn(
        `[flattenTemplate] Could not read template for "{{${innerName}}}", leaving as-is`
      );
      continue;
    }

    // Recursively flatten the content we loaded
    const flattenedChild = await flattenTemplate(replacement, visited);

    // Replace the placeholder in the parent text
    text = text.replace(fullPlaceholder, flattenedChild);

    // Because we've changed the text, we must reset the regex scan to re-check from the start
    // for newly introduced placeholders:
    placeholderRegex.lastIndex = 0;
  }

  return text;
}

/**
 * isSpecialTag: determines if the placeholder content indicates a known special block
 * or any placeholder that includes '=', except those we might interpret as template references
 * with nested expansions.
 *
 * For example:
 *  - TEXT_BLOCK=some text
 *  - FILE_BLOCK
 *  - PROMPT_RESPONSE=something
 *  - TEMPLATES with '=' e.g. TPL=some-other might also not be expanded, depending on your usage
 */
function isSpecialTag(placeholderName: string): boolean {
  // If it includes '=', we treat it as a special block or param block. We skip expansions.
  // This covers TEXT_BLOCK=..., PROMPT_RESPONSE=..., "stuff=stuff", etc.
  if (placeholderName.includes('=')) {
    return true;
  }

  // If it's exactly "FILE_BLOCK", we skip expansions
  if (placeholderName === 'FILE_BLOCK') {
    return true;
  }

  return false;
}
