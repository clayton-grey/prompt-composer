/**
 * @file ProjectContext.tsx
 * @description
 * Provides a centralized, in-memory "Project Manager" context for folder/file data,
 * tri-state selection, expansions, ASCII map generation, and also tracks the
 * list of "active" project folders for .prompt-composer template scanning.
 *
 * Step 2: We have refactored the logic for toggling node selection, refreshing folders,
 * adding/removing project folders, reading file/directory, etc., into a separate
 * "src/utils/projectActions.ts" module. This ensures the context remains minimal,
 * focusing on storing state and providing the final context value.
 *
 * Now, ProjectContext primarily:
 *  - Initializes React state (directoryCache, nodeStates, expandedPaths, etc.)
 *  - Delegates logic to projectActions
 *  - Exports a provider that any component can consume
 *
 * Key Responsibilities (after Step 2 refactor):
 *  - Maintain React states for directoryCache, nodeStates, expandedPaths, selectedFileContents
 *  - Provide "toggleNodeSelection", "refreshFolders", "addProjectFolder", etc. by calling
 *    the extracted projectActions
 *  - Provide a user-friendly context interface
 *
 * Known Limitations:
 *  - Very large directories can still cause performance issues; see optional Step 8 for lazy loading
 *
 * The ASCII tree generation is separate (asciiTreeGenerator.ts),
 * The token usage is computed in a separate effect (only for selected files).
 */

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { initEncoder, estimateTokens } from '../utils/tokenEstimator';
import * as projectActions from '../utils/projectActions';

export interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: TreeNode[];
}

export interface DirectoryListing {
  absolutePath: string;
  baseName: string;
  children: TreeNode[];
}

type NodeState = 'none' | 'all' | 'partial';

interface ProjectContextType {
  /**
   * Return the directory listing for a path, possibly from cache or from electron API
   */
  getDirectoryListing: (dirPath: string) => Promise<DirectoryListing | null>;

  /**
   * Tri-state map: path -> 'none' | 'all' | 'partial'
   */
  nodeStates: Record<string, NodeState>;

  /**
   * Tracking which directories are expanded
   */
  expandedPaths: Record<string, boolean>;

  /**
   * Map of file path -> file content, for all selected files
   */
  selectedFileContents: Record<string, string>;

  /**
   * Combined token usage for all selected file contents
   */
  selectedFilesTokenCount: number;

  /**
   * Cache of directory listings for each root path
   */
  directoryCache: Record<string, DirectoryListing>;

  /**
   * Toggles a node's tri-state selection (including sub-tree) and merges or removes file content
   */
  toggleNodeSelection: (node: TreeNode) => void;

  /**
   * Toggles a directory's expanded/collapsed state
   */
  toggleExpansion: (nodePath: string) => void;

  /**
   * Recursively collapses a directory subtree
   */
  collapseSubtree: (node: TreeNode) => void;

  /**
   * Returns an array of selected file entries with path, content, language guess
   */
  getSelectedFileEntries: () => Array<{ path: string; content: string; language: string }>;

  /**
   * Refreshes the folder listing for the given folder paths
   */
  refreshFolders: (folderPaths: string[]) => Promise<void>;

  /**
   * The list of user-added project folders
   */
  projectFolders: string[];

  /**
   * Adds a folder to the project
   */
  addProjectFolder: (folderPath: string) => Promise<void>;

  /**
   * Removes a folder from the project
   */
  removeProjectFolder: (folderPath: string) => void;
}

/**
 * The actual React Context
 */
const ProjectContext = createContext<ProjectContextType>({
  getDirectoryListing: async () => null,
  nodeStates: {},
  expandedPaths: {},
  selectedFileContents: {},
  selectedFilesTokenCount: 0,
  directoryCache: {},
  toggleNodeSelection: () => {},
  toggleExpansion: () => {},
  collapseSubtree: () => {},
  getSelectedFileEntries: () => [],
  refreshFolders: async () => {},
  projectFolders: [],
  addProjectFolder: async () => {},
  removeProjectFolder: () => {},
});

/**
 * Provider for the ProjectContext
 */
export const ProjectProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  // State values
  const [directoryCache, setDirectoryCache] = useState<Record<string, DirectoryListing>>({});
  const [nodeStates, setNodeStates] = useState<Record<string, NodeState>>({});
  const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>({});
  const [selectedFileContents, setSelectedFileContents] = useState<Record<string, string>>({});
  const [selectedFilesTokenCount, setSelectedFilesTokenCount] = useState<number>(0);

  const [projectFolders, setProjectFolders] = useState<string[]>([]);

  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize the token estimator
  useEffect(() => {
    initEncoder('gpt-4');
  }, []);

  // Recompute token usage for selected files
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
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
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [selectedFileContents]);

  /**
   * getDirectoryListing wrapper that calls the projectActions version
   */
  const getDirectoryListing = useCallback(
    async (dirPath: string) => {
      return projectActions.getDirectoryListing(dirPath, {
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
    },
    [directoryCache, nodeStates, expandedPaths, selectedFileContents, projectFolders]
  );

  /**
   * getSelectedFileEntries
   * Return an array of objects with path, content, guessed language
   */
  const getSelectedFileEntries = useCallback(() => {
    const results: Array<{ path: string; content: string; language: string }> = [];
    for (const [filePath, content] of Object.entries(selectedFileContents)) {
      let language = 'plaintext';
      if (filePath.endsWith('.js') || filePath.endsWith('.jsx')) language = 'javascript';
      else if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) language = 'typescript';
      else if (filePath.endsWith('.py')) language = 'python';
      else if (filePath.endsWith('.md')) language = 'markdown';
      else if (filePath.endsWith('.json')) language = 'json';
      else if (filePath.endsWith('.css')) language = 'css';
      else if (filePath.endsWith('.html')) language = 'html';

      results.push({ path: filePath, content, language });
    }
    return results;
  }, [selectedFileContents]);

  /**
   * toggleNodeSelection
   */
  const toggleNodeSelection = useCallback(
    (node: TreeNode) => {
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
    },
    [directoryCache, nodeStates, expandedPaths, selectedFileContents, projectFolders]
  );

  /**
   * toggleExpansion
   */
  const toggleExpansion = useCallback(
    (nodePath: string) => {
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
    },
    [directoryCache, nodeStates, expandedPaths, selectedFileContents, projectFolders]
  );

  /**
   * collapseSubtree
   */
  const collapseSubtree = useCallback(
    (node: TreeNode) => {
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
    },
    [directoryCache, nodeStates, expandedPaths, selectedFileContents, projectFolders]
  );

  /**
   * refreshFolders
   */
  const refreshFolders = useCallback(
    async (folderPaths: string[]) => {
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
    },
    [directoryCache, nodeStates, expandedPaths, selectedFileContents, projectFolders]
  );

  /**
   * addProjectFolder
   */
  const addProjectFolder = useCallback(
    async (folderPath: string) => {
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
    },
    [directoryCache, nodeStates, expandedPaths, selectedFileContents, projectFolders]
  );

  /**
   * removeProjectFolder
   */
  const removeProjectFolder = useCallback(
    (folderPath: string) => {
      projectActions.removeProjectFolder(folderPath, {
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
    },
    [directoryCache, nodeStates, expandedPaths, selectedFileContents, projectFolders]
  );

  /**
   * Construct the context value
   */
  const contextValue: ProjectContextType = {
    getDirectoryListing,
    nodeStates,
    expandedPaths,
    selectedFileContents,
    selectedFilesTokenCount,
    directoryCache,
    toggleNodeSelection,
    toggleExpansion,
    collapseSubtree,
    getSelectedFileEntries,
    refreshFolders,
    projectFolders,
    addProjectFolder,
    removeProjectFolder,
  };

  return <ProjectContext.Provider value={contextValue}>{children}</ProjectContext.Provider>;
};

/**
 * useProject
 * Hook to consume the ProjectContext
 */
export function useProject(): ProjectContextType {
  return useContext(ProjectContext);
}
