/**
 * @file templateResolver.ts
 * @description
 * Provides functions to recursively resolve placeholders of the form {{PLACEHOLDER}}
 * by loading template files from the .prompt-composer directory. 
 *
 * Core Function: resolveNestedTemplates(content, visited)
 * - Scans for placeholders using a regex
 * - For each {{SOMENAME}}, tries to load .prompt-composer/SOMENAME
 * - If found, recursively resolves placeholders in that file's content
 * - Prevents infinite loops by tracking visited placeholders in a Set
 *
 * Known Limitations:
 * - We do not handle placeholders with spaces or punctuation (only alphanumeric + underscores).
 * - If a placeholder file doesn't exist, we skip or leave the placeholder as-is.
 * - We do not do block-level variable substitution here (that's done prior).
 */

const PLACEHOLDER_REGEX = /\{\{([A-Za-z0-9_\-]+)\}\}/g;

/**
 * Recursively resolves placeholders in the given content by loading 
 * corresponding files from the .prompt-composer folder. 
 * 
 * @param content - The text in which to search for {{Placeholder}} patterns
 * @param visited - A set of placeholder names we have already visited, to avoid infinite loops
 * @returns The fully resolved text (some placeholders may remain if no corresponding file found)
 */
export async function resolveNestedTemplates(
  content: string,
  visited: Set<string> = new Set()
): Promise<string> {
  if (!content) return content;

  let match: RegExpExecArray | null;
  let resolvedContent = content;

  // Because we might add more placeholders as we replace content, 
  // we do a loop until no more new placeholders found or we stop changing. 
  // But for performance, we do a single pass here, then recursively expand the result of each placeholder.
  // If we find multiple placeholders, we handle them in a straightforward manner, 
  // but each replaced portion can also have placeholders that we handle in a subsequent pass.

  while ((match = PLACEHOLDER_REGEX.exec(resolvedContent)) !== null) {
    const placeholderName = match[1]; // e.g. 'MY_TEMPLATE'
    console.log(`[templateResolver] Found placeholder: {{${placeholderName}}}`);

    // Check for potential infinite recursion
    if (visited.has(placeholderName)) {
      console.warn(`[templateResolver] Detected loop for placeholder "{{${placeholderName}}}". Skipping to prevent infinite recursion.`);
      continue; // We skip replacing it
    }

    // Mark as visited
    visited.add(placeholderName);
    console.log(`[templateResolver] Looking up file for placeholder: ${placeholderName}`);

    let replacementText = '';
    try {
      if (window.electronAPI && window.electronAPI.readPromptComposerFile) {
        console.log(`[templateResolver] Calling electronAPI.readPromptComposerFile for: ${placeholderName}`);
        // Attempt to load the file from .prompt-composer
        const fileContent = await window.electronAPI.readPromptComposerFile(placeholderName);
        console.log(`[templateResolver] Result for ${placeholderName}: ${fileContent ? 'File found' : 'File not found'}`);
        
        if (fileContent) {
          console.log(`[templateResolver] File content for ${placeholderName} (${fileContent.length} bytes): "${fileContent.substring(0, 50)}${fileContent.length > 50 ? '...' : ''}"`);
          // Recursively resolve placeholders in the loaded content
          replacementText = await resolveNestedTemplates(fileContent, visited);
        } else {
          console.warn(`[templateResolver] No file found for placeholder "{{${placeholderName}}}". Leaving placeholder as-is.`);
          // Adding extension check - try common extensions if name was provided without extension
          if (!placeholderName.includes('.')) {
            console.log(`[templateResolver] Trying with extensions for ${placeholderName}`);
            const extensions = ['.txt', '.md'];
            for (const ext of extensions) {
              const nameWithExt = `${placeholderName}${ext}`;
              console.log(`[templateResolver] Trying with extension: ${nameWithExt}`);
              const contentWithExt = await window.electronAPI.readPromptComposerFile(nameWithExt);
              if (contentWithExt) {
                console.log(`[templateResolver] Found file with extension: ${nameWithExt}`);
                replacementText = await resolveNestedTemplates(contentWithExt, visited);
                break;
              }
            }
            
            // If we still didn't find anything with extensions
            if (replacementText === '') {
              replacementText = `{{${placeholderName}}}`;
            }
          } else {
            replacementText = `{{${placeholderName}}}`;
          }
        }
      } else {
        console.warn(`[templateResolver] window.electronAPI.readPromptComposerFile not available. Skipping placeholder "{{${placeholderName}}}".`);
        replacementText = `{{${placeholderName}}}`;
      }
    } catch (err) {
      console.error(`[templateResolver] Error reading .prompt-composer/${placeholderName}:`, err);
      replacementText = `{{${placeholderName}}}`;
    }

    // Replace the first occurrence of this placeholder with the resolved text
    // We only do one replacement at a time for each iteration
    console.log(`[templateResolver] Replacing "{{${placeholderName}}}" with text (${replacementText.length} bytes)`);
    resolvedContent = resolvedContent.replace(`{{${placeholderName}}}`, replacementText);
  }

  return resolvedContent;
}
