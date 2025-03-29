/**
 * @file ipcHandlers.ts
 * @description
 * Consolidated directory reading logic + Asynchronous FS operations for Prompt Composer.
 *
 * In this update (Step 6: Add Support for .promptignore):
 *  - We enhance createIgnoreForPath to also look for ".prompt-composer/.promptignore" in the project root.
 *  - If found, we merge those rules with the existing .gitignore-based ignore.
 *
 * Key Changes:
 *  - Added logic in createIgnoreForPath to read .prompt-composer/.promptignore and merge its patterns.
 *
 * Other Existing IPC Handlers:
 *  - list-directory, read-file, export-xml, import-xml, show-open-dialog, etc.
 */

import { ipcMain, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import os from 'os';
import ignore from 'ignore';

const ALLOWED_EXTENSIONS = [
  '.txt',
  '.md',
  '.js',
  '.ts',
  '.tsx',
  '.jsx',
  '.json',
  '.py',
  '.css',
  '.html',
  '.sql',
];

interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: TreeNode[];
}

/**
 * Lists the template files in a given folder path. Used by listAllTemplateFiles to gather .txt or .md files.
 * @param folderPath - The absolute path to the .prompt-composer folder
 * @returns An array of filenames (string[]) that end with .txt or .md
 */
async function listPromptComposerFiles(folderPath: string): Promise<string[]> {
  try {
    const stat = await fs.promises.stat(folderPath);
    if (!stat.isDirectory()) {
      return [];
    }
  } catch {
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
 * createIgnoreForPath
 * Merges .gitignore rules with an optional .prompt-composer/.promptignore file if isProjectDir is true.
 * If the target path is external, we try to read its local .gitignore or apply minimal defaults.
 *
 * @param targetPath - The absolute directory path the user wants to list
 * @param projectRoot - The absolute path to the main project root (process.cwd())
 * @returns An object with { ig: ignore.Ignore, isProjectDir: boolean }
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

    // NEW in Step 6: also merge .promptignore from .prompt-composer
    const promptignorePath = path.join(projectRoot, '.prompt-composer', '.promptignore');
    console.log(promptignorePath);
    try {
      const promptignoreContent = await fs.promises.readFile(promptignorePath, 'utf-8');
      ig = ig.add(promptignoreContent.split('\n'));
      console.log('NUMBERWANG');
      console.log(promptignoreContent);
    } catch {
      console.log('WANGERNUMB');
      // If .promptignore doesn't exist or fails to read, silently skip
    }
  } else {
    // External folder outside project root
    const externalGitignorePath = path.join(targetPath, '.gitignore');
    try {
      const gitignoreContent = await fs.promises.readFile(externalGitignorePath, 'utf-8');
      ig = ig.add(gitignoreContent.split('\n'));
    } catch {
      // If no .gitignore found, apply minimal defaults
      ig = ig.add(['node_modules', '.git', '.DS_Store', '*.log']);
    }
  }
  return { ig, isProjectDir };
}

/**
 * Recursively reads a directory and returns an array of TreeNodes
 * respecting the ignore rules from createIgnoreForPath. Called by 'list-directory' below.
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
    return results;
  }

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
        children,
      });
    } else {
      const ext = path.extname(entry).toLowerCase();
      if (ALLOWED_EXTENSIONS.includes(ext)) {
        results.push({
          name: entry,
          path: fullPath,
          type: 'file',
        });
      }
    }
  }

  return results;
}

/**
 * Registers the IPC handlers for the Electron main process.
 * This includes listing directories, reading files, exporting/importing XML, etc.
 */
export function registerIpcHandlers(): void {
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
        children: tree,
      };
    } catch (err) {
      console.error('[list-directory] Async error:', err);
      throw err;
    }
  });

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

  ipcMain.handle('export-xml', async (_event, { defaultFileName, xmlContent }) => {
    try {
      const saveDialogOptions: Electron.SaveDialogOptions = {
        title: 'Export Prompt Composition as XML',
        defaultPath: defaultFileName || 'prompt_composition.xml',
        filters: [
          { name: 'XML Files', extensions: ['xml'] },
          { name: 'All Files', extensions: ['*'] },
        ],
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

  ipcMain.handle('import-xml', async () => {
    try {
      const openDialogOptions: Electron.OpenDialogOptions = {
        title: 'Import Prompt Composition from XML',
        filters: [
          { name: 'XML Files', extensions: ['xml'] },
          { name: 'All Files', extensions: ['*'] },
        ],
        properties: ['openFile'],
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

  ipcMain.handle('show-open-dialog', async (_event, options: Electron.OpenDialogOptions) => {
    return dialog.showOpenDialog(options);
  });

  ipcMain.handle(
    'create-folder',
    async (_event, { parentPath, folderName }: { parentPath: string; folderName: string }) => {
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
    }
  );

  ipcMain.handle('verify-file-existence', async (_event, filePath: string) => {
    try {
      await fs.promises.stat(filePath);
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('read-prompt-composer-file', async (_event, relativeFilename: string) => {
    try {
      const projectRoot = process.cwd();
      console.log(`[read-prompt-composer-file] Project root: ${projectRoot}`);

      const promptComposerFolder = path.join(projectRoot, '.prompt-composer');
      console.log(`[read-prompt-composer-file] Looking in folder: ${promptComposerFolder}`);

      try {
        const folderStats = await fs.promises.stat(promptComposerFolder);
        if (!folderStats.isDirectory()) {
          console.error(
            `[read-prompt-composer-file] .prompt-composer is not a directory: ${promptComposerFolder}`
          );
          return null;
        }
      } catch (folderErr) {
        console.error(
          `[read-prompt-composer-file] .prompt-composer not found at: ${promptComposerFolder}`,
          folderErr
        );
        return null;
      }

      const targetPath = path.join(promptComposerFolder, relativeFilename);
      console.log(`[read-prompt-composer-file] Looking for file: ${targetPath}`);

      const stats = await fs.promises.stat(targetPath);
      if (!stats.isFile()) {
        console.warn(`[read-prompt-composer-file] Not a file: ${targetPath}`);
        return null;
      }

      const content = await fs.promises.readFile(targetPath, 'utf-8');
      console.log(`[read-prompt-composer-file] Successfully read file: ${relativeFilename}`);
      return content;
    } catch (err) {
      console.warn(`[read-prompt-composer-file] Could not read file: ${relativeFilename}`, err);
      return null;
    }
  });

  /**
   * Step 3 modification: Overhauled 'list-all-template-files' to accept { projectFolders: string[] }.
   */
  ipcMain.handle('list-all-template-files', async (_event, args: { projectFolders: string[] }) => {
    const { projectFolders } = args || { projectFolders: [] };
    const result: Array<{ fileName: string; source: 'global' | 'project' }> = [];

    // Global .prompt-composer
    const globalDir = path.join(os.homedir(), '.prompt-composer');
    try {
      const globalFiles = await listPromptComposerFiles(globalDir);
      for (const gf of globalFiles) {
        result.push({ fileName: gf, source: 'global' });
      }
    } catch (err) {
      console.warn('[list-all-template-files] Could not list global .prompt-composer files:', err);
    }

    for (const folder of projectFolders) {
      const localDir = path.join(folder, '.prompt-composer');
      try {
        const localFiles = await listPromptComposerFiles(localDir);
        for (const lf of localFiles) {
          result.push({ fileName: lf, source: 'project' });
        }
      } catch (err) {
        console.warn(
          `[list-all-template-files] Could not list .prompt-composer in folder: ${folder}`,
          err
        );
      }
    }

    return result;
  });

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
      console.log(`[read-global-prompt-composer-file] Successfully read file: ${fileName}`);
      return content;
    } catch (err) {
      console.warn(`[read-global-prompt-composer-file] Could not read file: ${fileName}`, err);
      return null;
    }
  });

  /**
   * Step 4: Add the ability to write to a prompt-composer file.
   * This is used by the new "PromptResponseBlock" to persist content.
   */
  ipcMain.handle(
    'write-prompt-composer-file',
    async (_event, args: { relativeFilename: string; content: string }) => {
      try {
        const projectRoot = process.cwd();
        const promptComposerFolder = path.join(projectRoot, '.prompt-composer');
        // Ensure the folder exists
        try {
          await fs.promises.stat(promptComposerFolder);
        } catch (err) {
          console.log('[write-prompt-composer-file] .prompt-composer does not exist, creating it');
          await fs.promises.mkdir(promptComposerFolder, { recursive: true });
        }

        const targetPath = path.join(promptComposerFolder, args.relativeFilename);
        await fs.promises.writeFile(targetPath, args.content, 'utf-8');
        console.log('[write-prompt-composer-file] Wrote file to', targetPath);
        return true;
      } catch (err: any) {
        console.error(`[write-prompt-composer-file] Error writing file ${args.relativeFilename}:`, err);
        return { error: `Failed to write file ${args.relativeFilename}: ${err.message || 'Unknown error'}` };
      }
    }
  );
}
