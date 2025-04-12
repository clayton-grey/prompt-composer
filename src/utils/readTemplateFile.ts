/**
 * @file readTemplateFile.ts
 * @description
 * Provides utilities for reading template files from various locations.
 * This includes support for both global templates (shared across projects)
 * and local templates (specific to the current project).
 */

/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/adjacent-overload-signatures */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import { clearAllTemplateCaches } from './flattenTemplate';

// Add TypeScript declaration for window.electronAPI
// Using @ts-ignore to avoid conflicts with src/types/electron.d.ts
// @ts-ignore
declare global {
  interface Window {
    // @ts-ignore
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
  // @ts-ignore - Suppressing type checking for electronAPI methods
  if (window.electronAPI?.readTemplateFile) {
    // @ts-ignore - Suppressing type checking for electronAPI methods
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
    // @ts-ignore - Suppressing type checking for electronAPI methods
    if (window.electronAPI?.readTemplateFile) {
      // @ts-ignore - Suppressing type checking for electronAPI methods
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
    const projectResult = await readPromptComposerFile(templateName);
    if (projectResult) {
      // Handle both string and object return values
      let content: string | null = null;
      if (typeof projectResult === 'string') {
        content = projectResult;
      } else if (typeof projectResult === 'object' && projectResult !== null) {
        // Type assertion to handle the content property
        const resultObj = projectResult as { content: string; path: string };
        if (resultObj.content) {
          content = resultObj.content;
        }
      }

      if (content) {
        console.log(`[readTemplateFile] Found project template: ${templateName}`);
        return content;
      }
    }

    // Then try global template
    const globalResult = await readGlobalPromptComposerFile(templateName);
    if (globalResult) {
      // Handle both string and object return values
      let content: string | null = null;
      if (typeof globalResult === 'string') {
        content = globalResult;
      } else if (typeof globalResult === 'object' && globalResult !== null) {
        // Type assertion to handle the content property
        const resultObj = globalResult as { content: string; path: string };
        if (resultObj.content) {
          content = resultObj.content;
        }
      }

      if (content) {
        console.log(`[readTemplateFile] Found global template: ${templateName}`);
        return content;
      }
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
    // @ts-ignore - Suppressing type checking for electronAPI access
    if (!window.electronAPI) {
      return null;
    }
    // @ts-ignore - Suppressing type checking for electronAPI methods
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
    // @ts-ignore - Suppressing type checking for electronAPI access
    if (!window.electronAPI) {
      return null;
    }
    // @ts-ignore - Suppressing type checking for electronAPI methods
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
    // @ts-ignore - Suppressing type checking for electronAPI access
    if (!window.electronAPI?.getTemplatePaths) {
      return [];
    }
    // @ts-ignore - Suppressing type checking for electronAPI methods
    return await window.electronAPI.getTemplatePaths(templateName);
  } catch (error) {
    return [];
  }
}
