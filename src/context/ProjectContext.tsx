/**
 * @file ProjectContext.tsx
 * @description
 * Provides a centralized, in-memory "Project Manager" context for folder/file data,
 * tri-state selection, expansions, ASCII map generation, and also tracks the
 * list of "active" project folders for .prompt-composer template scanning.
 *
 * FINAL Fix to ensure immediate token usage on folder add:
 *  - After marking root node as "all", we directly gather all files from that node,
 *    read them, and set `selectedFileContents` in one step. No waiting on multiple
 *    asynchronous setState calls. This ensures the usage is updated before the user sees 0.
 */

import React, { createContext, useContext, useCallback, useState, useEffect, useRef } from 'react';
import { initEncoder, estimateTokens } from '../utils/tokenEstimator';

declare global {
  interface Window {
    electronAPI?: {
      listDirectory: (dirPath: string) => Promise<any>;
      readFile: (filePath: string) => Promise<string>;
      showOpenDialog: (options: any) => Promise<{ canceled: boolean; filePaths: string[] }>;
      sendMessage: (channel: string, data: any) => void;
      onMessage: (channel: string, callback: (data: any) => void) => void;
      verifyFileExistence?: (filePath: string) => Promise<boolean>;
      listAllTemplateFiles?: (args: {
        projectFolders: string[];
      }) => Promise<Array<{ fileName: string; source: 'global' | 'project' }>>;
    };
  }
}

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
  getDirectoryListing: (dirPath: string) => Promise<DirectoryListing | null>;
  nodeStates: Record<string, NodeState>;
  expandedPaths: Record<string, boolean>;
  selectedFileContents: Record<string, string>;
  selectedFilesTokenCount: number;
  directoryCache: Record<string, DirectoryListing>;
  toggleNodeSelection: (node: TreeNode) => void;
  toggleExpansion: (nodePath: string) => void;
  collapseSubtree: (node: TreeNode) => void;
  generateAsciiTree: (rootPath: string) => Promise<string>;
  getSelectedFileEntries: () => Array<{ path: string; content: string; language: string }>;
  refreshFolders: (folderPaths: string[]) => Promise<void>;

  projectFolders: string[];
  addProjectFolder: (folderPath: string) => Promise<void>;
  removeProjectFolder: (folderPath: string) => void;
}

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
  generateAsciiTree: async () => '',
  getSelectedFileEntries: () => [],
  refreshFolders: async () => {},
  projectFolders: [],
  addProjectFolder: async () => {},
  removeProjectFolder: () => {},
});

export const ProjectProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [directoryCache, setDirectoryCache] = useState<Record<string, DirectoryListing>>({});
  const [nodeStates, setNodeStates] = useState<Record<string, NodeState>>({});
  const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>({});
  const [selectedFileContents, setSelectedFileContents] = useState<Record<string, string>>({});
  const [selectedFilesTokenCount, setSelectedFilesTokenCount] = useState<number>(0);

  const [projectFolders, setProjectFolders] = useState<string[]>([]);

  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    initEncoder('gpt-4');
  }, []);

  /**
   * Recompute token usage for selected files
   * No artificial multiplier is used.
   */
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
   * getDirectoryListing
   * Cache results in directoryCache to avoid repeated lookups.
   */
  const getDirectoryListing = useCallback(
    async (dirPath: string) => {
      if (directoryCache[dirPath]) {
        return directoryCache[dirPath];
      }
      if (!window?.electronAPI?.listDirectory) {
        console.warn('[ProjectContext] No electronAPI.listDirectory found.');
        return null;
      }
      try {
        const result = await window.electronAPI.listDirectory(dirPath);
        setDirectoryCache(prev => ({ ...prev, [dirPath]: result }));
        return result;
      } catch (err) {
        console.error('[ProjectContext] Failed to list directory:', dirPath, err);
        return null;
      }
    },
    [directoryCache]
  );

  function setNodeStateRecursive(
    node: TreeNode,
    newState: NodeState,
    updated: Record<string, NodeState>
  ) {
    updated[node.path] = newState;
    if (node.type === 'directory' && node.children) {
      node.children.forEach(child => {
        setNodeStateRecursive(child, newState, updated);
      });
    }
  }

  function recalcSubtreeState(node: TreeNode, updated: Record<string, NodeState>): NodeState {
    const currentState = updated[node.path] || 'none';
    if (node.type === 'file') {
      return currentState;
    }
    if (!node.children || node.children.length === 0) {
      return currentState;
    }

    let childAllCount = 0;
    let childNoneCount = 0;
    const totalChildren = node.children.length;
    for (const child of node.children) {
      const childState = recalcSubtreeState(child, updated);
      if (childState === 'all') childAllCount++;
      if (childState === 'none') childNoneCount++;
    }

    if (childAllCount === totalChildren) {
      updated[node.path] = 'all';
    } else if (childNoneCount === totalChildren) {
      updated[node.path] = 'none';
    } else {
      updated[node.path] = 'partial';
    }

    return updated[node.path];
  }

  /**
   * readFile from disk, using electronAPI if available.
   */
  async function readFile(filePath: string): Promise<string> {
    if (!window?.electronAPI?.readFile) {
      console.warn('[ProjectContext] readFile: no electronAPI.readFile found');
      return '';
    }
    try {
      const content = await window.electronAPI.readFile(filePath);
      return content;
    } catch (err) {
      console.error('[ProjectContext] readFile error for', filePath, err);
      return '';
    }
  }

  function collectAllFilePaths(
    node: TreeNode,
    updatedStates: Record<string, NodeState>,
    results: string[]
  ) {
    const st = updatedStates[node.path] || 'none';
    if (node.type === 'file' && st === 'all') {
      results.push(node.path);
    }
    if (node.type === 'directory' && node.children) {
      node.children.forEach(child => {
        collectAllFilePaths(child, updatedStates, results);
      });
    }
  }

  /**
   * toggleNodeSelection
   * Standard tri-state toggling for the user interactions.
   * This uses the older approach of an async function that sets state,
   * then calls sync. For initial folder adds, we'll skip this approach
   * in favor of a direct approach in addProjectFolder.
   */
  const toggleNodeSelection = useCallback(
    (node: TreeNode) => {
      setNodeStates(prev => {
        const updated = { ...prev };
        const current = updated[node.path] || 'none';
        const newState = current === 'all' ? 'none' : 'all';

        setNodeStateRecursive(node, newState, updated);
        recalcAllRootStates(updated);

        // We read new files in a separate async step
        (async function runSync() {
          const allFilePaths: string[] = [];
          for (const key in directoryCache) {
            const listing = directoryCache[key];
            if (!listing) continue;
            const rootNode: TreeNode = {
              name: listing.baseName,
              path: listing.absolutePath,
              type: 'directory',
              children: listing.children,
            };
            collectAllFilePaths(rootNode, updated, allFilePaths);
          }
          // Merge newly selected files
          setSelectedFileContents(prevFiles => {
            const result = { ...prevFiles };
            // Remove unselected
            for (const p of Object.keys(result)) {
              if (!allFilePaths.includes(p)) {
                delete result[p];
              }
            }
            // Add newly selected
            const newlySelected = allFilePaths.filter(p => !(p in result));
            if (newlySelected.length === 0) {
              return result;
            }
            // We'll load them now
            newlySelected.forEach(async fileP => {
              const content = await readFile(fileP);
              // Update content in setState
              setSelectedFileContents(oldSel => ({
                ...oldSel,
                [fileP]: content,
              }));
            });
            return result;
          });
        })();

        return updated;
      });
    },
    [directoryCache]
  );

  function recalcAllRootStates(updated: Record<string, NodeState>) {
    for (const key in directoryCache) {
      const listing = directoryCache[key];
      if (!listing) continue;
      const rootNode: TreeNode = {
        name: listing.baseName,
        path: listing.absolutePath,
        type: 'directory',
        children: listing.children,
      };
      recalcSubtreeState(rootNode, updated);
    }
  }

  const toggleExpansion = useCallback((nodePath: string) => {
    setExpandedPaths(prev => ({
      ...prev,
      [nodePath]: !prev[nodePath],
    }));
  }, []);

  const collapseSubtree = useCallback(
    (node: TreeNode) => {
      if (node.type !== 'directory') return;
      const stack: TreeNode[] = [node];
      const newExpanded = { ...expandedPaths };

      while (stack.length > 0) {
        const curr = stack.pop()!;
        newExpanded[curr.path] = false;
        if (curr.children) {
          curr.children.forEach(c => {
            if (c.type === 'directory') stack.push(c);
          });
        }
      }
      setExpandedPaths(newExpanded);
    },
    [expandedPaths]
  );

  /**
   * generateAsciiTree
   * For a root folder, build an ASCII map of the entire subtree.
   */
  const generateAsciiTree = useCallback(
    async (rootPath: string): Promise<string> => {
      const listing = await getDirectoryListing(rootPath);
      if (!listing) {
        console.warn('[ProjectContext] generateAsciiTree: No listing for', rootPath);
        return '';
      }
      const rootNode: TreeNode = {
        name: listing.baseName,
        path: listing.absolutePath,
        type: 'directory',
        children: listing.children,
      };

      const lines: string[] = [];
      lines.push('<file_map>');
      lines.push(rootNode.path);

      function buildAsciiLines(node: TreeNode, prefix = '', isLast = true): string[] {
        const out: string[] = [];
        const nodeMarker = isLast ? '└── ' : '├── ';
        const displayName = node.type === 'directory' ? `[D] ${node.name}` : node.name;
        out.push(prefix + nodeMarker + displayName);

        if (node.type === 'directory' && node.children && node.children.length > 0) {
          const sortedChildren = [...node.children].sort((a, b) => {
            if (a.type !== b.type) {
              return a.type === 'directory' ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
          });

          const childPrefix = prefix + (isLast ? '    ' : '│   ');
          sortedChildren.forEach((child, idx) => {
            const childIsLast = idx === sortedChildren.length - 1;
            out.push(...buildAsciiLines(child, childPrefix, childIsLast));
          });
        }
        return out;
      }

      if (rootNode.children && rootNode.children.length > 0) {
        const sortedRootChildren = [...rootNode.children].sort((a, b) => {
          if (a.type !== b.type) {
            return a.type === 'directory' ? -1 : 1;
          }
          return a.name.localeCompare(b.name);
        });

        sortedRootChildren.forEach((child, idx) => {
          const isLast = idx === sortedRootChildren.length - 1;
          lines.push(...buildAsciiLines(child, '', isLast));
        });
      }

      lines.push('</file_map>');
      return lines.join('\n');
    },
    [getDirectoryListing]
  );

  /**
   * getSelectedFileEntries
   * Returns the array of file paths & content for 'all' selected files.
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
   * refreshFolders
   * For each folder path, we re-fetch listing, recalc states, remove unselected files, etc.
   */
  const refreshFolders = useCallback(
    async (folderPaths: string[]): Promise<void> => {
      try {
        for (const fPath of folderPaths) {
          if (!window.electronAPI?.listDirectory) {
            console.warn(
              '[ProjectContext] refreshFolders: electronAPI.listDirectory is unavailable'
            );
            continue;
          }
          try {
            const freshListing = await window.electronAPI.listDirectory(fPath);
            if (freshListing) {
              setDirectoryCache(prev => ({
                ...prev,
                [fPath]: freshListing,
              }));
            }
          } catch (err) {
            console.error(`[ProjectContext] Failed to refresh folder: ${fPath}`, err);
          }
        }

        setNodeStates(prev => {
          const updated = { ...prev };
          recalcAllRootStates(updated);
          // We do not forcibly wait for the entire file read cycle for normal refresh
          // This is only used for manual refresh or existing folder
          (async function runSync() {
            const allFilePaths: string[] = [];
            for (const key in directoryCache) {
              const listing = directoryCache[key];
              if (!listing) continue;
              const rootNode: TreeNode = {
                name: listing.baseName,
                path: listing.absolutePath,
                type: 'directory',
                children: listing.children,
              };
              collectAllFilePaths(rootNode, updated, allFilePaths);
            }

            setSelectedFileContents(prevFiles => {
              const result = { ...prevFiles };
              // remove unselected
              for (const p of Object.keys(result)) {
                if (!allFilePaths.includes(p)) {
                  delete result[p];
                }
              }
              // add newly selected
              const newlySelected = allFilePaths.filter(p => !(p in result));
              newlySelected.forEach(async fileP => {
                const content = await readFile(fileP);
                setSelectedFileContents(oldSel => ({
                  ...oldSel,
                  [fileP]: content,
                }));
              });
              return result;
            });
          })();

          return updated;
        });
      } catch (err) {
        console.error('[ProjectContext] refreshFolders error:', err);
      }
    },
    [directoryCache]
  );

  /**
   * addProjectFolder
   * After we load the listing, we set the entire root node to 'all',
   * then gather all files under it, read them, set selectedFileContents in one step.
   * This ensures immediate token usage.
   */
  const addProjectFolder = useCallback(
    async (folderPath: string) => {
      setProjectFolders(prev => {
        if (!prev.includes(folderPath)) {
          return [...prev, folderPath];
        }
        return prev;
      });

      // Refresh the folder listing so we have it in directoryCache
      await refreshFolders([folderPath]);

      // Wait for directory listing
      let listing = directoryCache[folderPath];
      if (!listing) {
        listing = await getDirectoryListing(folderPath);
      }
      if (!listing) {
        console.warn(
          '[ProjectContext] addProjectFolder: listing not found after refresh',
          folderPath
        );
        return;
      }

      // Expand it
      setExpandedPaths(prev => ({
        ...prev,
        [listing.absolutePath]: true,
      }));

      // 1) Mark the entire folder as 'all'
      const updatedStates = { ...nodeStates };
      const rootNode: TreeNode = {
        name: listing.baseName,
        path: listing.absolutePath,
        type: 'directory',
        children: listing.children,
      };
      setNodeStateRecursive(rootNode, 'all', updatedStates);
      recalcAllRootStates(updatedStates);
      setNodeStates(updatedStates);

      // 2) Gather all files under it
      const allFilePaths: string[] = [];
      collectAllFilePaths(rootNode, updatedStates, allFilePaths);

      // 3) Read them all
      const newFileMap: Record<string, string> = { ...selectedFileContents };
      // Remove any that are no longer in allFilePaths
      for (const pathKey of Object.keys(newFileMap)) {
        if (!allFilePaths.includes(pathKey)) {
          delete newFileMap[pathKey];
        }
      }

      // Load newly selected
      const newlySelected = allFilePaths.filter(p => !(p in newFileMap));
      for (const fileP of newlySelected) {
        const content = await readFile(fileP);
        newFileMap[fileP] = content;
      }

      // 4) Set them in one step => triggers token usage calculation
      setSelectedFileContents(newFileMap);
    },
    [directoryCache, refreshFolders, getDirectoryListing, nodeStates, selectedFileContents]
  );

  /**
   * removeProjectFolder
   * Removes from projectFolders.
   * (Potentially unselect or clear states. We'll skip for now.)
   */
  const removeProjectFolder = useCallback((folderPath: string) => {
    setProjectFolders(prev => prev.filter(p => p !== folderPath));
  }, []);

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
    generateAsciiTree,
    getSelectedFileEntries,
    refreshFolders,
    projectFolders,
    addProjectFolder,
    removeProjectFolder,
  };

  return <ProjectContext.Provider value={contextValue}>{children}</ProjectContext.Provider>;
};

export function useProject(): ProjectContextType {
  return useContext(ProjectContext);
}
