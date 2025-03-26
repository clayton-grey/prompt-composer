
/**
 * @file ipcHandlers.ts
 * @description
 * Consolidated directory reading logic + Asynchronous FS operations.
 * We also register IPC handlers for reading/writing files, importing/exporting XML,
 * and verifying file existence for XML import validation.
 *
 * Step 5 (Nested Template Support):
 *  - We add a new "read-prompt-composer-file" handler to read a file from
 *    the .prompt-composer folder in the project's root. If the file doesn't exist,
 *    we return null. If it does, we return its contents.
 *
 * Final Cleanup in prior steps:
 *  - We have removed the "export-file-map" IPC handler and references to FileMapViewer.
 */

import { ipcMain, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import ignore from 'ignore';

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
      // If .gitignore doesn't exist, skip
    }
  } else {
    const externalGitignorePath = path.join(targetPath, '.gitignore');
    try {
      const gitignoreContent = await fs.promises.readFile(externalGitignorePath, 'utf-8');
      ig = ig.add(gitignoreContent.split('\n'));
    } catch {
      // If .gitignore doesn't exist, apply defaults
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
      throw err;
    }
  });

  // read-file
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

  // show-open-dialog
  ipcMain.handle('show-open-dialog', async (_event, options: Electron.OpenDialogOptions) => {
    return dialog.showOpenDialog(options);
  });

  // create-folder
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
        // doesn't exist, so we can mkdir
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

  // verify-file-existence
  ipcMain.handle('verify-file-existence', async (_event, filePath: string) => {
    try {
      await fs.promises.stat(filePath);
      return true; // File exists
    } catch {
      return false; // File does not exist
    }
  });

  /**
   * Step 5: read-prompt-composer-file
   * Attempts to read a file from the .prompt-composer folder at the project root.
   * If not found, returns null.
   * 
   * We accept a relative filename (e.g. "MY_TEMPLATE.txt") and locate it in
   *   path.join(process.cwd(), ".prompt-composer", relativeFilename).
   */
  ipcMain.handle('read-prompt-composer-file', async (_event, relativeFilename: string) => {
    try {
      const projectRoot = process.cwd();
      const promptComposerFolder = path.join(projectRoot, '.prompt-composer');
      const targetPath = path.join(promptComposerFolder, relativeFilename);

      // Check if file exists
      const stats = await fs.promises.stat(targetPath);
      if (!stats.isFile()) {
        // It's not a file
        console.warn(`[read-prompt-composer-file] Not a file: ${targetPath}`);
        return null;
      }

      // If it is a file, read and return content
      const content = await fs.promises.readFile(targetPath, 'utf-8');
      return content;
    } catch (err) {
      // If anything fails, we return null
      console.warn('[read-prompt-composer-file] Could not read file:', relativeFilename, err);
      return null;
    }
  });
}
