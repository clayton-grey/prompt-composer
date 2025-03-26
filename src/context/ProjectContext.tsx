
/**
 * @file ProjectContext.tsx
 * @description
 * Provides a centralized, in-memory cache for directory listing data so that
 * components like FileTree.tsx and FileMapViewer.tsx do not redundantly call
 * the Electron IPC 'listDirectory' for the same path multiple times. 
 * 
 * This addresses Step 3 in the "File & Directory Handling" optimization plan.
 *
 * Key Responsibilities:
 *  1) Maintain a cache of directory data (indexed by directory path).
 *  2) Expose a function getDirectoryListing(dirPath) that returns the 
 *     cached data if available, or calls Electron to fetch if not cached.
 *  3) Optionally handle errors (we return null on failure, allowing 
 *     the calling component to decide how to handle).
 * 
 * Usage:
 *  1) Wrap the top-level app with <ProjectProvider>.
 *  2) In any component needing directory data, call:
 *       const { getDirectoryListing } = useProject();
 *       const data = await getDirectoryListing(somePath);
 *     Data is returned with shape { absolutePath, baseName, children: TreeNode[] }.
 *
 * Implementation Notes:
 *  - We do not store expansions or selection states here (FileTree local state 
 *    handles expansions, PromptContext handles file selection). This context 
 *    simply prevents repeated disk scanning calls for the same folder.
 *  - If needed, users can forcibly refresh data by ignoring the cache or 
 *    clearing the cache. Currently, we do not expose a forced refresh method. 
 *  - If the same path is requested simultaneously (i.e., concurrency), 
 *    we store data once loaded. No advanced race handling is performed.
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback
} from 'react';

/**
 * TreeNode represents a single file or directory item in the structure.
 */
export interface TreeNode {
  /**
   * The name (filename or folder name) of this node.
   */
  name: string;

  /**
   * The absolute path to this node on disk.
   */
  path: string;

  /**
   * Whether this node is a 'file' or 'directory'.
   */
  type: 'file' | 'directory';

  /**
   * If it's a directory, children will contain nested TreeNodes.
   * If it's a file, this may be undefined.
   */
  children?: TreeNode[];
}

/**
 * DirectoryListing is returned by the electronIPC 'list-directory' call:
 *  - absolutePath: The absolute path of the folder scanned
 *  - baseName:     The final folder name of that path
 *  - children:     An array of TreeNode objects representing the files/folders
 */
export interface DirectoryListing {
  absolutePath: string;
  baseName: string;
  children: TreeNode[];
}

/**
 * ProjectContextType defines the methods and data we expose via context.
 */
interface ProjectContextType {
  /**
   * Retrieves a DirectoryListing for dirPath, using the cache if available.
   * @param dirPath - The directory path to list
   * @returns The DirectoryListing object, or null if the call fails
   */
  getDirectoryListing: (dirPath: string) => Promise<DirectoryListing | null>;
}

/**
 * Create a default context with a dummy implementation that always returns null.
 */
const ProjectContext = createContext<ProjectContextType>({
  getDirectoryListing: async () => null
});

/**
 * ProjectProvider is a React component that wraps children and provides
 * the ProjectContext data. We store a dictionary of { [dirPath]: DirectoryListing }
 * to cache repeated calls. If getDirectoryListing is requested for a path
 * not in cache, we call electronAPI.listDirectory and store the result.
 */
export const ProjectProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  /**
   * directoryCache is keyed by the directory path string. Each value is the 
   * DirectoryListing returned from electronIPC or previously cached.
   */
  const [directoryCache, setDirectoryCache] = useState<Record<string, DirectoryListing>>({});

  /**
   * getDirectoryListing checks our cache for existing data. If not found,
   * it calls window.electronAPI.listDirectory, updates the cache, and returns 
   * the data. If the call fails, we return null.
   */
  const getDirectoryListing = useCallback(async (dirPath: string): Promise<DirectoryListing | null> => {
    // 1) Check cache
    if (directoryCache[dirPath]) {
      return directoryCache[dirPath];
    }

    // 2) No cached data => retrieve from Electron
    if (!window.electronAPI?.listDirectory) {
      console.warn('[ProjectContext] Missing electronAPI.listDirectory. Returning null.');
      return null;
    }

    try {
      const result = (await window.electronAPI.listDirectory(dirPath)) as DirectoryListing;
      // 3) Store in cache
      setDirectoryCache((prev) => ({
        ...prev,
        [dirPath]: result
      }));
      return result;
    } catch (err) {
      console.error('[ProjectContext] Failed to list directory for path:', dirPath, err);
      return null;
    }
  }, [directoryCache]);

  return (
    <ProjectContext.Provider value={{ getDirectoryListing }}>
      {children}
    </ProjectContext.Provider>
  );
};

/**
 * useProject is a convenience hook for accessing the ProjectContext
 * anywhere in the application.
 */
export function useProject(): ProjectContextType {
  return useContext(ProjectContext);
}
