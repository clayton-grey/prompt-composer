/**
 * @file readTemplateFile.ts
 * @description
 * Provides utilities for reading template files from various locations.
 * This includes support for both global templates (shared across projects)
 * and local templates (specific to the current project).
 */

import { clearAllTemplateCaches } from './flattenTemplate';

// Add TypeScript declaration for window.electronAPI
declare global {
  interface Window {
    electronAPI?: {
      readTemplateFile: (templateName: string) => Promise<string | null>;
      readPromptComposerFile: (fileName: string, subDirectory?: string) => Promise<string | null>;
      readGlobalPromptComposerFile: (
        fileName: string,
        subDirectory?: string
      ) => Promise<string | null>;
      getTemplatePaths: (templateName: string) => Promise<string[]>;
    };
  }
}

// Cache of template files that we've verified don't exist
const missingTemplateCache = new Set<string>();

/**
 * Clear the missing template cache, used when project directories are added or removed
 */
export function clearTemplateCaches(): void {
  console.log('[readTemplateFile] Clearing template caches due to project structure change');

  // Clear the local missing template cache
  missingTemplateCache.clear();

  // Clear the missing template cache in flattenTemplate
  clearAllTemplateCaches();

  // Force the main process to clear its template cache
  if (window.electronAPI?.readTemplateFile) {
    window.electronAPI.readTemplateFile('_cache_invalidated_' + Date.now());
  }
}

/**
 * Controlled logging that only outputs in development or for critical issues
 */
function debugLog(message: string, ...args: any[]): void {
  const isImportant = message.includes('[ERROR]') || message.includes('[CRITICAL]');
  if (process.env.NODE_ENV === 'development' || isImportant) {
    console.log(`[readTemplateFile] ${message}`, ...args);
  }
}

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
    debugLog(`Skipping known missing template: ${templateName}`);
    return null;
  }

  debugLog(`Attempting to read template: ${templateName}`);

  try {
    // First try using our IPC handler
    if (window.electronAPI?.readTemplateFile) {
      const content = await window.electronAPI.readTemplateFile(templateName);
      if (content) {
        debugLog(`Successfully read template via IPC: ${templateName}`);
        return content;
      }

      // Not found through IPC
      debugLog(`[WARNING] Template not found: ${templateName}`);

      missingTemplateCache.add(cacheKey);
      return null;
    }

    // Fall back to the manual approach if IPC handler is not available
    debugLog(`Using manual path approach for template: ${templateName}`);

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
    debugLog(`[CRITICAL] Template not found in any location: ${templateName}`);
    missingTemplateCache.add(cacheKey);
    return null;
  } catch (error) {
    debugLog(`[ERROR] Error reading template ${templateName}`);
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
    const projectContent = await readPromptComposerFile(templateName);
    if (projectContent) {
      console.log(`[readTemplateFile] Found project template: ${templateName}`);
      return projectContent;
    }

    // Then try global template
    const globalContent = await readGlobalPromptComposerFile(templateName);
    if (globalContent) {
      console.log(`[readTemplateFile] Found global template: ${templateName}`);
      return globalContent;
    }

    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Reads a file from the global .prompt-composer directory
 */
export async function readGlobalPromptComposerFile(
  fileName: string,
  subDirectory?: string
): Promise<string | null> {
  try {
    if (!window.electronAPI) {
      return null;
    }
    return await window.electronAPI.readGlobalPromptComposerFile(fileName, subDirectory);
  } catch (error) {
    return null;
  }
}

/**
 * Reads a file from the project's .prompt-composer directory
 */
export async function readPromptComposerFile(
  fileName: string,
  subDirectory?: string
): Promise<string | null> {
  try {
    if (!window.electronAPI) {
      return null;
    }
    return await window.electronAPI.readPromptComposerFile(fileName, subDirectory);
  } catch (error) {
    return null;
  }
}

/**
 * Gets the full list of possible template paths for debugging purposes
 */
export async function getDebugTemplatePaths(templateName: string): Promise<string[]> {
  try {
    if (!window.electronAPI?.getTemplatePaths) {
      return [];
    }
    return await window.electronAPI.getTemplatePaths(templateName);
  } catch (error) {
    return [];
  }
}
