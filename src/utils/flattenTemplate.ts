/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-useless-escape */

/**
 * @file flattenTemplate.ts
 * @description
 * Provides a function `flattenTemplate` that takes an initial template text with possible
 * nested references (e.g. {{SOMETHING}}) and recursively inlines those references,
 * producing a single-level template with all references resolved.
 *
 * Features:
 *  - Template caching for performance
 *  - Cycle detection to prevent infinite recursion
 *  - Special tag handling for control structures
 *  - Graceful error handling for missing templates
 *  - Support for template fallbacks with alternative extensions
 */

import { tryReadTemplateFile, getDebugTemplatePaths } from './readTemplateFile';

// Matches template placeholders with flexible whitespace and parameter support
// Examples: {{TEMPLATE_NAME}}, {{ TEMPLATE_NAME }}, {{TEMPLATE_NAME=PARAM}}
const placeholderRegex =
  /\{\{[ \t]*([A-Za-z0-9_\-\.=]+(?:[ \t]*=[ \t]*[A-Za-z0-9_\-\.]+)?)[ \t]*\}\}/g;

// Cache to avoid repeated filesystem checks for missing templates
const globalMissingTemplateCache = new Set<string>();

// Cache of successfully loaded templates
const templateCache: Record<string, string> = {};

// Special tags that should not be expanded as templates
const SPECIAL_TAGS = ['FILE_BLOCK', 'TEXT_BLOCK'];

// Maximum number of expansions to prevent infinite loops
const MAX_ITERATIONS = 1000;

/**
 * Clear all template caches, including the missing templates cache.
 * Should be called when project directories change.
 */
export function clearAllTemplateCaches(): void {
  console.log('[flattenTemplate] Clearing all template caches');
  globalMissingTemplateCache.clear();

  // Clear the successful template cache
  for (const key in templateCache) {
    delete templateCache[key];
  }
}

/**
 * Controlled logging that only outputs in development or for critical issues
 */
function debugLog(message: string, ...args: any[]): void {
  const isImportant = message.includes('[ERROR]') || message.includes('[CRITICAL]');
  if (process.env.NODE_ENV === 'development' || isImportant) {
    console.log(`[flattenTemplate] ${message}`, ...args);
  }
}

/**
 * Checks if a placeholder represents a special tag that shouldn't be expanded
 */
function isSpecialTag(placeholderName: string): boolean {
  // PROMPT_RESPONSE needs special handling but is not a skippable tag
  if (placeholderName.startsWith('PROMPT_RESPONSE')) {
    return false;
  }

  // Check against list of special tags
  for (const tag of SPECIAL_TAGS) {
    if (placeholderName === tag || placeholderName.startsWith(`${tag}=`)) {
      return true;
    }
  }

  return false;
}

/**
 * Attempts to load a template with alternative extensions (.txt, .md)
 * when the specified name doesn't have an extension
 */
async function tryLoadWithAlternativeExtensions(templateName: string): Promise<string | null> {
  if (templateName.includes('.')) {
    return null; // Skip if already has an extension
  }

  const extensions = ['.txt', '.md'];

  // Try each extension
  for (const ext of extensions) {
    const altName = `${templateName}${ext}`;

    try {
      const content = await tryReadTemplateFile(altName);
      if (content) {
        debugLog(`Found template with extension: ${altName}`);
        // Cache both original name and alternative name
        templateCache[templateName] = content;
        templateCache[altName] = content;
        return content;
      }
    } catch {
      // Continue to next alternative
    }
  }

  return null;
}

/**
 * Replaces a placeholder match with new content and updates regex position
 * to ensure continuous processing without skipping or reprocessing
 */
function replaceTextAndUpdateRegex(
  text: string,
  match: RegExpExecArray,
  newContent: string
): { text: string; newPosition: number } {
  const beforeMatch = text.substring(0, match.index);
  const afterMatch = text.substring(match.index + match[0].length);
  const newText = beforeMatch + newContent + afterMatch;

  // Calculate position after replacement for regex to continue from
  const newPosition = match.index + newContent.length;

  return { text: newText, newPosition };
}

/**
 * Handles PROMPT_RESPONSE placeholder processing
 * These are special as we verify the template exists but preserve the tag
 */
async function processPromptResponse(
  text: string,
  match: RegExpExecArray,
  innerName: string
): Promise<{ text: string; newPosition: number; processed: boolean }> {
  // Extract template name from format PROMPT_RESPONSE=TEMPLATE_NAME
  const templateName = innerName.split('=')[1]?.trim();
  if (!templateName) {
    return { text, newPosition: match.index + match[0].length, processed: false };
  }

  debugLog(`Processing PROMPT_RESPONSE reference to: ${templateName}`);

  // Try to load template to verify it exists
  let templateContent: string | null = null;

  // Check cache first
  if (templateCache[templateName]) {
    templateContent = templateCache[templateName];
  } else {
    try {
      templateContent = await tryReadTemplateFile(templateName);
      if (templateContent) {
        templateCache[templateName] = templateContent;
      }
    } catch (err) {
      debugLog(`[ERROR] Error reading template for PROMPT_RESPONSE "${templateName}"`);
    }

    // Try alternative extensions if no extension specified
    if (!templateContent) {
      templateContent = await tryLoadWithAlternativeExtensions(templateName);
    }
  }

  if (templateContent) {
    // For PROMPT_RESPONSE, keep the tag structure (don't inline content)
    const newTag = `{{PROMPT_RESPONSE=${templateName}}}`;
    const result = replaceTextAndUpdateRegex(text, match, newTag);
    return { ...result, processed: true };
  } else {
    debugLog(`[WARNING] Template for PROMPT_RESPONSE "${templateName}" not found`);
    return { text, newPosition: match.index + match[0].length, processed: false };
  }
}

/**
 * Main function to flatten a template by replacing all references with their content
 * Handles recursion, cycling, and special tags
 */
export async function flattenTemplate(
  sourceText: string,
  visited: Set<string> = new Set(),
  maxDepth: number = 10
): Promise<string> {
  // Handle edge cases
  if (!sourceText) return sourceText;
  if (maxDepth <= 0) {
    debugLog('[ERROR] Maximum recursion depth reached');
    return sourceText;
  }

  let text = sourceText;
  const unknownPlaceholdersLogged = new Set<string>();
  let match: RegExpExecArray | null;
  let iterationCount = 0;

  // Quick check if we have any placeholders to process
  const tempRegex = new RegExp(placeholderRegex);
  const allPlaceholders: string[] = [];
  let tempMatch: RegExpExecArray | null;

  while ((tempMatch = tempRegex.exec(text)) !== null) {
    allPlaceholders.push(tempMatch[1].trim());
  }

  if (allPlaceholders.length === 0) {
    return text; // No work needed
  }

  debugLog(
    `Starting template flattening with ${allPlaceholders.length} placeholders, depth: ${10 - maxDepth}`
  );

  // Reset regex for main processing
  placeholderRegex.lastIndex = 0;

  // Process each placeholder
  while ((match = placeholderRegex.exec(text)) !== null) {
    iterationCount++;
    if (iterationCount > MAX_ITERATIONS) {
      debugLog(`[ERROR] Exceeded ${MAX_ITERATIONS} expansions - possible infinite loop`);
      break;
    }

    const placeholder = match[0]; // e.g. "{{SOMETHING}}"
    const tagName = match[1].trim(); // e.g. "SOMETHING" or "PROMPT_RESPONSE=TEMPLATE_NAME"

    debugLog(`Processing placeholder: ${placeholder}`);

    // Handle PROMPT_RESPONSE special case
    if (tagName.startsWith('PROMPT_RESPONSE=')) {
      const result = await processPromptResponse(text, match, tagName);
      text = result.text;
      placeholderRegex.lastIndex = result.newPosition;
      continue;
    }

    // Skip special tags
    if (isSpecialTag(tagName)) {
      debugLog(`Skipping special tag: {{${tagName}}}`);
      continue;
    }

    // Skip if we've seen this template before (cycle detection)
    if (visited.has(tagName)) {
      debugLog(`[WARNING] Detected cycle for "{{${tagName}}}"`);
      continue;
    }

    // Skip known missing templates
    if (globalMissingTemplateCache.has(tagName)) {
      if (!unknownPlaceholdersLogged.has(tagName)) {
        unknownPlaceholdersLogged.add(tagName);
        debugLog(`[WARNING] Using previously failed template: {{${tagName}}}`);
      }
      continue;
    }

    // Use cached template content if available
    if (templateCache[tagName]) {
      debugLog(`Using cached template: {{${tagName}}}`);
      const flattenedChild = await flattenTemplate(
        templateCache[tagName],
        new Set([...visited, tagName]),
        maxDepth - 1
      );

      const result = replaceTextAndUpdateRegex(text, match, flattenedChild);
      text = result.text;
      placeholderRegex.lastIndex = result.newPosition;
      continue;
    }

    // Create new visited set for tracking this expansion path
    const newVisited = new Set([...visited, tagName]);

    // Try to load the template
    let templateContent: string | null = null;
    try {
      templateContent = await tryReadTemplateFile(tagName);
      if (templateContent) {
        debugLog(`Loaded template: {{${tagName}}}`);
        templateCache[tagName] = templateContent;
      }
    } catch (err) {
      debugLog(`[ERROR] Error reading template {{${tagName}}}`);
    }

    // Try with alternative extensions if needed
    if (!templateContent) {
      templateContent = await tryLoadWithAlternativeExtensions(tagName);
    }

    // Handle missing template
    if (!templateContent) {
      if (!unknownPlaceholdersLogged.has(tagName)) {
        unknownPlaceholdersLogged.add(tagName);
        debugLog(`[CRITICAL] Template {{${tagName}}} not found in any location`);
        globalMissingTemplateCache.add(tagName);
      }
      continue;
    }

    // Recursively process the template content
    const flattenedChild = await flattenTemplate(templateContent, newVisited, maxDepth - 1);

    // Replace placeholder with processed content
    const result = replaceTextAndUpdateRegex(text, match, flattenedChild);
    text = result.text;
    placeholderRegex.lastIndex = result.newPosition;

    debugLog(`Replaced {{${tagName}}} with ${flattenedChild.length} chars of content`);
  }

  return text;
}
