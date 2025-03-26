/**
 * @file ipcHandlers.ts
 * @description
 * Consolidated directory reading logic (step 1) + Asynchronous FS operations (step 2).
 * We now use `fs.promises` (readdir, stat, readFile) instead of synchronous calls.
 */

import { ipcMain, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import ignore from 'ignore';

/** Allowed file extensions for text-based files */
const ALLOWED_EXTENSIONS = [
  '.txt', '.md', '.js', '.ts', '.tsx', '.jsx', '.json', '.py', '.css', '.html', '.sql'
];

interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: TreeNode[];
}

/**
 * Creates an ignore object based on .gitignore or default patterns.
 * We'll make this async for consistency, although reading .gitignore is minor.
 */
async function createIgnoreForPath(
  targetPath: string,
  projectRoot: string
): Promise<{ ig: ignore.Ignore; isProjectDir: boolean }> {
  let ig = ignore();
  const isProjectDir = targetPath.startsWith(projectRoot);

  if (isProjectDir) {
    const gitignorePath = path.join(projectRoot, '.gitignore');
    try {
      const gitignoreContent = await fs.promises.readFile(gitignorePath, 'utf-8');
      ig = ig.add(gitignoreContent.split('\n'));
    } catch {
      // If .gitignore doesn't exist or fails, just skip.
    }
  } else {
    const externalGitignorePath = path.join(targetPath, '.gitignore');
    try {
      const gitignoreContent = await fs.promises.readFile(externalGitignorePath, 'utf-8');
      ig = ig.add(gitignoreContent.split('\n'));
    } catch {
      // If .gitignore doesn't exist, apply default ignore patterns
      ig = ig.add([
        'node_modules',
        '.git',
        '.DS_Store',
        '*.log'
      ]);
    }
  }

  return { ig, isProjectDir };
}

/**
 * Recursively reads a directory, applying .gitignore-like filters (via 'ignore').
 * Uses asynchronous fs.promises APIs to avoid blocking the main thread.
 */
async function readDirectoryTree(
  dirPath: string,
  ig: ignore.Ignore,
  isProjectDir: boolean,
  projectRoot: string
): Promise<TreeNode[]> {
  const results: TreeNode[] = [];

  let entries: string[] = [];
  try {
    entries = await fs.promises.readdir(dirPath);
  } catch (err) {
    console.error('[list-directory] Failed to read dir (async):', dirPath, err);
    return results; // Return empty on failure
  }

  // Sort for consistent ordering
  entries.sort((a, b) => a.localeCompare(b));

  for (const entry of entries) {
    if (entry === '.git' || entry === '.DS_Store') {
      continue;
    }
    const fullPath = path.join(dirPath, entry);

    // Distinguish path to ignore-check
    const relPath = isProjectDir
      ? path.relative(projectRoot, fullPath)
      : path.relative(dirPath, fullPath);

    if (ig.ignores(relPath)) {
      continue;
    }

    let stats: fs.Stats;
    try {
      stats = await fs.promises.stat(fullPath);
    } catch {
      // If we fail to stat, skip this entry
      continue;
    }

    if (stats.isDirectory()) {
      const children = await readDirectoryTree(fullPath, ig, isProjectDir, projectRoot);
      results.push({
        name: entry,
        path: fullPath,
        type: 'directory',
        children
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

export function registerIpcHandlers(): void {
  // list-directory (async)
  ipcMain.handle('list-directory', async (_event, dirPath: string) => {
    try {
      let targetPath = dirPath;
      if (!path.isAbsolute(dirPath)) {
        targetPath = path.join(process.cwd(), dirPath);
      }

      console.log('[list-directory] Processing directory (async):', targetPath);

      const projectRoot = process.cwd();
      const { ig, isProjectDir } = await createIgnoreForPath(targetPath, projectRoot);

      const tree = await readDirectoryTree(targetPath, ig, isProjectDir, projectRoot);
      const baseName = path.basename(targetPath);

      return {
        absolutePath: targetPath,
        baseName,
        children: tree
      };
    } catch (err) {
      console.error('[list-directory] Async error:', err);
      throw err; // Let the renderer handle this error
    }
  });

  // read-file (still synchronous or we can easily adapt to async)
  ipcMain.handle('read-file', async (_event, filePath: string) => {
    try {
      console.log('[read-file] Reading file:', filePath);
      const content = await fs.promises.readFile(filePath, 'utf-8');
      console.log('[read-file] Content length:', content.length);
      return content;
    } catch (err) {
      console.error('[read-file] Failed to read file:', filePath, err);
      throw err;
    }
  });

  // export-xml
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

      await fs.promises.writeFile(result.filePath, xmlContent, 'utf-8');
      console.log('[export-xml] Successfully saved XML to:', result.filePath);
      return true;
    } catch (err) {
      console.error('[export-xml] Failed to save XML:', err);
      return false;
    }
  });

  // import-xml
  ipcMain.handle('import-xml', async () => {
    try {
      const openDialogOptions: Electron.OpenDialogOptions = {
        title: 'Import Prompt Composition from XML',
        filters: [
          { name: 'XML Files', extensions: ['xml'] },
          { name: 'All Files', extensions: ['*'] }
        ],
        properties: ['openFile']
      };

      const result = await dialog.showOpenDialog(openDialogOptions);

      if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        console.log('[import-xml] Open dialog canceled');
        return null;
      }

      const filePath = result.filePaths[0];
      const content = await fs.promises.readFile(filePath, 'utf-8');
      console.log('[import-xml] Successfully read XML from:', filePath);
      return content;
    } catch (err) {
      console.error('[import-xml] Failed to import XML:', err);
      return null;
    }
  });

  // export-file-map
  ipcMain.handle('export-file-map', async (_event, { defaultFileName, fileMapContent }) => {
    try {
      const saveDialogOptions: Electron.SaveDialogOptions = {
        title: 'Export File Map',
        defaultPath: defaultFileName || 'file_map.txt',
        filters: [
          { name: 'Text Files', extensions: ['txt'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      };

      const result = await dialog.showSaveDialog(saveDialogOptions);

      if (result.canceled || !result.filePath) {
        console.log('[export-file-map] Save dialog canceled');
        return false;
      }

      await fs.promises.writeFile(result.filePath, fileMapContent, 'utf-8');
      console.log('[export-file-map] Successfully saved file map to:', result.filePath);
      return true;
    } catch (err) {
      console.error('[export-file-map] Failed to save file map:', err);
      return false;
    }
  });

  /**
   * show-open-dialog
   * Opens a dialog for selecting directories.
   */
  ipcMain.handle('show-open-dialog', async (_event, options: Electron.OpenDialogOptions) => {
    return dialog.showOpenDialog(options);
  });

  /**
   * create-folder
   * Creates a new folder with a unique name in the given parent directory.
   */
  ipcMain.handle('create-folder', async (_event, { parentPath, folderName }: { parentPath: string; folderName: string }) => {
    let baseName = folderName;
    let suffix = 1;
    let targetPath = path.join(parentPath, baseName);

    while (true) {
      try {
        const exists = await fs.promises.stat(targetPath);
        if (exists && exists.isDirectory()) {
          suffix += 1;
          baseName = `${folderName} (${suffix})`;
          targetPath = path.join(parentPath, baseName);
        }
      } catch {
        // stat threw an error => it doesn't exist, so we can mkdir
        break;
      }
    }

    try {
      await fs.promises.mkdir(targetPath);
      console.log('[create-folder] Successfully created folder at:', targetPath);
      return targetPath;
    } catch (err) {
      console.error('[create-folder] Error creating folder:', err);
      return null;
    }
  });
}
