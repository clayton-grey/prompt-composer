/**
 * @file readTemplateFile.ts
 * @description
 * Provides utilities for reading template files from various locations.
 * This includes support for both global templates (shared across projects)
 * and local templates (specific to the current project).
 *
 * Enhanced for production mode:
 * - Improved error handling
 * - Better path resolution using IPC for renderer process
 * - Added special handling for sandboxed environments
 * - More logging for debugging
 */

// Remove direct electron import - this causes __dirname errors in production
// import { ipcRenderer } from 'electron';

// Cache of template files that we've already verified don't exist
// to avoid repeated filesystem checks for missing files
const missingTemplateCache = new Set<string>();

/**
 * Attempts to read a template file from the specified locations, trying
 * local project templates first, then global templates.
 *
 * @param templateName - The name of the template to read
 * @returns The contents of the template file, or null if not found
 */
export async function tryReadTemplateFile(templateName: string): Promise<string | null> {
  // Don't attempt to look up templates we already know don't exist
  const cacheKey = templateName.toLowerCase();
  if (missingTemplateCache.has(cacheKey)) {
    console.log(`[readTemplateFile] Skipping known missing template: ${templateName}`);
    return null;
  }

  try {
    // First try using our special IPC handler that's safer in production mode
    if (window.electronAPI?.readTemplateFile) {
      console.log(`[readTemplateFile] Using IPC to read template: ${templateName}`);

      const content = await window.electronAPI.readTemplateFile(templateName);
      if (content) {
        return content;
      }

      // Not found through IPC
      console.log(`[readTemplateFile] Template not found via IPC: ${templateName}`);
      missingTemplateCache.add(cacheKey);
      return null;
    }

    // Fall back to the manual approach if IPC handler is not available
    console.log(`[readTemplateFile] Using manual path approach for template: ${templateName}`);

    // Try with original name
    let content = await readTemplateWithName(templateName);
    if (content) {
      return content;
    }

    // If no extension, try with .txt and .md extensions
    if (!templateName.includes('.')) {
      content = await readTemplateWithName(templateName + '.txt');
      if (content) {
        return content;
      }

      content = await readTemplateWithName(templateName + '.md');
      if (content) {
        return content;
      }
    }

    // Not found in any location
    console.log(`[readTemplateFile] Template not found: ${templateName}`);
    missingTemplateCache.add(cacheKey);
    return null;
  } catch (error) {
    console.error(`[readTemplateFile] Error reading template ${templateName}:`, error);
    // Cache the miss so we don't keep trying
    missingTemplateCache.add(cacheKey);
    return null;
  }
}

/**
 * Read a template with a specific name from all possible locations
 */
async function readTemplateWithName(templateName: string): Promise<string | null> {
  try {
    // First try project-specific template
    const projectContent = await readPromptComposerFile(templateName, 'template');
    if (projectContent) {
      console.log(`[readTemplateFile] Found project template: ${templateName}`);
      return projectContent;
    }

    // Then try global template
    const globalContent = await readGlobalPromptComposerFile(templateName, 'template');
    if (globalContent) {
      console.log(`[readTemplateFile] Found global template: ${templateName}`);
      return globalContent;
    }

    return null;
  } catch (error) {
    console.error(`[readTemplateFile] Error in readTemplateWithName for ${templateName}:`, error);
    return null;
  }
}

/**
 * Reads a file from the global .prompt-composer directory
 *
 * @param fileName - The name of the file to read
 * @param subDirectory - Optional subdirectory within .prompt-composer
 * @returns The contents of the file, or null if not found or error
 */
export async function readGlobalPromptComposerFile(
  fileName: string,
  subDirectory?: string
): Promise<string | null> {
  try {
    // Use window.electronAPI instead of direct ipcRenderer
    if (!window.electronAPI) {
      console.error('[readTemplateFile] No electronAPI available');
      return null;
    }
    return await window.electronAPI.readGlobalPromptComposerFile(fileName, subDirectory);
  } catch (error) {
    console.error(`[readTemplateFile] Error reading global file ${fileName}:`, error);
    return null;
  }
}

/**
 * Reads a file from the project's .prompt-composer directory
 *
 * @param fileName - The name of the file to read
 * @param subDirectory - Optional subdirectory within .prompt-composer
 * @returns The contents of the file, or null if not found or error
 */
export async function readPromptComposerFile(
  fileName: string,
  subDirectory?: string
): Promise<string | null> {
  try {
    // Use window.electronAPI instead of direct ipcRenderer
    if (!window.electronAPI) {
      console.error('[readTemplateFile] No electronAPI available');
      return null;
    }
    return await window.electronAPI.readPromptComposerFile(fileName, subDirectory);
  } catch (error) {
    console.error(`[readTemplateFile] Error reading project file ${fileName}:`, error);
    return null;
  }
}

/**
 * Gets the full list of possible template paths for debugging purposes
 */
export async function getDebugTemplatePaths(templateName: string): Promise<string[]> {
  try {
    // Use window.electronAPI instead of direct ipcRenderer
    if (!window.electronAPI?.getTemplatePaths) {
      console.error('[readTemplateFile] No getTemplatePaths API available');
      return [];
    }
    return await window.electronAPI.getTemplatePaths(templateName);
  } catch (error) {
    console.error(`[readTemplateFile] Error getting template paths for ${templateName}:`, error);
    return [];
  }
}
