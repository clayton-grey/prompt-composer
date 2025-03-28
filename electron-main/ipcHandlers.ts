/**
 * @file ipcHandlers.ts
 * @description
 * Consolidated directory reading logic + Asynchronous FS operations, plus
 * newly added IPC handlers for listing and reading template files from both
 * the global and multiple project .prompt-composer directories.
 *
 * Step 3 Changes (Ensure removal of project-based templates):
 *  - We update the 'list-all-template-files' handler to accept an argument
 *    { projectFolders: string[] }, so that we can gather template files
 *    from each folder's .prompt-composer subfolder. If the user removes a
 *    folder, we no longer receive it here, so those templates won't appear.
 *
 * Implementation Details:
 *  - Instead of always using process.cwd(), we loop over the array of
 *    provided projectFolders. For each folder, we look for <folder>/.prompt-composer.
 *  - We gather .txt/.md files from each found directory, plus from global
 *    (~/.prompt-composer).
 *  - Return them as an array { fileName: string, source: 'global' | 'project' }.
 */

import { ipcMain, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import os from 'os';
import ignore from 'ignore';

const ALLOWED_EXTENSIONS = [
  '.txt', '.md', '.js', '.ts', '.tsx', '.jsx', '.json', '.py', '.css', '.html', '.sql'
];

// Reuse the interface for our directory tree
interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children ? : TreeNode[];
}

/**
 * Reads the specified folderPath for .txt/.md files. If the folder does not exist,
 * returns an empty array. This is used for scanning .prompt-composer directories.
 */
async function listPromptComposerFiles(folderPath: string): Promise < string[] > {
  try {
    const stat = await fs.promises.stat(folderPath);
    if (!stat.isDirectory()) {
      return [];
    }
  } catch {
    // folder doesn't exist
    return [];
  }

  const dirEntries = await fs.promises.readdir(folderPath, { withFileTypes: true });
  const results: string[] = [];
  for (const dirent of dirEntries) {
    if (!dirent.isFile()) continue;
    const ext = path.extname(dirent.name).toLowerCase();
    if (ext === '.txt' || ext === '.md') {
      results.push(dirent.name);
    }
  }
  return results;
}

/**
 * Creates an ignore object based on .gitignore or default patterns.
 */
async function createIgnoreForPath(
  targetPath: string,
  projectRoot: string
): Promise < { ig: ignore.Ignore;isProjectDir: boolean } > {
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
): Promise < TreeNode[] > {
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

    const relPath = isProjectDir ?
      path.relative(projectRoot, fullPath) :
      path.relative(dirPath, fullPath);

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
  ipcMain.handle('create-folder', async (_event, { parentPath, folderName }: { parentPath: string;folderName: string }) => {
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

  // read-prompt-composer-file
  ipcMain.handle('read-prompt-composer-file', async (_event, relativeFilename: string) => {
    try {
      const projectRoot = process.cwd();
      console.log(`[read-prompt-composer-file] Project root: ${projectRoot}`);

      const promptComposerFolder = path.join(projectRoot, '.prompt-composer');
      console.log(`[read-prompt-composer-file] Looking in folder: ${promptComposerFolder}`);

      // Check if the .prompt-composer directory exists
      try {
        const folderStats = await fs.promises.stat(promptComposerFolder);
        if (!folderStats.isDirectory()) {
          console.error(`[read-prompt-composer-file] .prompt-composer is not a directory at: ${promptComposerFolder}`);
          return null;
        }
      } catch (folderErr) {
        console.error(`[read-prompt-composer-file] .prompt-composer directory not found at: ${promptComposerFolder}`, folderErr);
        return null;
      }

      const targetPath = path.join(promptComposerFolder, relativeFilename);
      console.log(`[read-prompt-composer-file] Looking for file: ${targetPath}`);

      // Check if file exists
      const stats = await fs.promises.stat(targetPath);
      if (!stats.isFile()) {
        console.warn(`[read-prompt-composer-file] Not a file: ${targetPath}`);
        return null;
      }

      const content = await fs.promises.readFile(targetPath, 'utf-8');
      console.log(`[read-prompt-composer-file] Successfully read file: ${relativeFilename} (${content.length} bytes)`);
      return content;
    } catch (err) {
      console.warn(`[read-prompt-composer-file] Could not read file: ${relativeFilename}`, err);
      return null;
    }
  });

  /**
   * Step 3 modification:
   * Overhaul the 'list-all-template-files' to accept an argument { projectFolders: string[] }.
   * We gather .txt/.md files from the global (~/.prompt-composer) plus each project folder's
   * .prompt-composer subdirectory. This ensures if a project folder is removed from the
   * "active" set, its templates won't appear.
   *
   * Expects invocation like:
   *   ipcRenderer.invoke('list-all-template-files', { projectFolders: string[] })
   */
  ipcMain.handle('list-all-template-files', async (_event, args: { projectFolders: string[] }) => {
    const { projectFolders } = args || { projectFolders: [] };
    const result: Array < { fileName: string;source: 'global' | 'project' } > = [];

    // Always gather from global .prompt-composer
    const globalDir = path.join(os.homedir(), '.prompt-composer');
    try {
      const globalFiles = await listPromptComposerFiles(globalDir);
      for (const gf of globalFiles) {
        result.push({ fileName: gf, source: 'global' });
      }
    } catch (err) {
      console.warn('[list-all-template-files] Could not list global .prompt-composer files:', err);
    }

    // For each project folder, gather .prompt-composer
    for (const folder of projectFolders) {
      const localDir = path.join(folder, '.prompt-composer');
      try {
        const localFiles = await listPromptComposerFiles(localDir);
        for (const lf of localFiles) {
          // We label them 'project' here; the front-end might have multiple distinct project folders,
          // but we don't differentiate them in the returned data. The user sees just "Project."
          result.push({ fileName: lf, source: 'project' });
        }
      } catch (err) {
        console.warn(`[list-all-template-files] Could not list .prompt-composer in folder: ${folder}`, err);
      }
    }

    return result;
  });

  // read-global-prompt-composer-file
  ipcMain.handle('read-global-prompt-composer-file', async (_event, fileName: string) => {
    try {
      const globalFolder = path.join(os.homedir(), '.prompt-composer');
      const targetPath = path.join(globalFolder, fileName);

      console.log(`[read-global-prompt-composer-file] Looking for file at: ${targetPath}`);
      const stats = await fs.promises.stat(targetPath);
      if (!stats.isFile()) {
        console.warn(`[read-global-prompt-composer-file] Not a file: ${targetPath}`);
        return null;
      }

      const content = await fs.promises.readFile(targetPath, 'utf-8');
      console.log(`[read-global-prompt-composer-file] Successfully read file: ${fileName} (${content.length} bytes)`);
      return content;
    } catch (err) {
      console.warn(`[read-global-prompt-composer-file] Could not read file: ${fileName}`, err);
      return null;
    }
  });
}
