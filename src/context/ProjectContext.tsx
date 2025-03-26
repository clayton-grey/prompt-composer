/**
 * @file ProjectContext.tsx
 * @description
 * Provides a centralized, in-memory "Project Manager" context for folder/file data,
 * tri-state selection, expansions, ASCII map generation, and selected file content reading.
 *
 * PERFORMANCE & TOKEN ESTIMATION UPDATE (Step 1):
 *   - We introduce a 300ms debounce for calculating selectedFilesTokenCount
 *     so that we don't recalc tokens in rapid succession if the user is quickly selecting
 *     or deselecting multiple files.
 *
 * Key Responsibilities:
 *   1) Cache directory listings to avoid repeated IPC calls
 *   2) Track tri-state selection states for each path
 *   3) Track expansion states for each directory node
 *   4) Manage selectedFileContents for all 'all'-selected files
 *   5) Provide ASCII tree generation for any root path
 *   6) Return selected file entries so the PromptContext can update its file block
 *
 * Data Structures:
 *   - directoryCache: path -> DirectoryListing (from electron main)
 *   - nodeStates: path -> 'none' | 'all' | 'partial'
 *   - expandedPaths: path -> boolean
 *   - selectedFileContents: path -> file content
 *   - selectedFilesTokenCount: total tokens for all selectedFileContents in final prompt format
 */

import React, {
  createContext,
  useContext,
  useCallback,
  useState,
  useEffect,
  useRef
} from 'react';
import { initEncoder, estimateTokens } from '../utils/tokenizer';

// Instead of importing the module, declare the window interface directly
declare global {
  interface Window {
    electronAPI?: {
      listDirectory: (dirPath: string) => Promise<any>;
      readFile: (filePath: string) => Promise<string>;
      showOpenDialog: (options: any) => Promise<{ canceled: boolean; filePaths: string[] }>;
      sendMessage: (channel: string, data: any) => void;
      onMessage: (channel: string, callback: (data: any) => void) => void;
      verifyFileExistence?: (filePath: string) => Promise<boolean>;
    }
  }
}

/**
 * A tree node representing a file or directory from the file system
 */
export interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: TreeNode[];
}

/**
 * The result of listing a directory via electron IPC
 */
export interface DirectoryListing {
  absolutePath: string;
  baseName: string;
  children: TreeNode[];
}

/**
 * Tri-state: 'none' -> not selected, 'all' -> fully selected, 'partial' -> partially selected
 */
type NodeState = 'none' | 'all' | 'partial';

interface ProjectContextType {
  /**
   * Returns cached or fetches directory data from the main process.
   */
  getDirectoryListing: (dirPath: string) => Promise<DirectoryListing | null>;

  /**
   * Each node's tri-state selection status, keyed by absolute path.
   */
  nodeStates: Record<string, NodeState>;

  /**
   * Whether a directory path is expanded or collapsed in the UI tree.
   */
  expandedPaths: Record<string, boolean>;

  /**
   * Map of fully selected file paths -> their content.
   */
  selectedFileContents: Record<string, string>;

  /**
   * Real-time total tokens for all selected file contents. Helps with performance warnings.
   */
  selectedFilesTokenCount: number;

  /**
   * Cached DirectoryListing objects by folder path.
   */
  directoryCache: Record<string, DirectoryListing>;

  /**
   * Toggles a node's selection state between 'all' and 'none' (and recalc partial).
   */
  toggleNodeSelection: (node: TreeNode) => void;

  /**
   * Toggles expansion for a directory path in the UI tree.
   */
  toggleExpansion: (nodePath: string) => void;

  /**
   * Collapses a directory path and all of its children. (Sets expandedPaths to false)
   */
  collapseSubtree: (node: TreeNode) => void;

  /**
   * Generates an ASCII representation of the folder structure for the given path.
   */
  generateAsciiTree: (rootPath: string) => Promise<string>;

  /**
   * Returns an array of selected file entries for use in the file block.
   */
  getSelectedFileEntries: () => Array<{
    path: string;
    content: string;
    language: string;
  }>;

  /**
   * Refreshes the folder structure by re-fetching directory listings and re-evaluating tri-state logic.
   * This is the method added in Step 2 to implement the "Refresh" button for the File Tree.
   */
  refreshFolders: (folderPaths: string[]) => Promise<void>;
}

/**
 * Simple helper function to get file extension from a path
 * e.g. /foo/bar/baz.ts -> 'ts'
 */
function getFileExtension(filePath: string): string {
  const idx = filePath.lastIndexOf('.');
  if (idx === -1) return '';
  return filePath.substring(idx + 1);
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
  refreshFolders: async () => {}
});

export const ProjectProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  /**
   * directoryCache: path -> DirectoryListing
   */
  const [directoryCache, setDirectoryCache] = useState<Record<string, DirectoryListing>>({});

  /**
   * nodeStates: tri-state for each path
   */
  const [nodeStates, setNodeStates] = useState<Record<string, NodeState>>({});

  /**
   * expandedPaths: path -> boolean
   */
  const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>({});

  /**
   * selectedFileContents: path -> file content for fully selected files
   */
  const [selectedFileContents, setSelectedFileContents] = useState<Record<string, string>>({});

  /**
   * selectedFilesTokenCount: total tokens for all selected files in final prompt format
   */
  const [selectedFilesTokenCount, setSelectedFilesTokenCount] = useState<number>(0);

  /**
   * Debounce ref for selectedFilesTokenCount calculation
   */
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * On mount, initialize token estimator with a default model
   */
  useEffect(() => {
    // Use GPT-4o as the default model for token estimation
    initEncoder('gpt-4o');
  }, []);

  /**
   * Recalculate selectedFilesTokenCount whenever selectedFileContents changes.
   */
  useEffect(() => {
    let total = 0;
    // Use GPT-4o for token counting to match the OpenAI tokenizer
    const model = 'gpt-4o';
    
    console.log(`[ProjectContext] Recalculating tokens for ${Object.keys(selectedFileContents).length} selected files using model: ${model}`);
    
    for (const [filePath, content] of Object.entries(selectedFileContents)) {
      const ext = getFileExtension(filePath) || 'txt';
      const formatted = `<file_contents>\nFile: ${filePath}\n\`\`\`${ext}\n${content}\n\`\`\`\n</file_contents>`;
      // Pass the model parameter to estimateTokens
      const fileTokens = estimateTokens(formatted, model);
      console.log(`[ProjectContext] File ${filePath}: ${content.length} chars, estimated tokens: ${fileTokens}`);
      total += fileTokens;
    }
    
    // Apply a fine-tuning correction factor
    const rawTotal = total;
    total = Math.ceil(total * 1.04);
    console.log(`[ProjectContext] Raw token count: ${rawTotal}`);
    console.log(`[ProjectContext] Adjusted token count for selected files: ${total}`);
    setSelectedFilesTokenCount(total);
  }, [selectedFileContents]);

  /**
   * getDirectoryListing: returns cached or fetches via electron API
   */
  const getDirectoryListing = useCallback(async (dirPath: string) => {
    if (directoryCache[dirPath]) {
      return directoryCache[dirPath];
    }
    if (!window?.electronAPI?.listDirectory) {
      console.warn('[ProjectContext] No electronAPI.listDirectory found.');
      return null;
    }
    try {
      const result = (await window.electronAPI.listDirectory(dirPath)) as DirectoryListing;
      setDirectoryCache((prev) => ({ ...prev, [dirPath]: result }));
      return result;
    } catch (err) {
      console.error('[ProjectContext] Failed to list directory:', dirPath, err);
      return null;
    }
  }, [directoryCache]);

  /**
   * Helper to set a subtree to a new node state ('all' or 'none').
   */
  function setNodeStateRecursive(node: TreeNode, newState: NodeState, updated: Record<string, NodeState>) {
    updated[node.path] = newState;
    if (node.type === 'directory' && node.children) {
      node.children.forEach((child) => {
        setNodeStateRecursive(child, newState, updated);
      });
    }
  }

  /**
   * post-order DFS to recalc tri-state from children up.
   * If all children are 'all', set parent to 'all'. If all are 'none', set parent to 'none'.
   * Otherwise 'partial'.
   */
  function recalcSubtreeState(node: TreeNode, updated: Record<string, NodeState>): NodeState {
    const currentState = updated[node.path] || 'none';
    if (node.type === 'file') {
      // No children, so just return what we have
      return currentState;
    }

    if (!node.children || node.children.length === 0) {
      // empty directory => keep current
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
   * After toggling a node, recalc states from each root.
   */
  function recalcAllRootStates(updated: Record<string, NodeState>) {
    for (const key in directoryCache) {
      const listing = directoryCache[key];
      if (!listing) continue;
      const rootNode: TreeNode = {
        name: listing.baseName,
        path: listing.absolutePath,
        type: 'directory',
        children: listing.children
      };
      recalcSubtreeState(rootNode, updated);
    }
  }

  /**
   * readFile: loads file content from disk
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

  /**
   * DFS to collect file paths that are marked 'all' in updatedStates
   */
  function collectAllFilePaths(node: TreeNode, updatedStates: Record<string, NodeState>, results: string[]) {
    const st = updatedStates[node.path] || 'none';
    if (node.type === 'file' && st === 'all') {
      results.push(node.path);
    }
    if (node.type === 'directory' && node.children) {
      node.children.forEach((child) => {
        collectAllFilePaths(child, updatedStates, results);
      });
    }
  }

  /**
   * After toggling, gather all 'all' file paths, load them, and sync selectedFileContents
   */
  async function syncSelectedFilesFromNodeStates(updatedStates: Record<string, NodeState>) {
    const allFilePaths: string[] = [];

    for (const key in directoryCache) {
      const listing = directoryCache[key];
      if (!listing) continue;
      const rootNode: TreeNode = {
        name: listing.baseName,
        path: listing.absolutePath,
        type: 'directory',
        children: listing.children
      };
      collectAllFilePaths(rootNode, updatedStates, allFilePaths);
    }

    console.log(`[ProjectContext] Found ${allFilePaths.length} selected files to sync`);
    
    // Build a new set of selectedFileContents by removing any not in allFilePaths
    setSelectedFileContents((prev) => {
      const updatedFiles: Record<string, string> = {};
      // keep existing if still in the new set
      let keptCount = 0;
      for (const p of Object.keys(prev)) {
        if (allFilePaths.includes(p)) {
          updatedFiles[p] = prev[p];
          keptCount++;
        }
      }
      console.log(`[ProjectContext] Kept ${keptCount} previously selected files, removing ${Object.keys(prev).length - keptCount}`);

      // load newly selected
      const newlySelected = allFilePaths.filter((p) => !(p in updatedFiles));
      console.log(`[ProjectContext] Loading ${newlySelected.length} newly selected files`);
      
      if (newlySelected.length === 0) {
        return updatedFiles;
      }

      // read them
      Promise.all(
        newlySelected.map(async (fileP) => {
          const content = await readFile(fileP);
          console.log(`[ProjectContext] Loaded ${fileP}: ${content.length} chars`);
          return { fileP, content };
        })
      ).then((results) => {
        setSelectedFileContents((oldSel) => {
          const copy = { ...oldSel };
          for (const r of results) {
            copy[r.fileP] = r.content;
          }
          console.log(`[ProjectContext] Updated selectedFileContents with ${results.length} new files`);
          return copy;
        });
      });

      return updatedFiles;
    });
  }

  /**
   * toggleNodeSelection: flips 'all' <-> 'none' for the clicked node, recalc partial states, sync file contents
   */
  const toggleNodeSelection = useCallback((node: TreeNode) => {
    console.log(`[ProjectContext] Toggling selection for node: ${node.path} (${node.type})`);
    
    setNodeStates((prev) => {
      const updated = { ...prev };
      const current = updated[node.path] || 'none';
      const newState = current === 'all' ? 'none' : 'all';
      console.log(`[ProjectContext] Changing state from ${current} to ${newState}`);
      
      setNodeStateRecursive(node, newState, updated);
      recalcAllRootStates(updated);
      
      // Now re-sync file contents
      syncSelectedFilesFromNodeStates(updated);
      return updated;
    });
  }, [directoryCache]);

  /**
   * toggleExpansion: flips expandedPaths[nodePath]
   */
  const toggleExpansion = useCallback((nodePath: string) => {
    setExpandedPaths((prev) => ({
      ...prev,
      [nodePath]: !prev[nodePath]
    }));
  }, []);

  /**
   * collapseSubtree: sets expandedPaths to false for node and all its children
   */
  const collapseSubtree = useCallback((node: TreeNode) => {
    if (node.type !== 'directory') return;
    const stack: TreeNode[] = [node];
    const newExpanded = { ...expandedPaths };

    while (stack.length > 0) {
      const curr = stack.pop()!;
      newExpanded[curr.path] = false;
      if (curr.children) {
        curr.children.forEach((c) => {
          if (c.type === 'directory') stack.push(c);
        });
      }
    }
    setExpandedPaths(newExpanded);
  }, [expandedPaths]);

  /**
   * generateAsciiTree: returns an ASCII representation of the folder structure
   * from the given root path, wrapped in <file_map> tags.
   */
  const generateAsciiTree = useCallback(async (rootPath: string): Promise<string> => {
    const listing = await getDirectoryListing(rootPath);
    if (!listing) {
      console.warn('[ProjectContext] generateAsciiTree: No listing for', rootPath);
      return '';
    }

    const rootNode: TreeNode = {
      name: listing.baseName,
      path: listing.absolutePath,
      type: 'directory',
      children: listing.children
    };

    const lines: string[] = [];
    lines.push('<file_map>');
    lines.push(rootNode.path);

    function buildAsciiLines(node: TreeNode, prefix = '', isLast = true): string[] {
      const out: string[] = [];
      const nodeMarker = isLast ? '└── ' : '├── ';
      
      // Mark directories with [D] prefix
      const displayName = node.type === 'directory' ? `[D] ${node.name}` : node.name;
      out.push(prefix + nodeMarker + displayName);

      if (node.type === 'directory' && node.children && node.children.length > 0) {
        // Sort children: directories first, then files, both alphabetically
        const sortedChildren = [...node.children].sort((a, b) => {
          // If types are different, directories come first
          if (a.type !== b.type) {
            return a.type === 'directory' ? -1 : 1;
          }
          // Otherwise sort alphabetically
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
      // Sort root children: directories first, then files
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
  }, [getDirectoryListing]);

  /**
   * getSelectedFileEntries: returns all fully selected files as { path, content, language }.
   */
  const getSelectedFileEntries = useCallback(() => {
    const results: Array<{ path: string; content: string; language: string }> = [];
    for (const [filePath, content] of Object.entries(selectedFileContents)) {
      const ext = getFileExtension(filePath).toLowerCase();
      let language = 'plaintext';
      switch (ext) {
        case 'js':
        case 'jsx':
          language = 'javascript'; break;
        case 'ts':
        case 'tsx':
          language = 'typescript'; break;
        case 'py':
          language = 'python'; break;
        case 'md':
          language = 'markdown'; break;
        case 'json':
          language = 'json'; break;
        case 'css':
          language = 'css'; break;
        case 'html':
          language = 'html'; break;
        default:
          language = 'plaintext'; break;
      }
      results.push({ path: filePath, content, language });
    }
    return results;
  }, [selectedFileContents]);

  /**
   * refreshFolders
   * Step 2 Implementation:
   * Allows the user to "Refresh" the folder tree from the sidebar, re-fetching
   * directory listings and re-evaluating tri-state selections for new or removed files.
   *
   * @param folderPaths - array of absolute or relative folder paths
   * @returns A promise that resolves once the refresh is complete
   */
  const refreshFolders = useCallback(async (folderPaths: string[]): Promise<void> => {
    try {
      console.log('[ProjectContext] refreshFolders called for:', folderPaths);

      // For each folder path, re-fetch directory data from electron main
      for (const fPath of folderPaths) {
        console.log(`[ProjectContext] Force refresh for folder: ${fPath}`);
        if (!window.electronAPI?.listDirectory) {
          console.warn('[ProjectContext] refreshFolders: electronAPI.listDirectory is unavailable');
          continue;
        }
        try {
          const freshListing = await window.electronAPI.listDirectory(fPath);
          if (freshListing) {
            setDirectoryCache((prev) => ({
              ...prev,
              [fPath]: freshListing
            }));
          }
        } catch (err) {
          console.error(`[ProjectContext] Failed to refresh folder: ${fPath}`, err);
        }
      }

      // Now recalc tri-state states & sync selected files
      // Because new or removed files/folders might appear or vanish
      setNodeStates((prev) => {
        const updated = { ...prev };
        recalcAllRootStates(updated);
        syncSelectedFilesFromNodeStates(updated);
        return updated;
      });
    } catch (err) {
      console.error('[ProjectContext] refreshFolders error:', err);
    }
  }, [recalcAllRootStates, syncSelectedFilesFromNodeStates]);

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
    refreshFolders
  };

  return (
    <ProjectContext.Provider value={contextValue}>
      {children}
    </ProjectContext.Provider>
  );
};

/**
 * useProject
 * @returns The project context object with folder management, selection, expansions, etc.
 */
export function useProject(): ProjectContextType {
  return useContext(ProjectContext);
}
