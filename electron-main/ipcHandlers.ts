/**
 * @file ipcHandlers.ts
 * @description
 * Consolidated directory reading logic + asynchronous FS operations for Prompt Composer.
 *
 * Step 5 (Centralize & Enhance Error Handling):
 *  - We introduced a local logError helper function to unify console logging in dev mode,
 *    removing raw console.error/warn calls in production.
 *  - We still rely on console messages only in dev because the main process cannot
 *    directly trigger React toasts. For user-visible errors in the frontend, the renderer
 *    must show them after receiving the error or null data from these handlers.
 *  - The code is otherwise the same as before, with try/catch blocks around file operations
 *    to handle errors. We removed direct console.warn/error calls and replaced them with `logError`.
 *
 * Step 1 (Debug/Perf enhancements):
 *  - Added a logDebug function that logs debug/performance info in dev mode, or if DEBUG_PROD 
 *    environment variable is set to '1' (or truthy).
 *  - Instrumented the 'list-directory' and 'read-file' handlers to measure performance timing.
 *  - Added an IPC handler 'check-permissions' to test read/write in the user's home directory, 
 *    helping to diagnose disk permission issues in packaged builds.
 */

import { ipcMain, dialog, app } from 'electron';
import fs from 'fs';
import path from 'path';
import os from 'os';
import ignore from 'ignore';
import { DirectoryListing, TreeNode, DirectoryPath, FilePath } from './types';

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

/**
 * Helper function to unify error logging in the main process.
 * In production, we omit console.error to reduce noise (unless in debug).
 */
function logError(context: string, err: unknown) {
  const isDev = process.env.NODE_ENV === 'development';
  const debugProd = process.env.DEBUG_PROD === '1' || process.env.DEBUG_PROD === 'true';

  if (isDev || debugProd) {
    if (err instanceof Error) {
      console.error(`[ipcHandlers] ${context}: ${err.message}`);
    } else {
      console.error(`[ipcHandlers] ${context}:`, err);
    }
  }
}

/**
 * Helper function to unify debug logging in the main process.
 * We log debug info in dev mode or if the user sets DEBUG_PROD=1.
 */
function logDebug(context: string, message: string) {
  const isDev = process.env.NODE_ENV === 'development';
  const debugProd = process.env.DEBUG_PROD === '1' || process.env.DEBUG_PROD === 'true';

  if (isDev || debugProd) {
    console.log(`[ipcHandlers DEBUG] ${context}: ${message}`);
  }
}

/**
 * Lists .txt or .md files in a .prompt-composer folder
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
 * Creates an ignore object for a given path, reading .gitignore and .promptignore files
 * @param pathToList The directory path to create ignore rules for
 * @param projectRoot The project root path (if available)
 * @returns Ignore object with configured rules
 */
async function createIgnoreForPath(pathToList: string, projectRoot: string): Promise<ignore.Ignore> {
  // Create a new ignore instance
  const ig = ignore();

  // Always ignore .git and .DS_Store
  ig.add(['.git/**', '.DS_Store']);

  // Helper function to read an ignore file
  const readIgnoreFile = async (filePath: string, ignoreType: string): Promise<string[]> => {
    try {
      const content = await fs.promises.readFile(filePath, 'utf8');
      logDebug('createIgnoreForPath', `Successfully read ${ignoreType} from ${filePath}`);
      return content.split('\n').filter(line => 
        line.trim() !== '' && !line.startsWith('#')
      );
    } catch (err) {
      logDebug('createIgnoreForPath', `No ${ignoreType} found at ${filePath} or couldn't read it`);
      return [];
    }
  };

  // Path-specific ignore rules (if we're in a project)
  if (projectRoot) {
    // Check for .gitignore in project root
    const gitIgnorePath = path.join(projectRoot, '.gitignore');
    const gitIgnoreRules = await readIgnoreFile(gitIgnorePath, '.gitignore');
    
    if (gitIgnoreRules.length > 0) {
      ig.add(gitIgnoreRules);
      logDebug('createIgnoreForPath', `Added ${gitIgnoreRules.length} rules from .gitignore in project root`);
    }

    // Check for .promptignore in project root
    const promptIgnorePath = path.join(projectRoot, '.promptignore');
    const promptIgnoreRules = await readIgnoreFile(promptIgnorePath, '.promptignore');
    
    if (promptIgnoreRules.length > 0) {
      ig.add(promptIgnoreRules);
      logDebug('createIgnoreForPath', `Added ${promptIgnoreRules.length} rules from .promptignore in project root`);
    }
    
    // Also check for .promptignore in .prompt-composer directory (legacy location)
    const legacyPromptIgnorePath = path.join(projectRoot, '.prompt-composer', '.promptignore');
    const legacyPromptIgnoreRules = await readIgnoreFile(legacyPromptIgnorePath, '.promptignore (legacy location)');
    
    if (legacyPromptIgnoreRules.length > 0) {
      ig.add(legacyPromptIgnoreRules);
      logDebug('createIgnoreForPath', `Added ${legacyPromptIgnoreRules.length} rules from .promptignore in legacy location`);
    }
  }

  // If pathToList is not project root, check for ignore files in that directory too
  if (pathToList !== projectRoot) {
    // Check for .gitignore in the target directory
    const localGitIgnorePath = path.join(pathToList, '.gitignore');
    const localGitIgnoreRules = await readIgnoreFile(localGitIgnorePath, '.gitignore');
    
    if (localGitIgnoreRules.length > 0) {
      ig.add(localGitIgnoreRules);
      logDebug('createIgnoreForPath', `Added ${localGitIgnoreRules.length} rules from .gitignore in target directory`);
    }

    // Check for .promptignore in the target directory
    const localPromptIgnorePath = path.join(pathToList, '.promptignore');
    const localPromptIgnoreRules = await readIgnoreFile(localPromptIgnorePath, '.promptignore');
    
    if (localPromptIgnoreRules.length > 0) {
      ig.add(localPromptIgnoreRules);
      logDebug('createIgnoreForPath', `Added ${localPromptIgnoreRules.length} rules from .promptignore in target directory`);
    }
    
    // Also check for .promptignore in .prompt-composer subdirectory (legacy location)
    const localLegacyPromptIgnorePath = path.join(pathToList, '.prompt-composer', '.promptignore');
    const localLegacyPromptIgnoreRules = await readIgnoreFile(localLegacyPromptIgnorePath, '.promptignore (legacy location)');
    
    if (localLegacyPromptIgnoreRules.length > 0) {
      ig.add(localLegacyPromptIgnoreRules);
      logDebug('createIgnoreForPath', `Added ${localLegacyPromptIgnoreRules.length} rules from .promptignore in legacy subdirectory`);
    }
  }

  // Always ignore some common large directories
  ig.add(['node_modules/**', 'dist/**', 'build/**', 'release/**', 'coverage/**']);
  
  return ig;
}

/**
 * Recursively (or shallowly) reads a directory, returning an array of TreeNodes
 * @param dirPath The directory path
 * @param ig The ignore rules instance
 * @param isProjectDir Whether this path is within the recognized project root
 * @param projectRoot The project root path
 * @param shallow If true, only read immediate children (skip recursion)
 * @returns TreeNode[]
 */
async function readDirectoryTree(
  dirPath: string,
  ig: ignore.Ignore,
  isProjectDir: boolean,
  projectRoot: string,
  shallow = false
): Promise<TreeNode[]> {
  const results: TreeNode[] = [];
  let entries: string[] = [];
  
  try {
    entries = await fs.promises.readdir(dirPath);
  } catch (err: unknown) {
    logError(`[list-directory] Failed to read dir (async) [${dirPath}]`, err);
    return results;
  }

  entries.sort((a, b) => a.localeCompare(b));

  // Skip heavy directories immediately for better performance
  const basename = path.basename(dirPath);
  if (basename === 'node_modules' || basename === '.git' || basename === 'release') {
    logDebug('readDirectoryTree', `Skipping heavy directory: ${dirPath}`);
    return results;
  }

  for (const entry of entries) {
    // Skip common heavy directories immediately
    if (entry === 'node_modules' || entry === '.git' || entry === 'release' || 
        entry === '.DS_Store' || entry === 'dist' || entry === 'build' || 
        entry === 'coverage') {
      continue;
    }
    
    const fullPath = path.join(dirPath, entry);
    
    // Get path relative to project root (for ignore patterns)
    const relPath = isProjectDir
      ? path.relative(projectRoot, fullPath)
      : path.relative(path.dirname(dirPath), fullPath);

    // Check if this path matches any ignore patterns
    if (ig.ignores(relPath)) {
      logDebug('readDirectoryTree', `Ignoring path due to ignore patterns: ${relPath}`);
      continue;
    }

    let stats: fs.Stats;
    try {
      stats = await fs.promises.stat(fullPath);
    } catch (statErr: unknown) {
      // skip this entry if we can't stat
      logDebug('[list-directory]', `Could not stat: ${fullPath}. Skipping.`);
      continue;
    }

    if (stats.isDirectory()) {
      if (shallow) {
        // Provide an empty children array
        results.push({
          name: entry,
          path: fullPath,
          type: 'directory',
          children: [],
        });
      } else {
        // Recursively read its children
        const children = await readDirectoryTree(fullPath, ig, isProjectDir, projectRoot, false);
        results.push({
          name: entry,
          path: fullPath,
          type: 'directory',
          children,
        });
      }
    } else {
      // File
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

// Add debug logging for production builds
const DEBUG_PROD = process.env.DEBUG_PROD === '1';
const log = (message: string, ...args: any[]) => {
  if (DEBUG_PROD || process.env.NODE_ENV !== 'production') {
    console.log(`[main] ${message}`, ...args);
  }
};

// Improve error handling in file operations
const safeReadFile = (filePath: FilePath): string | null => {
  try {
    if (fs.existsSync(filePath)) {
      log(`Reading file: ${filePath}`);
      return fs.readFileSync(filePath, 'utf8');
    }
    log(`File not found: ${filePath}`);
    return null;
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error);
    return null;
  }
};

// Safely create directories if they don't exist
const ensureDirectoryExists = (dirPath: DirectoryPath): boolean => {
  try {
    if (!fs.existsSync(dirPath)) {
      log(`Creating directory: ${dirPath}`);
      fs.mkdirSync(dirPath, { recursive: true });
    }
    return true;
  } catch (error) {
    console.error(`Error creating directory ${dirPath}:`, error);
    return false;
  }
};

/**
 * registerIpcHandlers
 *
 * The 'list-directory' channel now accepts:
 *   (dirPath: string, options?: { shallow?: boolean; addToProjectDirectories?: boolean })
 * We default shallow=false and addToProjectDirectories=false if not provided.
 */
export function registerIpcHandlers(): void {
  // IPC handler to check if DevTools are open
  ipcMain.handle("is-dev-tools-open", () => {
    return global.isDevToolsOpen === true;
  });

  log('Setting up IPC handlers');

  // Initialize the global project directories list if it doesn't exist
  if (!global.projectDirectories) {
    global.projectDirectories = [];
  }

  // list-directory
  ipcMain.handle(
    'list-directory',
    async (
      _event,
      dirPath: string,
      options?: { shallow?: boolean; addToProjectDirectories?: boolean }
    ): Promise<DirectoryListing> => {
      const startTime = performance.now();
      const shallow = options?.shallow ?? false;
      const addToProjectDirectories = options?.addToProjectDirectories ?? false;
      logDebug('[list-directory]', `Invoked for path=${dirPath}, shallow=${shallow}, addToProjectDirectories=${addToProjectDirectories}`);

      try {
        let targetPath = dirPath;
        if (!path.isAbsolute(dirPath)) {
          targetPath = path.join(process.cwd(), dirPath);
        }

        // When a user explicitly wants to add a directory, add it to project directories
        // so that templates in this directory can be found
        try {
          const stats = await fs.promises.stat(targetPath);
          if (stats.isDirectory()) {
            // Check if we can access the directory
            await fs.promises.access(targetPath, fs.constants.R_OK);
            
            // Initialize projectDirectories if it doesn't exist
            if (!global.projectDirectories) {
              global.projectDirectories = [];
              logDebug('[list-directory]', 'Initialized empty projectDirectories array');
            }
            
            // The first directory opened by the user becomes the "current" project root
            // but all directories are treated equally for template searching
            if (!global.projectRoot) {
              global.projectRoot = targetPath;
              logDebug('[list-directory]', `Set initial project root to: ${global.projectRoot}`);
            }
            
            // Normalize path for consistent comparison
            const normalizedTargetPath = path.normalize(targetPath);
            
            // Log current project directories
            logDebug('[list-directory]', `Current project directories (${global.projectDirectories.length}): ${global.projectDirectories.join(', ') || 'none'}`);
            logDebug('[list-directory]', `Current project root: ${global.projectRoot || 'not set'}`);
            logDebug('[list-directory]', `Target directory being opened: ${targetPath}`);
            
            // Only add to projectDirectories if explicitly requested
            if (addToProjectDirectories) {
              // Check if it's already in the projectDirectories list using normalized paths
              const alreadyInList = global.projectDirectories.some(dir => 
                path.normalize(dir) === normalizedTargetPath
              );
              
              if (!alreadyInList) {
                // Add it to the list of project directories for template search
                global.projectDirectories.push(targetPath);
                logDebug('[list-directory]', `User opened a new directory - added to project directories list. Now tracking ${global.projectDirectories.length} directories:`);
                global.projectDirectories.forEach((dir, i) => {
                  logDebug('[list-directory]', `  [${i}] ${dir}`);
                });
                
                // Reset template cache when adding a new directory
                global.templateCache = {};
                logDebug('[list-directory]', 'Template cache cleared due to new directory being added');
              } else {
                logDebug('[list-directory]', `Directory ${targetPath} is already in the project directories list`);
              }
            } else {
              logDebug('[list-directory]', `Directory ${targetPath} opened but not added to project directories (addToProjectDirectories=false)`);
            }
          }
        } catch (err) {
          logError('[list-directory] Error tracking opened directory', err);
        }

        const projectRoot = global.projectRoot || process.cwd();
        const ig = await createIgnoreForPath(targetPath, projectRoot);
        const treeNodes = await readDirectoryTree(targetPath, ig, targetPath === projectRoot, projectRoot, shallow);
        const baseName = path.basename(targetPath);

        const endTime = performance.now();
        logDebug(
          '[list-directory]',
          `Completed in ${Math.round(endTime - startTime)}ms for path=${dirPath}`
        );

        return {
          absolutePath: targetPath,
          baseName,
          children: treeNodes,
        };
      } catch (err: unknown) {
        logError('[list-directory] Async error', err);
        return {
          absolutePath: dirPath,
          baseName: path.basename(dirPath),
          children: [],
        };
      }
    }
  );

  // read-file
  ipcMain.handle('read-file', async (_event, filePath: string): Promise<string> => {
    const startTime = performance.now();
    logDebug('[read-file]', `Invoked for file=${filePath}`);

    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const endTime = performance.now();
      logDebug(
        '[read-file]',
        `Completed reading file=${filePath} in ${Math.round(endTime - startTime)}ms`
      );
      return content;
    } catch (err: unknown) {
      logError(`[read-file] Failed [${filePath}]`, err);
      throw err;
    }
  });

  // export-xml
  ipcMain.handle(
    'export-xml',
    async (
      _event,
      { defaultFileName, xmlContent }: { defaultFileName?: string; xmlContent: string }
    ): Promise<boolean> => {
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
          return false;
        }
        await fs.promises.writeFile(result.filePath, xmlContent, 'utf-8');
        return true;
      } catch (err: unknown) {
        logError('[export-xml] Failed to save XML', err);
        return false;
      }
    }
  );

  // import-xml
  ipcMain.handle('import-xml', async (): Promise<string | null> => {
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
        return null;
      }
      const filePath = result.filePaths[0];
      const content = await fs.promises.readFile(filePath, 'utf-8');
      return content;
    } catch (err: unknown) {
      logError('[import-xml] Failed to import XML', err);
      return null;
    }
  });

  // show-open-dialog
  ipcMain.handle('show-open-dialog', async (_event, options: Electron.OpenDialogOptions) => {
    return dialog.showOpenDialog(options);
  });

  // create-folder
  ipcMain.handle(
    'create-folder',
    async (
      _event,
      { parentPath, folderName }: { parentPath: string; folderName: string }
    ): Promise<string | null> => {
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
        return targetPath;
      } catch (err: unknown) {
        logError('[create-folder] Error creating folder', err);
        return null;
      }
    }
  );

  // verify-file-existence
  ipcMain.handle('verify-file-existence', async (_event, filePath: string): Promise<boolean> => {
    try {
      await fs.promises.stat(filePath);
      return true;
    } catch {
      return false;
    }
  });

  // read-prompt-composer-file
  ipcMain.handle(
    'read-prompt-composer-file',
    async (_event, fileName: string, subDirectory?: string): Promise<string | null> => {
      try {
        // Sanity check for very long filenames which are likely template content
        // This happens when template content is mistakenly passed instead of a filename
        if (fileName && (fileName.length > 100 || fileName.includes('\n'))) {
          logError('read-prompt-composer-file', 'Invalid filename: Received template content instead of a filename');
            return null;
          }
        
        // Create a list of search directories - start with project directories list
        const searchDirectories: string[] = [];
        
        // First, add all explicitly opened project directories in the order they were added
        if (global.projectDirectories && global.projectDirectories.length > 0) {
          searchDirectories.push(...global.projectDirectories);
          logDebug('read-prompt-composer-file', `Searching in ${global.projectDirectories.length} project directories`);
        } else {
          logDebug('read-prompt-composer-file', 'No project directories available - user has not opened any folders yet');
        }
        
        // Add home directory as fallback (always available)
        const homeDir = os.homedir();
        if (!searchDirectories.some(dir => path.normalize(dir) === path.normalize(homeDir))) {
          searchDirectories.push(homeDir);
          logDebug('read-prompt-composer-file', `Added home directory to search path: ${homeDir}`);
        }
        
        // Log the search paths
        logDebug('read-prompt-composer-file', `Search paths (${searchDirectories.length}): ${searchDirectories.join(', ')}`);
        
        // Try to find the file in each directory in order
        for (const baseDir of searchDirectories) {
          let dirPath = path.join(baseDir, '.prompt-composer');
          
          // Log search details
          logDebug('read-prompt-composer-file', `Looking in directory: ${dirPath}`);
          
          // Check if this directory exists and is readable
          try {
            await fs.promises.access(dirPath, fs.constants.R_OK);
          } catch (dirErr) {
            logDebug('read-prompt-composer-file', `Directory not accessible, skipping: ${dirPath}`);
            continue; // Skip to next directory
          }
          
          if (subDirectory) {
            dirPath = path.join(dirPath, subDirectory);
            
            // Check if subdirectory exists
            try {
              await fs.promises.access(dirPath, fs.constants.R_OK);
            } catch (subdirErr) {
              logDebug('read-prompt-composer-file', `Subdirectory not accessible, skipping: ${dirPath}`);
              continue; // Skip to next directory
            }
          }
          
          const filePath = path.join(dirPath, fileName);
          logDebug('read-prompt-composer-file', `Trying path: ${filePath}`);
          
          // Try to read the file
          try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            logDebug('read-prompt-composer-file', `Successfully read file: ${filePath}`);
        return content;
          } catch (fileErr) {
            // If no extension was provided, try with extensions
            if (!fileName.includes('.')) {
              // Try with .txt extension
              const txtPath = filePath + '.txt';
              logDebug('read-prompt-composer-file', `Trying with .txt extension: ${txtPath}`);
              
              try {
                const txtContent = await fs.promises.readFile(txtPath, 'utf-8');
                logDebug('read-prompt-composer-file', `Successfully read .txt file: ${txtPath}`);
                return txtContent;
              } catch (txtErr) {
                // Continue to next extension
              }
              
              // Try with .md extension
              const mdPath = filePath + '.md';
              logDebug('read-prompt-composer-file', `Trying with .md extension: ${mdPath}`);
              
              try {
                const mdContent = await fs.promises.readFile(mdPath, 'utf-8');
                logDebug('read-prompt-composer-file', `Successfully read .md file: ${mdPath}`);
                return mdContent;
              } catch (mdErr) {
                // Continue to next directory
              }
            }
          }
        }
        
        // If we got here, no file was found in any location
        logDebug('read-prompt-composer-file', `No file found for ${fileName} in any location`);
        return null;
      } catch (error) {
        console.error(`[read-prompt-composer-file] Error in read-prompt-composer-file (${fileName}):`, error);
        return null;
      }
    }
  );

  // list-all-template-files
  ipcMain.handle(
    'list-all-template-files',
    async (
      _event,
      args: { projectFolders: string[] }
    ): Promise<Array<{ fileName: string; source: 'global' | 'project' }>> => {
      const { projectFolders } = args || { projectFolders: [] };
      const result: Array<{ fileName: string; source: 'global' | 'project' }> = [];

      const globalDir = path.join(os.homedir(), '.prompt-composer');
      try {
        const globalFiles = await listPromptComposerFiles(globalDir);
        for (const gf of globalFiles) {
          result.push({ fileName: gf, source: 'global' });
        }
      } catch (err: unknown) {
        logError('[list-all-template-files] Could not list global .prompt-composer files', err);
      }

      for (const folder of projectFolders) {
        const localDir = path.join(folder, '.prompt-composer');
        try {
          const localFiles = await listPromptComposerFiles(localDir);
          for (const lf of localFiles) {
            result.push({ fileName: lf, source: 'project' });
          }
        } catch (err: unknown) {
          logError(
            `[list-all-template-files] Could not list .prompt-composer in folder: ${folder}`,
            err
          );
        }
      }

      return result;
    }
  );

  // read-global-prompt-composer-file
  ipcMain.handle(
    'read-global-prompt-composer-file',
    async (event, fileName: string, subDirectory?: string): Promise<string | null> => {
      try {
        const homeDir = os.homedir();
        let dirPath = path.join(homeDir, '.prompt-composer');
        
        // Ensure the base directory exists
        ensureDirectoryExists(dirPath);
        
        if (subDirectory) {
          dirPath = path.join(dirPath, subDirectory);
          // Ensure the subdirectory exists
          ensureDirectoryExists(dirPath);
        }
        
        const filePath = path.join(dirPath, fileName);
        log(`Attempting to read global file: ${filePath}`);
        
        const content = safeReadFile(filePath);
        
        // If no content but no extension was provided, try with extensions
        if (!content && !fileName.includes('.')) {
          // Try with .txt extension
          const txtPath = filePath + '.txt';
          log(`Trying with .txt extension: ${txtPath}`);
          const txtContent = safeReadFile(txtPath);
          if (txtContent) return txtContent;
          
          // Try with .md extension
          const mdPath = filePath + '.md';
          log(`Trying with .md extension: ${mdPath}`);
          const mdContent = safeReadFile(mdPath);
          if (mdContent) return mdContent;
        }
        
        return content;
      } catch (error) {
        console.error(`Error in read-global-prompt-composer-file (${fileName}):`, error);
        return null;
      }
    }
  );

  // write-prompt-composer-file
  ipcMain.handle(
    'write-prompt-composer-file',
    async (
      _event,
      args: { relativeFilename: string; content: string }
    ): Promise<boolean | { error: string }> => {
      try {
        const projectRoot = process.cwd();
        const promptComposerFolder = path.join(projectRoot, '.prompt-composer');
        try {
          await fs.promises.stat(promptComposerFolder);
        } catch {
          await fs.promises.mkdir(promptComposerFolder, { recursive: true });
        }

        const targetPath = path.join(promptComposerFolder, args.relativeFilename);
        await fs.promises.writeFile(targetPath, args.content, 'utf-8');
        return true;
      } catch (err: unknown) {
        logError(`[write-prompt-composer-file] Error writing file ${args.relativeFilename}`, err);
        if (err instanceof Error) {
          return { error: `Failed to write file ${args.relativeFilename}: ${err.message}` };
        }
        return { error: `Failed to write file ${args.relativeFilename}: Unknown error` };
      }
    }
  );

  /**
   * check-permissions
   * Tests basic file system permissions to help diagnose access problems.
   */
  ipcMain.handle('check-permissions', async (_event): Promise<any> => {
    const results = {
      home: { read: false, write: false, path: '' },
      promptComposerGlobal: { read: false, write: false, exists: false, path: '' },
      temp: { read: false, write: false, path: '' }
    };
    
    try {
      // Test home directory access
      const homeDir = os.homedir();
      results.home.path = homeDir;
      await fs.promises.access(homeDir, fs.constants.R_OK);
      results.home.read = true;
      await fs.promises.access(homeDir, fs.constants.W_OK);
      results.home.write = true;
      
      // Test .prompt-composer access
      const promptComposerDir = path.join(homeDir, '.prompt-composer');
      results.promptComposerGlobal.path = promptComposerDir;
      try {
        await fs.promises.access(promptComposerDir);
        results.promptComposerGlobal.exists = true;
        await fs.promises.access(promptComposerDir, fs.constants.R_OK);
        results.promptComposerGlobal.read = true;
        await fs.promises.access(promptComposerDir, fs.constants.W_OK);
        results.promptComposerGlobal.write = true;
      } catch (err) {
        // Directory doesn't exist or isn't accessible
        logError(`[check-permissions] .prompt-composer dir issue: ${promptComposerDir}`, err);
      }
      
      // Test temp directory access
      const tempDir = os.tmpdir();
      results.temp.path = tempDir;
      await fs.promises.access(tempDir, fs.constants.R_OK);
      results.temp.read = true;
      await fs.promises.access(tempDir, fs.constants.W_OK);
      results.temp.write = true;
      
      return results;
    } catch (err) {
      logError('[check-permissions] Error testing permissions', err);
      return { ...results, error: String(err) };
    }
  });

  // get-template-paths
  ipcMain.handle('get-template-paths', async (_event, templateName: string): Promise<string[] | Record<string, any>> => {
    try {
      // Special diagnostic info request
      if (templateName === '_diagnostic_info_') {
        return {
          projectDirectories: global.projectDirectories || [],
          projectRoot: global.projectRoot || null,
          home: os.homedir(),
          templateCacheSize: Object.keys(global.templateCache || {}).length,
          cwd: process.cwd(),
          timestamp: new Date().toISOString(),
          appPath: app.getAppPath(),
          resourcePath: process.resourcesPath,
          isProduction: process.env.NODE_ENV !== 'development',
        };
      }

      const searchPaths: string[] = [];
      
      // Project-specific templates (multiple project directories)
      if (global.projectDirectories && global.projectDirectories.length > 0) {
        for (const projectDir of global.projectDirectories) {
          if (projectDir) {
            const projectTemplate = path.join(projectDir, '.prompt-composer', 'template', templateName);
            searchPaths.push(projectTemplate);
          }
        }
      }
      
      // Global templates (in home directory)
      const homeDir = os.homedir();
      if (homeDir) {
        const globalTemplate = path.join(homeDir, '.prompt-composer', 'template', templateName);
        searchPaths.push(globalTemplate);
      }
      
      return searchPaths;
    } catch (err: unknown) {
      logError('[get-template-paths] Error getting template paths', err);
      return [];
    }
  });

  // Add a handler to check filesystem permissions
  ipcMain.handle('check-filesystem-permissions', async () => {
    const result: {
      home?: { dir: string; canRead: boolean; canWrite: boolean };
      globalPromptComposer?: { dir: string; canRead: boolean; canWrite: boolean };
      projectPromptComposer?: { dir: string; canRead: boolean; canWrite: boolean };
      temp?: { dir: string; canRead: boolean; canWrite: boolean };
      error?: string;
    } = {};

    try {
      console.log('Checking filesystem permissions...');
      
      // Check home directory
      const homeDir = app.getPath('home');
      result.home = await checkDirPermissions(homeDir);
      
      // Check global .prompt-composer directory
      const globalPromptComposerDir = path.join(homeDir, '.prompt-composer');
      result.globalPromptComposer = await checkDirPermissions(globalPromptComposerDir);
      
      // Check project .prompt-composer directory
      const projectDir = global.projectRoot || process.cwd();
      const projectPromptComposerDir = path.join(projectDir, '.prompt-composer');
      
      // Log detailed information about the project directory checks
      console.log(`[check-permissions] Project root: ${projectDir}`);
      console.log(`[check-permissions] Project .prompt-composer: ${projectPromptComposerDir}`);
      
      // Try to check if the projectDir itself is accessible first
      try {
        await fs.promises.access(projectDir, fs.constants.R_OK);
        console.log(`[check-permissions] Project directory is readable: ${projectDir}`);
        
        result.projectPromptComposer = await checkDirPermissions(projectPromptComposerDir);
      } catch (projectDirErr) {
        console.error(`[check-permissions] Project directory is not accessible: ${projectDir}`, projectDirErr);
        
        // Still report on the directory, but mark it as not accessible
        result.projectPromptComposer = { 
          dir: projectPromptComposerDir, 
          canRead: false, 
          canWrite: false 
        };
      }
      
      // Check temp directory
      const tempDir = app.getPath('temp');
      result.temp = await checkDirPermissions(tempDir);
      
      console.log('Filesystem permissions result:', result);
      return result;
    } catch (error) {
      console.error('Error checking filesystem permissions:', error);
      if (error instanceof Error) {
        result.error = error.message;
      } else {
        result.error = String(error);
      }
      return result;
    }
  });

  // read-template-file
  ipcMain.handle('read-template-file', async (_event, templateName: string): Promise<string | null> => {
    try {
      if (!templateName) {
        logDebug('read-template-file', 'No template name provided');
        return null;
      }
      
      // Clean up template name by trimming any whitespace
      const cleanTemplateName = templateName.trim();
      
      // Initialize projectDirectories if needed
      if (!global.projectDirectories) {
        global.projectDirectories = [];
        logDebug('read-template-file', 'Initialized empty projectDirectories array');
      }
      
      // Define search directories in priority order
      const searchDirectories: string[] = [];
      
      // First, add all project directories that have been explicitly opened by the user
      // These are searched in the order they were added
      if (global.projectDirectories && global.projectDirectories.length > 0) {
        searchDirectories.push(...global.projectDirectories);
        logDebug('read-template-file', `Added ${global.projectDirectories.length} project directories to search paths`);
      } else {
        logDebug('read-template-file', 'No project directories in list - user has not opened any folders yet');
      }
      
      // Last, add the home directory for user global templates (always available)
      const homeDir = os.homedir();
      if (!searchDirectories.includes(homeDir)) {
        searchDirectories.push(homeDir);
        logDebug('read-template-file', `Added home directory to search paths: ${homeDir}`);
      }
      
      // Log the search order with more details
      logDebug('read-template-file', `Template search paths (${searchDirectories.length}): ${searchDirectories.join(', ')}`);
      
      // Check if we have this template in cache already
      if (global.templateCache && global.templateCache[cleanTemplateName]) {
        logDebug('read-template-file', `Using cached template: ${cleanTemplateName}`);
        return global.templateCache[cleanTemplateName];
      }
      
      // Clear cache if paths were removed or changed
      if (templateName.startsWith('_cache_invalidated')) {
        logDebug('read-template-file', 'Cache invalidation requested');
        global.templateCache = {};
        return null;
      }
      
      // Generate all possible file paths for the template in priority order
      const allPaths: string[] = [];
      
      for (const baseDir of searchDirectories) {
        try {
          // Skip if directory isn't accessible
          await fs.promises.access(baseDir, fs.constants.R_OK).catch(() => {
            logDebug('read-template-file', `Directory not readable, skipping: ${baseDir}`);
            return; // Skip to next directory
          });
          
          const promptComposerDir = path.join(baseDir, '.prompt-composer');
          
          // Direct path in .prompt-composer
          allPaths.push(path.join(promptComposerDir, cleanTemplateName));
          
          // If no extension provided, add .txt and .md variants
          if (!path.extname(cleanTemplateName)) {
            allPaths.push(path.join(promptComposerDir, `${cleanTemplateName}.txt`));
            allPaths.push(path.join(promptComposerDir, `${cleanTemplateName}.md`));
          }
        } catch (err) {
          logError('read-template-file', `Error processing directory ${baseDir}: ${err}`);
        }
      }
      
      logDebug('read-template-file', `Generated ${allPaths.length} search paths for "${cleanTemplateName}"`);
      
      // Try each path in priority order
      for (const filePath of allPaths) {
        try {
          if (fs.existsSync(filePath)) {
            logDebug('read-template-file', `✅ Found template at: ${filePath}`);
            const content = fs.readFileSync(filePath, 'utf8');
            
            // Cache the template by name for future use
            if (!global.templateCache) {
              global.templateCache = {};
            }
            global.templateCache[cleanTemplateName] = content;
            
            return content;
          }
        } catch (err: any) {
          logError('read-template-file', `Error reading template file ${filePath}: ${err.message}`);
        }
      }
      
      logDebug('read-template-file', `Template "${cleanTemplateName}" not found in any location`);
      return null;
    } catch (error) {
      logError('read-template-file', `Error in read-template-file: ${error}`);
      return null;
    }
  });

  // This handler is called when a folder is removed from the UI
  ipcMain.handle('remove-project-directory', async (_event, folderPath: string): Promise<boolean> => {
    try {
      logDebug('remove-project-directory', `Removing directory from templates list: ${folderPath}`);
      
      // Initialize if needed
      if (!global.projectDirectories) {
        global.projectDirectories = [];
        logDebug('remove-project-directory', 'Initialized empty projectDirectories array');
        return true; // Nothing to remove
      }
      
      // Log current directories to help debug
      logDebug('remove-project-directory', `Current directories before removal (${global.projectDirectories.length}): ${global.projectDirectories.join(', ')}`);
      
      // Normalize path to handle slash differences
      const normalizedRequestedPath = path.normalize(folderPath);
      
      // Find and remove the directory from the list (using normalized paths for comparison)
      const index = global.projectDirectories.findIndex(dir => path.normalize(dir) === normalizedRequestedPath);
      
      if (index !== -1) {
        global.projectDirectories.splice(index, 1);
        logDebug('remove-project-directory', `Removed directory at index ${index}: ${folderPath}`);
        logDebug('remove-project-directory', `Remaining directories (${global.projectDirectories.length}): ${global.projectDirectories.join(', ')}`);
        
        // Clear template cache when removing a directory
        global.templateCache = {};
        logDebug('remove-project-directory', 'Template cache cleared');
        
        // If this was the current project root, reset it to the first available directory
        if (global.projectRoot === folderPath) {
          global.projectRoot = global.projectDirectories.length > 0 ? 
            global.projectDirectories[0] : null;
          logDebug('remove-project-directory', `Reset project root to: ${global.projectRoot || 'null'}`);
          
          // Note: This is important because some operations still use global.projectRoot
          // for backward compatibility, but we're moving toward using the entire 
          // projectDirectories list for template searching
        }
        
        return true;
      }
      
      logDebug('remove-project-directory', `Directory not found in list: ${folderPath}`);
      return true; // Not in list, return success anyway
    } catch (err) {
      logError('remove-project-directory', `Error removing directory: ${err}`);
      return false;
    }
  });
}

/**
 * Helper function to check read/write permissions for a directory
 */
async function checkDirPermissions(dirPath: string): Promise<{ dir: string; canRead: boolean; canWrite: boolean }> {
  const result = { dir: dirPath, canRead: false, canWrite: false };
  
  try {
    // Check if directory exists
    try {
      await fs.promises.access(dirPath, fs.constants.F_OK);
    } catch (error) {
      // Directory doesn't exist, try to create it
      try {
        await fs.promises.mkdir(dirPath, { recursive: true });
        console.log(`Created directory: ${dirPath}`);
      } catch (createError) {
        console.log(`Couldn't create directory: ${dirPath}`, createError);
        return result;
      }
    }
    
    // Check read permission
    try {
      await fs.promises.access(dirPath, fs.constants.R_OK);
      result.canRead = true;
    } catch (error) {
      console.log(`No read permission for: ${dirPath}`);
    }
    
    // Check write permission
    try {
      // Create a temp file to test write permissions
      const testFile = path.join(dirPath, `test-write-${Date.now()}.tmp`);
      await fs.promises.writeFile(testFile, 'test');
      await fs.promises.unlink(testFile);
      result.canWrite = true;
    } catch (error) {
      console.log(`No write permission for: ${dirPath}`);
    }
    
    return result;
  } catch (error) {
    console.error(`Error checking directory permissions for ${dirPath}:`, error);
    return result;
  }
}