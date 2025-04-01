/**
 * @file flattenTemplate.ts
 * @description
 * Provides a function `flattenTemplate` that takes an initial template text with possible
 * nested references (e.g. {{SOMETHING}}) and recursively inlines those references,
 * producing a single-level template with all references resolved.
 *
 * Updated with:
 *  - Better handling of missing templates with clear logs
 *  - Added fallbacks for template resolution
 *  - Better cycle detection
 *  - Improved regex pattern for more reliable placeholder detection
 *  - Enhanced error handling for permission issues
 *  - Added support for PROMPT_RESPONSE with parameters
 */

import { tryReadTemplateFile, getDebugTemplatePaths } from './readTemplateFile';

// Updated regex to better match placeholders (allowing more flexible naming)
// Matches patterns like {{TEMPLATE_NAME}}, {{ TEMPLATE_NAME }}, {{TEMPLATE_NAME.txt}}, etc.
const placeholderRegex = /\{\{\s*([A-Za-z0-9_\-\.=]+(?:\s*=\s*[A-Za-z0-9_\-\.]+)?)\s*\}\}/g;

// Keep track of which templates were missing globally during a session
// to avoid repeated filesystem checks for missing templates
const globalMissingTemplateCache = new Set<string>();

// Cache of templates we've successfully loaded to avoid reloading
const templateCache: Record<string, string> = {};

/**
 * Flatten the template by replacing references to other templates.
 * Known special placeholders are left as-is.
 */
export async function flattenTemplate(
  sourceText: string,
  visited: Set<string> = new Set(),
  maxDepth: number = 10
): Promise<string> {
  if (!sourceText) return sourceText;
  if (maxDepth <= 0) {
    console.warn('[flattenTemplate] Maximum recursion depth reached. Stopping expansion.');
    return sourceText;
  }

  let text = sourceText;
  const unknownPlaceholdersLogged = new Set<string>();
  let match: RegExpExecArray | null;
  let iterationCount = 0;

  // For debugging purposes (only in dev mode)
  console.log(`[flattenTemplate] Starting template flattening, depth: ${10 - maxDepth}`);

  // Find all placeholders in current text before starting expansion
  const allPlaceholders: string[] = [];
  let matchFind: RegExpExecArray | null;
  const tempRegex = new RegExp(placeholderRegex);
  while ((matchFind = tempRegex.exec(text)) !== null) {
    allPlaceholders.push(matchFind[1].trim());
  }

  if (allPlaceholders.length > 0) {
    console.log(
      `[flattenTemplate] Found ${allPlaceholders.length} placeholders to process: ${allPlaceholders.join(', ')}`
    );
  } else {
    console.log(`[flattenTemplate] No placeholders found in template`);
    return text; // Early return if no placeholders
  }

  // Reset regex for main processing
  placeholderRegex.lastIndex = 0;

  while ((match = placeholderRegex.exec(text)) !== null) {
    iterationCount++;
    if (iterationCount > 1000) {
      console.warn('[flattenTemplate] Exceeded 1000 expansions - possible recursion loop?');
      break;
    }

    const fullPlaceholder = match[0]; // e.g. "{{SOMETHING}}"
    const innerName = match[1].trim(); // e.g. "SOMETHING" or "PROMPT_RESPONSE=TEMPLATE_NAME"

    // Handle PROMPT_RESPONSE special case
    if (innerName.startsWith('PROMPT_RESPONSE=')) {
      const templateName = innerName.split('=')[1]?.trim();
      if (templateName) {
        console.log(`[flattenTemplate] Processing PROMPT_RESPONSE reference to: ${templateName}`);

        // Try to load the referenced template
        let templateContent: string | null = null;

        // Check if we have this template in cache already
        if (templateCache[templateName]) {
          console.log(
            `[flattenTemplate] Using cached template for PROMPT_RESPONSE: ${templateName}`
          );
          templateContent = templateCache[templateName];
        } else {
          try {
            console.log(
              `[flattenTemplate] Trying to read template for PROMPT_RESPONSE: ${templateName}`
            );
            templateContent = await tryReadTemplateFile(templateName);

            if (templateContent) {
              console.log(`[flattenTemplate] Successfully read template: ${templateName}`);
              // Cache the template for future use
              templateCache[templateName] = templateContent;
            }
          } catch (err) {
            console.error(
              `[flattenTemplate] Error reading template file for PROMPT_RESPONSE "${templateName}":`,
              err
            );
          }

          // If template couldn't be read, try with alternative extensions
          if (!templateContent && !templateName.includes('.')) {
            const altNames = [`${templateName}.txt`, `${templateName}.md`];
            for (const altName of altNames) {
              try {
                console.log(
                  `[flattenTemplate] Trying alternative name for PROMPT_RESPONSE: ${altName}`
                );
                templateContent = await tryReadTemplateFile(altName);
                if (templateContent) {
                  console.log(`[flattenTemplate] Found template with alternative name: ${altName}`);
                  // Cache both the original name and the alternative name
                  templateCache[templateName] = templateContent;
                  templateCache[altName] = templateContent;
                  break;
                }
              } catch {
                // Ignore errors for alternative names
              }
            }
          }
        }

        if (templateContent) {
          // Found content for the PROMPT_RESPONSE template
          // We should keep the original template name in the placeholder
          // NOT replace it with the content, which is causing the bug
          // where template content shows up as filenames
          const newTag = `{{PROMPT_RESPONSE=${templateName}}}`;
          text = text.replace(fullPlaceholder, newTag);
          console.log(
            `[flattenTemplate] Replaced PROMPT_RESPONSE template reference with its name tag (not content)`
          );

          // Reset the regex to start from the beginning again to catch any missed placeholders
          placeholderRegex.lastIndex = 0;
        } else {
          // Template not found, log warning but keep original placeholder
          console.warn(
            `[flattenTemplate] Could not read template for PROMPT_RESPONSE "${templateName}", leaving as-is`
          );

          // Show possible paths for debugging
          try {
            const possiblePaths = await getDebugTemplatePaths(templateName);
            if (possiblePaths && possiblePaths.length > 0) {
              console.log(`[flattenTemplate] Checked these paths for "${templateName}":`);
              possiblePaths.forEach(p => console.log(`  - ${p}`));
            }
          } catch (err) {
            console.log('[flattenTemplate] Could not retrieve debug paths for template');
          }
        }

        continue;
      }
    }

    // Skip special tags that shouldn't be expanded
    if (isSpecialTag(innerName)) {
      console.log(`[flattenTemplate] Skipping special tag: {{${innerName}}}`);
      continue;
    }

    // Skip if we've seen this template before in the current expansion path
    if (visited.has(innerName)) {
      console.warn(
        `[flattenTemplate] Detected cycle or repeated reference for "{{${innerName}}}", leaving as-is`
      );
      continue;
    }

    // Skip if we know globally that this template is missing
    if (globalMissingTemplateCache.has(innerName)) {
      if (!unknownPlaceholdersLogged.has(innerName)) {
        unknownPlaceholdersLogged.add(innerName);
        console.warn(`[flattenTemplate] Previously failed template: "{{${innerName}}}", skipping`);
      }
      continue;
    }

    // Check if we have this template in cache already
    if (templateCache[innerName]) {
      console.log(`[flattenTemplate] Using cached template for: {{${innerName}}}`);
      const flattenedChild = await flattenTemplate(
        templateCache[innerName],
        new Set(visited),
        maxDepth - 1
      );
      text = text.replace(fullPlaceholder, flattenedChild);
      placeholderRegex.lastIndex = 0;
      continue;
    }

    // Track this template in the current expansion path
    visited.add(innerName);

    let replacement: string | null = null;
    try {
      // Attempt to read the template file with detailed error logging
      console.log(`[flattenTemplate] Trying to read template: {{${innerName}}}`);
      replacement = await tryReadTemplateFile(innerName);

      if (replacement) {
        console.log(`[flattenTemplate] Successfully read template: {{${innerName}}}`);
        // Cache the template for future use
        templateCache[innerName] = replacement;
      }
    } catch (err) {
      if (!unknownPlaceholdersLogged.has(innerName)) {
        unknownPlaceholdersLogged.add(innerName);
        console.error(`[flattenTemplate] Error reading template file for "{{${innerName}}}":`, err);
      }
    }

    if (!replacement) {
      // If template couldn't be read, try with alternative extensions if no extension
      if (!innerName.includes('.')) {
        const altNames = [`${innerName}.txt`, `${innerName}.md`];
        for (const altName of altNames) {
          try {
            console.log(`[flattenTemplate] Trying alternative name: {{${altName}}}`);
            replacement = await tryReadTemplateFile(altName);
            if (replacement) {
              console.log(`[flattenTemplate] Found template with alternative name: {{${altName}}}`);
              // Cache both the original name and the alternative name
              templateCache[innerName] = replacement;
              templateCache[altName] = replacement;
              break;
            }
          } catch {
            // Ignore errors for alternative names
          }
        }
      }
    }

    if (!replacement) {
      // Template not found, log details and leave the placeholder as-is
      if (!unknownPlaceholdersLogged.has(innerName)) {
        unknownPlaceholdersLogged.add(innerName);
        console.warn(
          `[flattenTemplate] Could not read template for "{{${innerName}}}", leaving as-is`
        );
        globalMissingTemplateCache.add(innerName); // Remember this failure

        // Show possible paths for debugging
        try {
          const possiblePaths = await getDebugTemplatePaths(innerName);
          if (possiblePaths && possiblePaths.length > 0) {
            console.log(`[flattenTemplate] Checked these paths for "${innerName}":`);
            possiblePaths.forEach(p => console.log(`  - ${p}`));
          }
        } catch (err) {
          console.log('[flattenTemplate] Could not retrieve debug paths for template');
        }

        // Suggest where to create the template file
        console.log(
          `[flattenTemplate] To fix this, create a template file named "${innerName}" or "${innerName}.txt" in either:`
        );
        console.log(`  - .prompt-composer/template/ in your project directory`);
        console.log(`  - ~/.prompt-composer/template/ in your home directory`);
      }
      continue;
    }

    // Successfully found a template, recursively flatten any nested references in it
    console.log(`[flattenTemplate] Recursively processing nested templates in {{${innerName}}}`);
    const flattenedChild = await flattenTemplate(replacement, new Set(visited), maxDepth - 1);

    // Replace the placeholder with the flattened content
    text = text.replace(fullPlaceholder, flattenedChild);
    console.log(
      `[flattenTemplate] Replaced {{${innerName}}} with its content (${flattenedChild.length} chars)`
    );

    // Reset the regex to start from the beginning again
    placeholderRegex.lastIndex = 0;
  }

  return text;
}

/**
 * Check if a placeholder name represents a special tag that shouldn't be expanded
 */
function isSpecialTag(placeholderName: string): boolean {
  // List of placeholders that shouldn't be expanded
  const specialTags = ['FILE_BLOCK', 'TEXT_BLOCK'];

  // Check if it's a special tag that should be left as-is
  // (but not PROMPT_RESPONSE, which needs special handling)
  for (const tag of specialTags) {
    if (placeholderName === tag || placeholderName.startsWith(tag + '=')) {
      return true;
    }
  }

  return false;
}
