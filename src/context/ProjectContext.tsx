/**
 * @file ProjectContext.tsx
 * @description
 * Provides a centralized, in-memory "Project Manager" context for folder/file data,
 * tri-state selection, expansions, ASCII map generation, and also tracks the list
 * of "active" project folders for .prompt-composer template scanning.
 *
 * Step 5 (Centralize & Enhance Error Handling):
 *  - We replaced direct console.error/warn calls with if-dev checks plus showToast.
 *  - This ensures the user sees a toast message for I/O errors, while dev logs remain in dev mode only.
 *  - Additional try/catch blocks were already present, but now we unify the error notifications.
 *
 * Key Responsibilities:
 *  - Maintain React states for directoryCache (DirectoryListing), nodeStates, expandedPaths, ...
 *  - Provide "toggleNodeSelection", "refreshFolders", "addProjectFolder", etc.
 *  - Provide a user-friendly context interface, with toasts on errors.
 */

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { initEncoder, estimateTokens } from '../utils/tokenEstimator';
import * as projectActions from '../utils/projectActions';
import { useToast } from './ToastContext';
import { DirectoryListing, TreeNode } from '../../electron-main/types';

export interface ProjectContextType {
  getDirectoryListing: (dirPath: string) => Promise<DirectoryListing | null>;
  nodeStates: Record<string, 'none' | 'all' | 'partial'>;
  expandedPaths: Record<string, boolean>;
  selectedFileContents: Record<string, string>;
  selectedFilesTokenCount: number;
  selectedFilesTokenCountUpdating: boolean;
  directoryCache: Record<string, DirectoryListing>;
  toggleNodeSelection: (node: TreeNode) => void;
  toggleExpansion: (nodePath: string) => void;
  collapseSubtree: (node: TreeNode) => void;
  getSelectedFileEntries: () => Array<{ path: string; content: string; language: string }>;
  refreshFolders: (folderPaths: string[]) => Promise<void>;
  projectFolders: string[];
  addProjectFolder: (folderPath: string) => Promise<void>;
  removeProjectFolder: (folderPath: string) => Promise<void>;
  refreshWithAllExtensions: (folderPath: string) => Promise<void>;
  syncSelectedFileContents: () => Promise<
    Array<{ path: string; content: string; language: string }>
  >;
}

const ProjectContext = createContext<ProjectContextType>({
  getDirectoryListing: async () => null,
  nodeStates: {},
  expandedPaths: {},
  selectedFileContents: {},
  selectedFilesTokenCount: 0,
  selectedFilesTokenCountUpdating: false,
  directoryCache: {},
  toggleNodeSelection: () => {},
  toggleExpansion: () => {},
  collapseSubtree: () => {},
  getSelectedFileEntries: () => [],
  refreshFolders: async () => {},
  projectFolders: [],
  addProjectFolder: async () => {},
  removeProjectFolder: async () => {},
  refreshWithAllExtensions: async () => {},
  syncSelectedFileContents: async () => [],
});

export const ProjectProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [directoryCache, setDirectoryCache] = useState<Record<string, DirectoryListing>>({});
  const [nodeStates, setNodeStates] = useState<Record<string, 'none' | 'all' | 'partial'>>({});
  const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>({});
  const [selectedFileContents, setSelectedFileContents] = useState<Record<string, string>>({});
  const [selectedFilesTokenCount, setSelectedFilesTokenCount] = useState<number>(0);
  const [selectedFilesTokenCountUpdating, setSelectedFilesTokenCountUpdating] =
    useState<boolean>(false);
  const [projectFolders, setProjectFolders] = useState<string[]>([]);
  const { showToast } = useToast();
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize the token estimator once
  useEffect(() => {
    initEncoder('gpt-4');
  }, []);

  // Recompute token usage for selected files with a small debounce
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    // ⚙️  start the “loading” flag immediately
    setSelectedFilesTokenCountUpdating(true);

    debounceRef.current = setTimeout(() => {
      let total = 0;
      const model = 'gpt-4';
      for (const [filePath, content] of Object.entries(selectedFileContents)) {
        let ext = 'txt';
        const extMatch = filePath.match(/\.(\w+)$/);
        if (extMatch) {
          ext = extMatch[1];
        }
        const formatted = `<file_contents>\nFile: ${filePath}\n\`\`\`${ext}\n${content}\n\`\`\`\n</file_contents>`;
        total += estimateTokens(formatted, model);
      }
      setSelectedFilesTokenCount(total);
      // ✅ done – remove the spinner
      setSelectedFilesTokenCountUpdating(false);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [selectedFileContents]);

  /**
   * getDirectoryListing
   */
  const getDirectoryListing = useCallback(
    async (dirPath: string) => {
      try {
        return await projectActions.getDirectoryListing(dirPath, {
          directoryCache,
          setDirectoryCache,
          nodeStates,
          setNodeStates,
          expandedPaths,
          setExpandedPaths,
          selectedFileContents,
          setSelectedFileContents,
          projectFolders,
          setProjectFolders,
        });
      } catch (error: unknown) {
        if (error instanceof Error) {
          showToast(`Error reading directory ${dirPath}: ${error.message}`, 'error');
          if (process.env.NODE_ENV === 'development') {
            console.error(`[ProjectContext] Error reading directory ${dirPath}:`, error.message);
          }
        } else {
          showToast(`Error reading directory ${dirPath}`, 'error');
          if (process.env.NODE_ENV === 'development') {
            console.error(`[ProjectContext] Error reading directory ${dirPath}:`, error);
          }
        }
        return null;
      }
    },
    [
      directoryCache,
      nodeStates,
      expandedPaths,
      selectedFileContents,
      projectFolders,
      showToast,
      setDirectoryCache,
      setNodeStates,
      setExpandedPaths,
      setSelectedFileContents,
      setProjectFolders,
    ]
  );

  /**
   * getSelectedFileEntries
   */
  const getSelectedFileEntries = useCallback(() => {
    // Create a fresh result array with current selectedFileContents
    const results: Array<{ path: string; content: string; language: string }> = [];

    // Also log the current state to help with debugging
    console.log(
      `[ProjectContext] getSelectedFileEntries: ${Object.keys(selectedFileContents).length} files in content map`
    );

    // IMPORTANT: Check and log if any keys have undefined or empty content
    const emptyContentPaths = Object.entries(selectedFileContents)
      .filter(([_, content]) => !content)
      .map(([path]) => path);

    if (emptyContentPaths.length > 0) {
      console.warn(
        `[ProjectContext] Found ${emptyContentPaths.length} entries with empty content:`
      );
      emptyContentPaths.forEach(path => console.warn(`  - ${path}`));
    }

    // Get the current list of paths with 'all' selection state
    const validSelectedPaths: string[] = [];
    for (const key in directoryCache) {
      const listing = directoryCache[key];
      if (!listing) continue;
      const rootNode: TreeNode = {
        name: listing.baseName,
        path: listing.absolutePath,
        type: 'directory',
        children: listing.children,
      };
      // This will collect all currently selected file paths based on node states
      projectActions.collectAllFilePaths(rootNode, nodeStates, validSelectedPaths);
    }

    // Process only the files that are actually present in selectedFileContents
    // AND are still selected according to our current node states
    for (const [filePath, content] of Object.entries(selectedFileContents)) {
      // Skip any file that isn't selected according to node states
      if (!validSelectedPaths.includes(filePath)) {
        console.log(`[ProjectContext] Skipping unselected file: ${filePath}`);
        continue;
      }

      // Skip any empty content - may indicate a file that failed to load
      if (!content) {
        console.warn(`[ProjectContext] Skipping empty content for ${filePath}`);
        continue;
      }

      // Determine the language based on file extension
      let language = 'plaintext';
      if (filePath.endsWith('.js') || filePath.endsWith('.jsx')) language = 'javascript';
      else if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) language = 'typescript';
      else if (filePath.endsWith('.py')) language = 'python';
      else if (filePath.endsWith('.md')) language = 'markdown';
      else if (filePath.endsWith('.json')) language = 'json';
      else if (filePath.endsWith('.css')) language = 'css';
      else if (filePath.endsWith('.html')) language = 'html';
      else if (filePath.endsWith('.cs')) language = 'csharp';
      else if (filePath.endsWith('.meta')) language = 'yaml';

      results.push({ path: filePath, content, language });
    }

    if (results.length !== Object.keys(selectedFileContents).length) {
      console.log(
        `[ProjectContext] Only included ${results.length} files out of ${Object.keys(selectedFileContents).length} in content map`
      );
    }

    return results;
  }, [selectedFileContents, nodeStates, directoryCache]);

  /**
   * toggleNodeSelection
   */
  const toggleNodeSelection = useCallback(
    (node: TreeNode) => {
      try {
        projectActions.toggleNodeSelection(node, {
          directoryCache,
          setDirectoryCache,
          nodeStates,
          setNodeStates,
          expandedPaths,
          setExpandedPaths,
          selectedFileContents,
          setSelectedFileContents,
          projectFolders,
          setProjectFolders,
        });
      } catch (error: unknown) {
        const pathForMsg = node.path;
        if (error instanceof Error) {
          showToast(`Error selecting node ${pathForMsg}: ${error.message}`, 'error');
          if (process.env.NODE_ENV === 'development') {
            console.error(`[ProjectContext] Error selecting node ${pathForMsg}:`, error.message);
          }
        } else {
          showToast(`Error selecting node ${pathForMsg}`, 'error');
          if (process.env.NODE_ENV === 'development') {
            console.error(`[ProjectContext] Error selecting node ${pathForMsg}:`, error);
          }
        }
      }
    },
    [
      directoryCache,
      nodeStates,
      expandedPaths,
      selectedFileContents,
      projectFolders,
      showToast,
      setDirectoryCache,
      setNodeStates,
      setExpandedPaths,
      setSelectedFileContents,
      setProjectFolders,
    ]
  );

  /**
   * toggleExpansion
   */
  const toggleExpansion = useCallback(
    (nodePath: string) => {
      try {
        projectActions.toggleExpansion(nodePath, {
          directoryCache,
          setDirectoryCache,
          nodeStates,
          setNodeStates,
          expandedPaths,
          setExpandedPaths,
          selectedFileContents,
          setSelectedFileContents,
          projectFolders,
          setProjectFolders,
        });
      } catch (error: unknown) {
        if (error instanceof Error) {
          showToast(`Error toggling expansion for ${nodePath}: ${error.message}`, 'error');
          if (process.env.NODE_ENV === 'development') {
            console.error(
              `[ProjectContext] Error toggling expansion for ${nodePath}:`,
              error.message
            );
          }
        } else {
          showToast(`Error toggling expansion for ${nodePath}`, 'error');
          if (process.env.NODE_ENV === 'development') {
            console.error(`[ProjectContext] Error toggling expansion for ${nodePath}:`, error);
          }
        }
      }
    },
    [
      directoryCache,
      nodeStates,
      expandedPaths,
      selectedFileContents,
      projectFolders,
      showToast,
      setDirectoryCache,
      setNodeStates,
      setExpandedPaths,
      setSelectedFileContents,
      setProjectFolders,
    ]
  );

  /**
   * collapseSubtree
   */
  const collapseSubtree = useCallback(
    (node: TreeNode) => {
      try {
        projectActions.collapseSubtree(node, {
          directoryCache,
          setDirectoryCache,
          nodeStates,
          setNodeStates,
          expandedPaths,
          setExpandedPaths,
          selectedFileContents,
          setSelectedFileContents,
          projectFolders,
          setProjectFolders,
        });
      } catch (error: unknown) {
        if (error instanceof Error) {
          showToast(`Error collapsing subtree for ${node.path}: ${error.message}`, 'error');
          if (process.env.NODE_ENV === 'development') {
            console.error(
              `[ProjectContext] Error collapsing subtree for ${node.path}:`,
              error.message
            );
          }
        } else {
          showToast(`Error collapsing subtree for ${node.path}`, 'error');
          if (process.env.NODE_ENV === 'development') {
            console.error(`[ProjectContext] Error collapsing subtree for ${node.path}:`, error);
          }
        }
      }
    },
    [
      directoryCache,
      nodeStates,
      expandedPaths,
      selectedFileContents,
      projectFolders,
      showToast,
      setDirectoryCache,
      setNodeStates,
      setExpandedPaths,
      setSelectedFileContents,
      setProjectFolders,
    ]
  );

  /**
   * refreshFolders
   */
  const refreshFolders = useCallback(
    async (folderPaths: string[]) => {
      try {
        await projectActions.refreshFolders(folderPaths, {
          directoryCache,
          setDirectoryCache,
          nodeStates,
          setNodeStates,
          expandedPaths,
          setExpandedPaths,
          selectedFileContents,
          setSelectedFileContents,
          projectFolders,
          setProjectFolders,
        });
      } catch (error: unknown) {
        if (error instanceof Error) {
          showToast(`Error refreshing folders: ${error.message}`, 'error');
          if (process.env.NODE_ENV === 'development') {
            console.error('[ProjectContext] Error refreshing folders:', error.message);
          }
        } else {
          showToast('Error refreshing folders', 'error');
          if (process.env.NODE_ENV === 'development') {
            console.error('[ProjectContext] Error refreshing folders:', error);
          }
        }
      }
    },
    [
      directoryCache,
      nodeStates,
      expandedPaths,
      selectedFileContents,
      projectFolders,
      showToast,
      setDirectoryCache,
      setNodeStates,
      setExpandedPaths,
      setSelectedFileContents,
      setProjectFolders,
    ]
  );

  /**
   * addProjectFolder
   */
  const addProjectFolder = useCallback(
    async (folderPath: string) => {
      try {
        await projectActions.addProjectFolder(folderPath, {
          directoryCache,
          setDirectoryCache,
          nodeStates,
          setNodeStates,
          expandedPaths,
          setExpandedPaths,
          selectedFileContents,
          setSelectedFileContents,
          projectFolders,
          setProjectFolders,
        });
      } catch (error: unknown) {
        if (error instanceof Error) {
          showToast(`Error adding project folder ${folderPath}: ${error.message}`, 'error');
          if (process.env.NODE_ENV === 'development') {
            console.error(
              `[ProjectContext] Error adding project folder ${folderPath}:`,
              error.message
            );
          }
        } else {
          showToast(`Error adding project folder ${folderPath}`, 'error');
          if (process.env.NODE_ENV === 'development') {
            console.error(`[ProjectContext] Error adding project folder ${folderPath}:`, error);
          }
        }
      }
    },
    [
      directoryCache,
      nodeStates,
      expandedPaths,
      selectedFileContents,
      projectFolders,
      showToast,
      setDirectoryCache,
      setNodeStates,
      setExpandedPaths,
      setSelectedFileContents,
      setProjectFolders,
    ]
  );

  /**
   * removeProjectFolder
   */
  const removeProjectFolder = useCallback(
    async (folderPath: string) => {
      try {
        await projectActions.removeProjectFolder(folderPath, {
          directoryCache,
          setDirectoryCache,
          nodeStates,
          setNodeStates,
          expandedPaths,
          setExpandedPaths,
          selectedFileContents,
          setSelectedFileContents,
          projectFolders,
          setProjectFolders,
        });
      } catch (error: unknown) {
        if (error instanceof Error) {
          showToast(`Error removing project folder ${folderPath}: ${error.message}`, 'error');
          if (process.env.NODE_ENV === 'development') {
            console.error(
              `[ProjectContext] Error removing project folder ${folderPath}:`,
              error.message
            );
          }
        } else {
          showToast(`Error removing project folder ${folderPath}`, 'error');
          if (process.env.NODE_ENV === 'development') {
            console.error(`[ProjectContext] Error removing project folder ${folderPath}:`, error);
          }
        }
      }
    },
    [
      directoryCache,
      nodeStates,
      expandedPaths,
      selectedFileContents,
      projectFolders,
      showToast,
      setDirectoryCache,
      setNodeStates,
      setExpandedPaths,
      setSelectedFileContents,
      setProjectFolders,
    ]
  );

  /**
   * refreshWithAllExtensions
   * Development-only debug utility to refresh a directory with all file extensions,
   * bypassing the normal extension filtering
   */
  const refreshWithAllExtensions = useCallback(
    async (folderPath: string) => {
      // Only allow this in development mode
      if (process.env.NODE_ENV !== 'development') {
        showToast('Debug function only available in development mode', 'error');
        return;
      }

      try {
        // @ts-ignore - Suppressing type checking for electronAPI access
        if (!window.electronAPI?.listDirectory) {
          showToast('Electron API not available', 'error');
          return;
        }

        // @ts-ignore - Suppressing type checking for electronAPI methods
        const result = await window.electronAPI.listDirectory(folderPath, {
          shallow: false,
          addToProjectDirectories: false,
          forceAllExtensions: true,
        });

        if (result) {
          setDirectoryCache(prev => ({
            ...prev,
            [folderPath]: result,
          }));

          showToast(`[DEBUG] Refreshed ${folderPath} with all file extensions`, 'info');

          // Log some debug info in dev mode
          const extensions = new Set<string>();
          const allFiles: string[] = [];

          const traverseForExtensions = (node: TreeNode) => {
            if (node.type === 'file') {
              allFiles.push(node.path);
              const ext = node.path.split('.').pop()?.toLowerCase();
              if (ext) extensions.add(`.${ext}`);
            }

            if (node.type === 'directory' && node.children) {
              for (const child of node.children) {
                traverseForExtensions(child);
              }
            }
          };

          for (const child of result.children) {
            traverseForExtensions(child);
          }

          console.log(
            `[DEBUG] Found ${allFiles.length} files with extensions:`,
            Array.from(extensions).sort().join(', ')
          );
        }
      } catch (err) {
        if (err instanceof Error) {
          showToast(`Error refreshing directory: ${err.message}`, 'error');
        } else {
          showToast('Unknown error refreshing directory', 'error');
        }
      }
    },
    [showToast, setDirectoryCache]
  );

  /**
   * syncSelectedFileContents
   */
  const syncSelectedFileContents = useCallback(async (): Promise<
    Array<{ path: string; content: string; language: string }>
  > => {
    try {
      console.log('[ProjectContext] Synchronizing selected file contents');

      // ‼️  simply return what projectActions gives you
      const fresh = await projectActions.syncSelectedFileContents({
        directoryCache,
        setDirectoryCache,
        nodeStates,
        setNodeStates,
        expandedPaths,
        setExpandedPaths,
        selectedFileContents,
        setSelectedFileContents,
        projectFolders,
        setProjectFolders,
      });

      console.log('[ProjectContext] Synchronization complete');
      return fresh; // <- fresh is in scope here
    } catch (error: unknown) {
      if (error instanceof Error) {
        showToast(`Error synchronizing selected file contents: ${error.message}`, 'error');
        if (process.env.NODE_ENV === 'development') {
          console.error('[ProjectContext] Error synchronizing selected file contents:', error);
        }
      } else {
        showToast('Unknown error synchronizing selected file contents', 'error');
        if (process.env.NODE_ENV === 'development') {
          console.error('[ProjectContext] Unknown error synchronizing selected file contents');
        }
      }
      return []; // satisfy the promised return type on error
    }
  }, [
    directoryCache,
    selectedFileContents,
    nodeStates,
    expandedPaths,
    projectFolders,
    setDirectoryCache,
    setNodeStates,
    setExpandedPaths,
    setSelectedFileContents,
    setProjectFolders,
    showToast,
  ]);

  const contextValue: ProjectContextType = {
    getDirectoryListing,
    nodeStates,
    expandedPaths,
    selectedFileContents,
    selectedFilesTokenCount,
    selectedFilesTokenCountUpdating,
    directoryCache,
    toggleNodeSelection,
    toggleExpansion,
    collapseSubtree,
    getSelectedFileEntries,
    refreshFolders,
    projectFolders,
    addProjectFolder,
    removeProjectFolder,
    refreshWithAllExtensions,
    syncSelectedFileContents,
  };

  return <ProjectContext.Provider value={contextValue}>{children}</ProjectContext.Provider>;
};

/**
 * useProject - a hook for consuming the ProjectContext
 */
export function useProject(): ProjectContextType {
  return useContext(ProjectContext);
}
