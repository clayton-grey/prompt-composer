/**
 * @file readTemplateFile.ts
 * @description
 * Provides a shared utility function for reading a template file from either the
 * project .prompt-composer folder or the global .prompt-composer folder. This replaces
 * the duplicated tryReadTemplateFile logic found in templateBlockParserAsync.ts and
 * templateResolver.ts, centralizing it in one place.
 *
 * Exported Function:
 *  - tryReadTemplateFile(baseName: string): Promise<string | null>
 *    Attempts to read the file from:
 *      1) project .prompt-composer
 *      2) global .prompt-composer
 *      - if the file has no extension, also tries .txt and .md
 *
 * Implementation Details:
 *  - We rely on electronAPI.readPromptComposerFile and electronAPI.readGlobalPromptComposerFile
 *    to fetch file contents. If not found in either location, returns null.
 *  - If the baseName has no extension, we try with .txt and .md appended.
 *  - This ensures consistent fallback behavior in both templateBlockParserAsync and templateResolver.
 *
 * Edge Cases:
 *  - If electronAPI is unavailable, logs a warning and returns null.
 *  - If the file does not exist in project or global directories (with or without .txt/.md), returns null.
 *  - Caller is responsible for handling the null case (missing file).
 */

/**
 * Tries to read a file from project .prompt-composer or global .prompt-composer. 
 * If the passed-in baseName has no extension, it also tries appending .txt and .md.
 * 
 * @param baseName - The file name or name+extension (e.g. "HELLO.txt" or "HELLO")
 * @returns A Promise resolving to the file contents, or null if not found.
 */
export async function tryReadTemplateFile(baseName: string): Promise < string | null > {
  if (!window.electronAPI) {
    console.warn('[readTemplateFile] electronAPI not available. Returning null.');
    return null;
  }

  // Attempt direct read from project .prompt-composer
  let content = await window.electronAPI.readPromptComposerFile(baseName);
  if (content) {
    return content;
  }

  // Attempt direct read from global .prompt-composer
  content = await window.electronAPI.readGlobalPromptComposerFile(baseName);
  if (content) {
    return content;
  }

  // If baseName includes a dot (like HELLO.txt), skip extension fallback
  if (baseName.includes('.')) {
    return null;
  }

  // If no extension, try .txt and .md
  const possibleExts = ['.txt', '.md'];
  for (const ext of possibleExts) {
    const fullName = baseName + ext;

    // Project
    let c = await window.electronAPI.readPromptComposerFile(fullName);
    if (c) {
      return c;
    }
    // Global
    c = await window.electronAPI.readGlobalPromptComposerFile(fullName);
    if (c) {
      return c;
    }
  }

  // Not found in any location
  return null;
}
