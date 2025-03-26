
/**
 * @file ProjectContext.tsx
 * @description
 * Provides a centralized, in-memory "Project Manager" context for folder/file data, 
 * tri-state selection, expansions, ASCII map generation, and selected file content reading. 
 *
 * Key Responsibilities:
 *  1) Cache directory listings to avoid multiple IPC calls
 *  2) Track tri-state selection states for each file/directory node
 *  3) Track expansion states for each directory node
 *  4) Store the selected file contents in memory (path -> content)
 *  5) Provide a method to compute or retrieve an ASCII tree representation
 *  6) Provide a "selectedFilesTokenCount" to show how many tokens the selected files collectively use
 *
 * Usage:
 *   1) Wrap the entire application with <ProjectProvider>.
 *   2) Any component can call `const { ... } = useProject();` to access or modify the shared state.
 * 
 * Implementation Details:
 *  - We unify the tri-state logic that was previously in FileTree.tsx (nodeStates, expansions, selection).
 *  - We unify the ASCII map logic that was previously in FileMapViewer.tsx.
 *  - We unify the file content reading and selectedFileContents logic.
 *  - Instead of Node's 'path' module, we use a custom getFileExtension() function for browser environments.
 */

import React, {
  createContext,
  useContext,
  useCallback,
  useState,
  useEffect
} from 'react';
import { initEncoder, estimateTokens } from '../utils/tokenizer';

/**
 * A directory or file node from the 'list-directory' IPC call.
 */
export interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: TreeNode[];
}

/**
 * The result of listing a directory from electronAPI, providing a baseName,
 * absolutePath, and children representing the sub-tree.
 */
export interface DirectoryListing {
  absolutePath: string;
  baseName: string;
  children: TreeNode[];
}

/**
 * Tri-state selection for a node: 'none', 'all', or 'partial'.
 */
type NodeState = 'none' | 'all' | 'partial';

interface ProjectContextType {
  /**
   * Retrieves a cached directory listing for dirPath, or loads it via Electron 
   * if not cached. 
   */
  getDirectoryListing: (dirPath: string) => Promise<DirectoryListing | null>;

  /**
   * nodeStates: a map from node.path -> 'none' | 'all' | 'partial'
   */
  nodeStates: Record<string, NodeState>;

  /**
   * expandedPaths: a map from node.path -> boolean
   */
  expandedPaths: Record<string, boolean>;

  /**
   * selectedFileContents: path -> file content for nodes that are fully selected.
   */
  selectedFileContents: Record<string, string>;

  /**
   * The total token count for all selected file contents. 
   */
  selectedFilesTokenCount: number;

  /**
   * In-memory cache for directory data.
   */
  directoryCache: Record<string, DirectoryListing>;

  /**
   * Toggle a node's tri-state selection. If it's 'all' => 'none', else => 'all'.
   */
  toggleNodeSelection: (node: TreeNode) => void;

  /**
   * Toggle expansion for a directory node.
   */
  toggleExpansion: (nodePath: string) => void;

  /**
   * Collapse entire subtree under a node.
   */
  collapseSubtree: (node: TreeNode) => void;

  /**
   * Generate ASCII map for a given directory root path.
   */
  generateAsciiTree: (rootPath: string) => Promise<string>;

  /**
   * Return an array of fully selected file nodes as { path, content, language }
   * for usage in a FileBlock, if desired.
   */
  getSelectedFileEntries: () => Array<{
    path: string;
    content: string;
    language: string;
  }>;
}

/**
 * Custom helper to extract a file extension from a path in the browser environment.
 * e.g., "/foo/bar/baz.ts" => "ts"
 * e.g., "/foo/bar/readme" => ""
 */
function getFileExtension(filePath: string): string {
  const lastDot = filePath.lastIndexOf('.');
  if (lastDot === -1) {
    return ''; // no extension
  }
  return filePath.substring(lastDot + 1);
}

/**
 * Default context object with no-op implementations.
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
  generateAsciiTree: async () => '',
  getSelectedFileEntries: () => []
});

export const ProjectProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  /**
   * directoryCache: stores the result of listing a directory so we don't re-fetch.
   */
  const [directoryCache, setDirectoryCache] = useState<Record<string, DirectoryListing>>({});

  /**
   * nodeStates: track tri-state selection for each path
   */
  const [nodeStates, setNodeStates] = useState<Record<string, NodeState>>({});

  /**
   * expandedPaths: track whether a directory node is expanded in the UI
   */
  const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>({});

  /**
   * selectedFileContents: store the content of selected (fully 'all') file nodes
   */
  const [selectedFileContents, setSelectedFileContents] = useState<Record<string, string>>({});

  /**
   * selectedFilesTokenCount: number of tokens for the combined selectedFileContents
   */
  const [selectedFilesTokenCount, setSelectedFilesTokenCount] = useState<number>(0);

  /**
   * On mount, init the simple word-based token estimator (the real one can be used if available).
   */
  useEffect(() => {
    initEncoder('gpt-3.5-turbo');
  }, []);

  /**
   * Recalculate selectedFilesTokenCount whenever selectedFileContents changes.
   */
  useEffect(() => {
    let total = 0;
    for (const [filePath, content] of Object.entries(selectedFileContents)) {
      // Instead of path.extname, we now do a custom extension extraction
      const ext = getFileExtension(filePath) || 'txt';
      const formatted = `<file_contents>\nFile: ${filePath}\n\`\`\`${ext}\n${content}\n\`\`\`\n</file_contents>`;
      total += estimateTokens(formatted);
    }
    setSelectedFilesTokenCount(total);
  }, [selectedFileContents]);

  /**
   * getDirectoryListing
   * Retrieves from cache or fetches via electronAPI. 
   */
  const getDirectoryListing = useCallback(async (dirPath: string): Promise<DirectoryListing | null> => {
    if (directoryCache[dirPath]) {
      return directoryCache[dirPath];
    }
    if (!window.electronAPI?.listDirectory) {
      console.warn('[ProjectContext] No electronAPI.listDirectory. Returning null.');
      return null;
    }
    try {
      const result = (await window.electronAPI.listDirectory(dirPath)) as DirectoryListing;
      setDirectoryCache((prev) => ({ ...prev, [dirPath]: result }));
      return result;
    } catch (err) {
      console.error('[ProjectContext] Failed to list directory for path:', dirPath, err);
      return null;
    }
  }, [directoryCache]);

  /**
   * Helper to set the entire subtree of a node to a specific newState ('all' or 'none').
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
   */
  function recalcSubtreeState(node: TreeNode, updated: Record<string, NodeState>): NodeState {
    const currentState = updated[node.path] || 'none';
    if (node.type === 'file') {
      // no child to recalc
      return currentState;
    }

    if (!node.children || node.children.length === 0) {
      // empty directory => keep whatever is set, typically 'none'
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
   * After toggling a node or subtree, we do a pass from the root(s) to fix partial states. 
   * Because the user may have multiple root folders, we do this for each root node in directoryCache.
   */
  function recalcAllRootStates(updated: Record<string, NodeState>) {
    for (const key in directoryCache) {
      const rootListing = directoryCache[key];
      if (!rootListing) continue;
      // build a root node from the listing
      const rootNode: TreeNode = {
        name: rootListing.baseName,
        path: rootListing.absolutePath,
        type: 'directory',
        children: rootListing.children
      };
      recalcSubtreeState(rootNode, updated);
    }
  }

  /**
   * readFile: loads file content from disk via electronAPI.readFile
   */
  async function readFile(filePath: string): Promise<string> {
    if (!window.electronAPI?.readFile) {
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
   * DFS to collect file paths whose nodeState is 'all'.
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
   * After toggling a node or subtree, we gather all file paths that are 'all' 
   * and load/unload them in selectedFileContents accordingly.
   */
  async function syncSelectedFilesFromNodeStates(updatedStates: Record<string, NodeState>) {
    // We'll gather final set of 'all' file paths
    const filePathsAll: string[] = [];

    for (const key in directoryCache) {
      const listing = directoryCache[key];
      if (!listing) continue;
      const rootNode: TreeNode = {
        name: listing.baseName,
        path: listing.absolutePath,
        type: 'directory',
        children: listing.children
      };
      collectAllFilePaths(rootNode, updatedStates, filePathsAll);
    }

    // Build a new set of selectedFileContents by removing paths not in filePathsAll
    setSelectedFileContents((prev) => {
      const updated: Record<string, string> = {};
      // keep existing if still in filePathsAll
      for (const p of Object.keys(prev)) {
        if (filePathsAll.includes(p)) {
          updated[p] = prev[p];
        }
      }

      // read newly selected
      const newlySelected = filePathsAll.filter((p) => !(p in updated));
      if (newlySelected.length === 0) {
        return updated;
      }
      // read them in parallel
      Promise.all(
        newlySelected.map(async (fp) => {
          const content = await readFile(fp);
          return { fp, content };
        })
      ).then((results) => {
        setSelectedFileContents((oldSel) => {
          const copy = { ...oldSel };
          for (const r of results) {
            copy[r.fp] = r.content;
          }
          return copy;
        });
      });

      return updated;
    });
  }

  /**
   * toggleNodeSelection: flips the node from 'all'->'none' or 'none'->'all'. 
   * Then recalc partial states and re-sync selected file contents.
   */
  const toggleNodeSelection = useCallback(
    (node: TreeNode) => {
      setNodeStates((prev) => {
        const updated = { ...prev };
        const current = updated[node.path] || 'none';
        const newState = current === 'all' ? 'none' : 'all';
        setNodeStateRecursive(node, newState, updated);
        recalcAllRootStates(updated);
        // Then sync selected file contents
        syncSelectedFilesFromNodeStates(updated);
        return updated;
      });
    },
    [directoryCache]
  );

  /**
   * toggleExpansion: flips expandedPaths[nodePath].
   */
  const toggleExpansion = useCallback((nodePath: string) => {
    setExpandedPaths((prev) => {
      return { ...prev, [nodePath]: !prev[nodePath] };
    });
  }, []);

  /**
   * collapseSubtree: sets expandedPaths to false for the entire subtree under the given node.
   */
  const collapseSubtree = useCallback((node: TreeNode) => {
    if (node.type !== 'directory') return;
    const stack: TreeNode[] = [node];
    const newExpanded = { ...expandedPaths };

    while (stack.length > 0) {
      const n = stack.pop()!;
      newExpanded[n.path] = false;
      if (n.children && n.children.length > 0) {
        n.children.forEach((c) => {
          if (c.type === 'directory') {
            stack.push(c);
          }
        });
      }
    }
    setExpandedPaths(newExpanded);
  }, [expandedPaths]);

  /**
   * generateAsciiTree: builds an ASCII representation of the directory structure for a root path.
   */
  const generateAsciiTree = useCallback(async (rootPath: string): Promise<string> => {
    const listing = await getDirectoryListing(rootPath);
    if (!listing) {
      console.warn('[ProjectContext] generateAsciiTree: No listing for rootPath:', rootPath);
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
      const output: string[] = [];
      const nodeMarker = isLast ? '└── ' : '├── ';
      output.push(prefix + nodeMarker + node.name);

      if (node.type === 'directory' && node.children && node.children.length > 0) {
        const childPrefix = prefix + (isLast ? '    ' : '│   ');
        node.children.forEach((child, idx) => {
          const childIsLast = idx === node.children!.length - 1;
          output.push(...buildAsciiLines(child, childPrefix, childIsLast));
        });
      }
      return output;
    }

    if (rootNode.children && rootNode.children.length > 0) {
      rootNode.children.forEach((child, idx) => {
        const isLast = idx === rootNode.children!.length - 1;
        lines.push(...buildAsciiLines(child, '', isLast));
      });
    }

    lines.push('</file_map>');
    return lines.join('\n');
  }, [getDirectoryListing]);

  /**
   * getSelectedFileEntries: returns an array of fully-selected files as { path, content, language }.
   */
  const getSelectedFileEntries = useCallback(() => {
    const results: Array<{ path: string; content: string; language: string }> = [];
    for (const [filePath, content] of Object.entries(selectedFileContents)) {
      // guess language from extension
      const ext = getFileExtension(filePath).toLowerCase();
      let language = 'plaintext';
      switch (ext) {
        case 'js': case 'jsx':
          language = 'javascript'; break;
        case 'ts': case 'tsx':
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
      results.push({
        path: filePath,
        content,
        language
      });
    }
    return results;
  }, [selectedFileContents]);

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
    getSelectedFileEntries
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
