
/**
 * @file ipcHandlers.ts
 * @description
 * This file registers IPC handlers for interacting with the local file system
 * and other tasks, including "export-xml" for saving the XML file.
 *
 * Key Responsibilities:
 *  - "list-directory": returns { absolutePath, baseName, children } for the given dirPath
 *  - "read-file": returns the content of a file as a string
 *  - "export-xml": opens a save dialog, writes the XML file if confirmed
 *
 * Dependencies:
 *  - electron (ipcMain, dialog)
 *  - fs, path (Node.js)
 *  - ignore (to parse .gitignore)
 */

import { ipcMain, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import ignore from 'ignore';

// Allowed file extensions for text-based files
const ALLOWED_EXTENSIONS = [
  '.txt', '.md', '.js', '.ts', '.tsx', '.jsx', '.json', '.py', '.css', '.html'
];

interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: TreeNode[];
}

/**
 * Recursively reads directory contents, filters out ignored paths,
 * returns a nested JSON structure of directories/files.
 */
function readDirectoryRecursive(
  dirPath: string,
  ig: ignore.Ignore
): TreeNode[] {
  let results: TreeNode[] = [];

  let dirEntries: string[];
  try {
    dirEntries = fs.readdirSync(dirPath);
  } catch (err) {
    console.error('[list-directory] Failed to read dir:', dirPath, err);
    return results;
  }

  // Sort entries
  dirEntries.sort((a, b) => a.localeCompare(b));

  for (const entry of dirEntries) {
    // Skip .git folder
    if (entry === '.git') {
      continue;
    }

    const fullPath = path.join(dirPath, entry);
    const relPath = path.relative(process.cwd(), fullPath);

    if (ig.ignores(relPath)) {
      continue;
    }

    let stats: fs.Stats;
    try {
      stats = fs.statSync(fullPath);
    } catch {
      continue;
    }

    if (stats.isDirectory()) {
      results.push({
        name: entry,
        path: fullPath,
        type: 'directory',
        children: readDirectoryRecursive(fullPath, ig)
      });
    } else {
      const ext = path.extname(entry).toLowerCase();
      if (ALLOWED_EXTENSIONS.includes(ext)) {
        results.push({
          name: entry,
          path: fullPath,
          type: 'file'
        });
      }
    }
  }

  return results;
}

/**
 * Registers all IPC handlers used by the renderer process.
 */
export function registerIpcHandlers(): void {
  // list-directory
  ipcMain.handle('list-directory', async (_event, dirPath: string) => {
    let targetPath = dirPath;
    if (!path.isAbsolute(dirPath)) {
      targetPath = path.join(process.cwd(), dirPath);
    }

    const gitignorePath = path.join(process.cwd(), '.gitignore');
    let ig = ignore();
    if (fs.existsSync(gitignorePath)) {
      const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
      ig = ig.add(gitignoreContent.split('\n'));
    }

    const tree = readDirectoryRecursive(targetPath, ig);
    const baseName = path.basename(targetPath);

    return {
      absolutePath: targetPath,
      baseName,
      children: tree
    };
  });

  // read-file
  ipcMain.handle('read-file', async (_event, filePath: string) => {
    try {
      console.log('[read-file] Reading file:', filePath);
      const content = fs.readFileSync(filePath, 'utf-8');
      console.log('[read-file] Content length:', content.length);
      return content;
    } catch (err) {
      console.error('[read-file] Failed to read file:', filePath, err);
      throw err;
    }
  });

  /**
   * export-xml
   * Input: { defaultFileName: string, xmlContent: string }
   * Output: boolean (true if saved successfully, false if canceled or error)
   */
  ipcMain.handle('export-xml', async (_event, { defaultFileName, xmlContent }) => {
    try {
      const saveDialogOptions: Electron.SaveDialogOptions = {
        title: 'Export Prompt Composition as XML',
        defaultPath: defaultFileName || 'prompt_composition.xml',
        filters: [
          { name: 'XML Files', extensions: ['xml'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      };

      const result = await dialog.showSaveDialog(saveDialogOptions);

      if (result.canceled || !result.filePath) {
        console.log('[export-xml] Save dialog canceled');
        return false;
      }

      fs.writeFileSync(result.filePath, xmlContent, 'utf-8');
      console.log('[export-xml] Successfully saved XML to:', result.filePath);
      return true;
    } catch (err) {
      console.error('[export-xml] Failed to save XML:', err);
      return false;
    }
  });
}
