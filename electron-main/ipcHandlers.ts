
/**
 * @file ipcHandlers.ts
 * @description
 * This file registers IPC handlers for interacting with the local file system.
 * - We parse and respect .gitignore rules
 * - We skip the .git folder
 * - We only return allowed text-based file extensions
 * - We also now return an object that includes the 'absolutePath', 'baseName', and 'children'
 *   so that the React code doesn't need to call any Node.js path methods.
 *
 * IPC Handler: "list-directory"
 *  - Input: dirPath (could be relative or absolute)
 *  - Returns: {
 *      absolutePath: string,
 *      baseName: string,
 *      children: Array<{ name, path, type, children? }>
 *    }
 *
 * @dependencies
 *  - electron (ipcMain)
 *  - fs, path (Node.js)
 *  - ignore (to parse .gitignore)
 *
 * @notes
 *  - .git folder is explicitly skipped
 *  - .gitignore is loaded from the project root (cwd) in this MVP
 *  - The returned object helps the front-end avoid usage of Node modules (like path)
 */

import { ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import ignore from 'ignore';

/**
 * Allowed file extensions for text-based files.
 * We can expand this list if needed.
 */
const ALLOWED_EXTENSIONS = [
  '.txt', '.md', '.js', '.ts', '.tsx', '.jsx', '.json', '.py', '.css', '.html'
];

/**
 * A single directory or file node in our tree structure.
 */
interface TreeNode {
  name: string;             // e.g. 'index.ts'
  path: string;             // absolute path
  type: 'file' | 'directory';
  children?: TreeNode[];
}

/**
 * Recursively reads the directory contents, filters out ignored paths,
 * and returns a nested JSON structure of directories/files.
 *
 * @param dirPath The absolute path to list
 * @param ig An instance of ignore.Ignore containing .gitignore patterns
 * @return A list of file/directory TreeNode objects (children)
 */
function readDirectoryRecursive(
  dirPath: string,
  ig: ignore.Ignore
): TreeNode[] {
  let results: TreeNode[] = [];

  // Read the directory contents
  let dirEntries: string[];
  try {
    dirEntries = fs.readdirSync(dirPath);
  } catch (err) {
    console.error('[list-directory] Failed to read dir:', dirPath, err);
    return results;
  }

  // Sort entries (folders then files, purely alphabetical)
  dirEntries.sort((a, b) => a.localeCompare(b));

  for (const entry of dirEntries) {
    // Explicitly skip .git folder
    if (entry === '.git') {
      continue;
    }

    const fullPath = path.join(dirPath, entry);
    const relPath = path.relative(process.cwd(), fullPath);

    // Check if the path matches .gitignore patterns
    if (ig.ignores(relPath)) {
      continue;
    }

    // Attempt to stat the path
    let stats: fs.Stats;
    try {
      stats = fs.statSync(fullPath);
    } catch {
      continue; // skip if can't stat
    }

    // Directory?
    if (stats.isDirectory()) {
      results.push({
        name: entry,
        path: fullPath,
        type: 'directory',
        children: readDirectoryRecursive(fullPath, ig)
      });
    } else {
      // It's a file - check extension
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
 * Registers all IPC handlers needed for file system operations.
 * Currently:
 *   "list-directory": returns { absolutePath, baseName, children } for the given dirPath
 */
export function registerIpcHandlers(): void {
  ipcMain.handle('list-directory', async (_event, dirPath: string) => {
    // Convert the dirPath to an absolute path
    let targetPath = dirPath;
    if (!path.isAbsolute(dirPath)) {
      targetPath = path.join(process.cwd(), dirPath);
    }

    // Prepare .gitignore
    const gitignorePath = path.join(process.cwd(), '.gitignore');
    let ig = ignore();
    if (fs.existsSync(gitignorePath)) {
      const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
      ig = ig.add(gitignoreContent.split('\n'));
    }

    // Recursively read the directory
    const tree = readDirectoryRecursive(targetPath, ig);

    // Return the absolute path and baseName so the front-end won't need Node 'path'
    const baseName = path.basename(targetPath);

    return {
      absolutePath: targetPath,
      baseName: baseName,
      children: tree
    };
  });
}
