/**
 * @file ipcHandlers.ts
 * @description
 * Consolidated directory reading logic to avoid duplication for project vs. external directories.
 *
 * Step 1: Consolidate Directory Reading Logic
 *  - Created a single helper: readDirectoryTree()
 *  - Removed readDirectoryRecursive() and readDirectoryForTarget()
 *  - Now we handle project vs. external logic inside readDirectoryTree()
 */

import { ipcMain, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import ignore from 'ignore';

// Allowed file extensions for text-based files
const ALLOWED_EXTENSIONS = [
  '.txt', '.md', '.js', '.ts', '.tsx', '.jsx', '.json', '.py', '.css', '.html', '.sql'
];

interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: TreeNode[];
}

// --- STEP 1 REFRACTOR ---
// New single function to recursively read a directory, applying either project-root or external `.gitignore` logic.
function readDirectoryTree(
  dirPath: string,
  ig: ignore.Ignore,
  isProjectDir: boolean,
  projectRoot: string
): TreeNode[] {
  const results: TreeNode[] = [];

  let entries: string[];
  try {
    entries = fs.readdirSync(dirPath);
  } catch (err) {
    console.error('[list-directory] Failed to read dir:', dirPath, err);
    return results;
  }

  // Sort for consistent ordering
  entries.sort((a, b) => a.localeCompare(b));

  for (const entry of entries) {
    if (entry === '.git' || entry === '.DS_Store') {
      continue;
    }
    const fullPath = path.join(dirPath, entry);

    // Distinguish path to ignore-check by isProjectDir
    let relPath = '';
    if (isProjectDir) {
      relPath = path.relative(projectRoot, fullPath);
    } else {
      relPath = path.relative(dirPath, fullPath); 
    }

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
        children: readDirectoryTree(fullPath, ig, isProjectDir, projectRoot)
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

// The consolidated function used by 'list-directory'.
function createIgnoreForPath(targetPath: string, projectRoot: string) {
  let ig = ignore();

  // If we’re dealing with the project root or subfolders of it, we want the root-level .gitignore
  // Otherwise, we look for an external .gitignore or apply default ignores.
  const isProjectDir = targetPath.startsWith(projectRoot);

  if (isProjectDir) {
    const gitignorePath = path.join(projectRoot, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
      const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
      ig = ig.add(gitignoreContent.split('\n'));
    }
  } else {
    const externalGitignorePath = path.join(targetPath, '.gitignore');
    if (fs.existsSync(externalGitignorePath)) {
      const gitignoreContent = fs.readFileSync(externalGitignorePath, 'utf-8');
      ig = ig.add(gitignoreContent.split('\n'));
    } else {
      // Default patterns for external directories
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


export function registerIpcHandlers(): void {
  // list-directory
  ipcMain.handle('list-directory', async (_event, dirPath: string) => {
    let targetPath = dirPath;
    if (!path.isAbsolute(dirPath)) {
      targetPath = path.join(process.cwd(), dirPath);
    }

    console.log('[list-directory] Processing directory:', targetPath);

    const projectRoot = process.cwd();
    const { ig, isProjectDir } = createIgnoreForPath(targetPath, projectRoot);

    const tree = readDirectoryTree(targetPath, ig, isProjectDir, projectRoot);
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

      fs.writeFileSync(result.filePath, xmlContent, 'utf-8');
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
      const content = fs.readFileSync(filePath, 'utf-8');
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

      fs.writeFileSync(result.filePath, fileMapContent, 'utf-8');
      console.log('[export-file-map] Successfully saved file map to:', result.filePath);
      return true;
    } catch (err) {
      console.error('[export-file-map] Failed to save file map:', err);
      return false;
    }
  });

  /**
   * show-open-dialog
   * Opens a dialog for selecting directories
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

    while (fs.existsSync(targetPath)) {
      suffix += 1;
      baseName = `${folderName} (${suffix})`;
      targetPath = path.join(parentPath, baseName);
    }

    try {
      fs.mkdirSync(targetPath);
      console.log('[create-folder] Successfully created folder at:', targetPath);
      return targetPath;
    } catch (err) {
      console.error('[create-folder] Error creating folder:', err);
      return null;
    }
  });
}
