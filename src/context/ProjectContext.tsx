/**
 * @file ProjectContext.tsx
 * @description
 * Provides a centralized, in-memory "Project Manager" context for folder/file data,
 * tri-state selection, expansions, ASCII map generation, and also tracks the
 * list of "active" project folders for .prompt-composer template scanning.
 *
 * After unifying TreeNode and DirectoryListing in electron-main/types.ts, we remove
 * the local definitions and import them directly.
 *
 * Key Responsibilities:
 *  - Maintain React states for directoryCache (DirectoryListing), nodeStates, expandedPaths, selectedFileContents
 *  - Provide "toggleNodeSelection", "refreshFolders", "addProjectFolder", etc. by calling projectActions
 *  - Provide a user-friendly context interface
 */

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { initEncoder, estimateTokens } from '../utils/tokenEstimator';
import * as projectActions from '../utils/projectActions';
import { useToast } from './ToastContext';
import { DirectoryListing, TreeNode } from '../../electron-main/types';

export interface ProjectContextType {
  /**
   * Return the directory listing for a path, possibly from cache or from electron API
   */
  getDirectoryListing: (dirPath: string) => Promise<DirectoryListing | null>;

  /**
   * Tri-state map: path -> 'none' | 'all' | 'partial'
   */
  nodeStates: Record<string, 'none' | 'all' | 'partial'>;

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

export const ProjectProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [directoryCache, setDirectoryCache] = useState<Record<string, DirectoryListing>>({});
  const [nodeStates, setNodeStates] = useState<Record<string, 'none' | 'all' | 'partial'>>({});
  const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>({});
  const [selectedFileContents, setSelectedFileContents] = useState<Record<string, string>>({});
  const [selectedFilesTokenCount, setSelectedFilesTokenCount] = useState<number>(0);
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
   * getDirectoryListing - calls into projectActions.getDirectoryListing
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
      } catch (error) {
        showToast(`Error reading directory ${dirPath}: ${(error as Error).message}`, 'error');
        console.error(`Error reading directory ${dirPath}:`, error);
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
   * getSelectedFileEntries - return array of { path, content, language }
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
      } catch (error) {
        showToast(`Error selecting node ${node.path}: ${(error as Error).message}`, 'error');
        console.error(`Error selecting node ${node.path}:`, error);
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
      } catch (error) {
        showToast(`Error toggling expansion for ${nodePath}: ${(error as Error).message}`, 'error');
        console.error(`Error toggling expansion for ${nodePath}:`, error);
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
      } catch (error) {
        showToast(
          `Error collapsing subtree for ${node.path}: ${(error as Error).message}`,
          'error'
        );
        console.error(`Error collapsing subtree for ${node.path}:`, error);
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
      } catch (error) {
        showToast(`Error refreshing folders: ${(error as Error).message}`, 'error');
        console.error('Error refreshing folders:', error);
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
      } catch (error) {
        showToast(
          `Error adding project folder ${folderPath}: ${(error as Error).message}`,
          'error'
        );
        console.error(`Error adding project folder ${folderPath}:`, error);
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
    (folderPath: string) => {
      try {
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
      } catch (error) {
        showToast(
          `Error removing project folder ${folderPath}: ${(error as Error).message}`,
          'error'
        );
        console.error(`Error removing project folder ${folderPath}:`, error);
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
 * useProject - a hook for consuming the ProjectContext
 */
export function useProject(): ProjectContextType {
  return useContext(ProjectContext);
}
