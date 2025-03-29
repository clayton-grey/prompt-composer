/**
 * @file asciiTreeGenerator.ts
 * @description
 * Provides unified logic for generating ASCII directory trees for one or more root folders.
 *
 * Step 9 Changes:
 *  - We add a simple memoization approach to avoid regenerating the same ASCII tree
 *    if the same folder array is passed in consecutively.
 *  - We store the previous input array + output string in a local variable.
 *  - If the next call has exactly the same folder array (same order and entries),
 *    we return the cached result.
 *
 * Implementation details:
 *  - The user can call clearAsciiCache() if they suspect the folder structure changed
 *    drastically and want a fresh generation forcibly. For now, we do not automatically
 *    clear it when the user calls "refreshFolders"; that can be integrated if desired.
 */

interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: TreeNode[];
}

// Cache references
let lastFoldersInput: string[] | null = null;
let lastAsciiResult: string | null = null;

/**
 * Clears the in-memory ASCII tree cache. Useful if the folder structure changes significantly.
 */
export function clearAsciiCache(): void {
  lastFoldersInput = null;
  lastAsciiResult = null;
}

/**
 * Recursively builds the ASCII lines for a given node and its children.
 * @param node The node to process (file or directory)
 * @param prefix The prefix used for indentation in the ASCII tree
 * @param isLast Whether this node is the last child of its parent
 * @returns An array of string lines that represent this node (and its subtree)
 */
function buildAsciiLines(node: TreeNode, prefix: string = '', isLast: boolean = true): string[] {
  const lines: string[] = [];
  const nodeMarker = isLast ? '└── ' : '├── ';

  let label = node.name;
  if (node.type === 'directory') {
    label = '[D] ' + node.name;
  }

  lines.push(prefix + nodeMarker + label);

  if (node.type === 'directory' && node.children && node.children.length > 0) {
    // Sort directories first, then files
    const sortedChildren = [...node.children].sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
    const childPrefix = prefix + (isLast ? '    ' : '│   ');
    sortedChildren.forEach((child, idx) => {
      const childIsLast = idx === sortedChildren.length - 1;
      lines.push(...buildAsciiLines(child, childPrefix, childIsLast));
    });
  }

  return lines;
}

/**
 * fetchDirectoryListing
 * Utility to call electronAPI.listDirectory for a single folder path. This
 * assumes a full read (shallow=false) for ASCII generation.
 */
async function fetchDirectoryListing(folderPath: string): Promise<TreeNode | null> {
  if (!window.electronAPI?.listDirectory) {
    console.warn('[asciiTreeGenerator] No electronAPI.listDirectory found. Returning null.');
    return null;
  }
  try {
    // For ASCII tree generation, we typically want the full tree
    const listing = await window.electronAPI.listDirectory(folderPath, { shallow: false });
    if (!listing) {
      return null;
    }
    const rootNode: TreeNode = {
      name: listing.baseName,
      path: listing.absolutePath,
      type: 'directory',
      children: listing.children,
    };
    return rootNode;
  } catch (err) {
    console.warn('[asciiTreeGenerator] Failed to process folder:', folderPath, err);
    return null;
  }
}

/**
 * generateAsciiTree
 * Builds a combined ASCII directory tree for one or more folder paths, using a naive memoization.
 *
 * @param folders string[] - An array of folder paths
 * @returns A Promise resolving to a single string containing the ASCII directory tree
 * for each folder, separated by blank lines if multiple folders are provided.
 *
 * Caching Approach:
 *  - If the input array is identical (length + each folder path) to lastFoldersInput,
 *    we return lastAsciiResult. Otherwise, we generate and store in the cache.
 */
export async function generateAsciiTree(folders: string[]): Promise<string> {
  if (!folders || folders.length === 0) {
    return '';
  }

  // Check naive cache
  const isSameAsCached =
    lastFoldersInput &&
    lastFoldersInput.length === folders.length &&
    lastFoldersInput.every((f, idx) => f === folders[idx]);

  if (isSameAsCached && lastAsciiResult) {
    return lastAsciiResult;
  }

  let finalOutput = '';

  for (let i = 0; i < folders.length; i++) {
    const folderPath = folders[i];
    const rootNode = await fetchDirectoryListing(folderPath);
    if (!rootNode) {
      continue;
    }

    let lines: string[] = [];
    lines.push('<file_map>');
    lines.push(rootNode.path);

    // Sort top-level children
    if (rootNode.children && rootNode.children.length > 0) {
      const sortedChildren = [...rootNode.children].sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

      sortedChildren.forEach((child, idx) => {
        const isLast = idx === sortedChildren.length - 1;
        lines.push(...buildAsciiLines(child, '', isLast));
      });
    }

    lines.push('</file_map>');
    if (i < folders.length - 1) {
      lines.push('');
    }

    finalOutput += lines.join('\n');
    if (i < folders.length - 1) {
      finalOutput += '\n';
    }
  }

  const trimmed = finalOutput.trim();

  // Store in naive cache
  lastFoldersInput = [...folders];
  lastAsciiResult = trimmed;

  return trimmed;
}
