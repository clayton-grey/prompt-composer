
/**
 * @file ProjectContext.tsx
 * @description
 * Provides a centralized, in-memory "Project Manager" context for folder/file data,
 * tri-state selection, expansions, ASCII map generation, and now also tracks the
 * list of "active" project folders for .prompt-composer template scanning.
 *
 * Step 3 Changes:
 *  - Introduce a `projectFolders` array in context with addProjectFolder() and removeProjectFolder().
 *  - The Sidebar will call these methods instead of keeping local state. 
 *  - Other parts (like TemplateSelectorModal) can access `projectFolders` to pass to 
 *    the new `listAllTemplateFiles({ projectFolders })` call, ensuring that if a folder is
 *    removed, its templates won't appear in the "Add Template Block" pop-up.
 *
 * Implementation:
 *  1) Add `projectFolders` to state.
 *  2) Expose addProjectFolder(folderPath: string) and removeProjectFolder(folderPath: string).
 *  3) Modify refreshFolders to handle them as well if needed.
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

// Window interface for electron APIs
declare global {
  interface Window {
    electronAPI?: {
      listDirectory: (dirPath: string) => Promise<any>;
      readFile: (filePath: string) => Promise<string>;
      showOpenDialog: (options: any) => Promise<{ canceled: boolean; filePaths: string[] }>;
      sendMessage: (channel: string, data: any) => void;
      onMessage: (channel: string, callback: (data: any) => void) => void;
      verifyFileExistence?: (filePath: string) => Promise<boolean>;
      listAllTemplateFiles?: (args: { projectFolders: string[] }) => Promise<Array<{ fileName: string; source: 'global' | 'project' }>>;
    }
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
  getSelectedFileEntries: () => Array<{
    path: string;
    content: string;
    language: string;
  }>;
  refreshFolders: (folderPaths: string[]) => Promise<void>;

  /**
   * Step 3: Now we track projectFolders in this context so that the entire app can
   * know which project folders are currently active for .prompt-composer scanning.
   */
  projectFolders: string[];
  addProjectFolder: (folderPath: string) => void;
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
  addProjectFolder: () => {},
  removeProjectFolder: () => {}
});

export const ProjectProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  // Directory cache for the tri-state file tree
  const [directoryCache, setDirectoryCache] = useState<Record<string, DirectoryListing>>({});

  // Tri-state selection
  const [nodeStates, setNodeStates] = useState<Record<string, NodeState>>({});

  // Expand/collapse states
  const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>({});

  // File path => file content for all 'all'-selected files
  const [selectedFileContents, setSelectedFileContents] = useState<Record<string, string>>({});

  // Summation of tokens for all selected files
  const [selectedFilesTokenCount, setSelectedFilesTokenCount] = useState<number>(0);

  // Step 3: Track the active project folders
  const [projectFolders, setProjectFolders] = useState<string[]>([]);

  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Use GPT-4o as the default model for token estimation
    initEncoder('gpt-4o');
  }, []);

  // Recalculate selectedFilesTokenCount whenever selectedFileContents changes
  useEffect(() => {
    let total = 0;
    const model = 'gpt-4o';
    
    for (const [filePath, content] of Object.entries(selectedFileContents)) {
      const extMatch = filePath.match(/\.(\w+)$/);
      const ext = extMatch ? extMatch[1] : 'txt';
      const formatted = `<file_contents>\nFile: ${filePath}\n\`\`\`${ext}\n${content}\n\`\`\`\n</file_contents>`;
      const fileTokens = estimateTokens(formatted, model);
      total += fileTokens;
    }

    // small correction factor
    total = Math.ceil(total * 1.04);
    setSelectedFilesTokenCount(total);
  }, [selectedFileContents]);

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

  function setNodeStateRecursive(node: TreeNode, newState: NodeState, updated: Record<string, NodeState>) {
    updated[node.path] = newState;
    if (node.type === 'directory' && node.children) {
      node.children.forEach((child) => {
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

    setSelectedFileContents((prev) => {
      const updatedFiles: Record<string, string> = {};
      // keep existing if still in the new set
      for (const p of Object.keys(prev)) {
        if (allFilePaths.includes(p)) {
          updatedFiles[p] = prev[p];
        }
      }

      // load newly selected
      const newlySelected = allFilePaths.filter((p) => !(p in updatedFiles));
      if (newlySelected.length === 0) {
        return updatedFiles;
      }

      Promise.all(
        newlySelected.map(async (fileP) => {
          const content = await readFile(fileP);
          return { fileP, content };
        })
      ).then((results) => {
        setSelectedFileContents((oldSel) => {
          const copy = { ...oldSel };
          for (const r of results) {
            copy[r.fileP] = r.content;
          }
          return copy;
        });
      });

      return updatedFiles;
    });
  }

  const toggleNodeSelection = useCallback((node: TreeNode) => {
    setNodeStates((prev) => {
      const updated = { ...prev };
      const current = updated[node.path] || 'none';
      const newState = current === 'all' ? 'none' : 'all';

      setNodeStateRecursive(node, newState, updated);
      recalcAllRootStates(updated);
      syncSelectedFilesFromNodeStates(updated);

      return updated;
    });
  }, [directoryCache]);

  const toggleExpansion = useCallback((nodePath: string) => {
    setExpandedPaths((prev) => ({
      ...prev,
      [nodePath]: !prev[nodePath]
    }));
  }, []);

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
  }, [getDirectoryListing]);

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

  const refreshFolders = useCallback(async (folderPaths: string[]): Promise<void> => {
    try {
      for (const fPath of folderPaths) {
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

  /**
   * Step 3: Add / remove active project folders. 
   * If we add a folder, we store it if not already present.
   * If we remove a folder, we remove it from the array. 
   * This array is used by TemplateSelectorModal to fetch .prompt-composer files.
   */
  const addProjectFolder = useCallback((folderPath: string) => {
    setProjectFolders((prev) => {
      if (!prev.includes(folderPath)) {
        return [...prev, folderPath];
      }
      return prev;
    });
  }, []);

  const removeProjectFolder = useCallback((folderPath: string) => {
    setProjectFolders((prev) => prev.filter((p) => p !== folderPath));
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
    removeProjectFolder
  };

  return (
    <ProjectContext.Provider value={contextValue}>
      {children}
    </ProjectContext.Provider>
  );
};

export function useProject(): ProjectContextType {
  return useContext(ProjectContext);
}

