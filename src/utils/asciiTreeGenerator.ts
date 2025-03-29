/**
 * @file asciiTreeGenerator.ts
 * @description
 * Provides unified logic for generating ASCII directory trees for one or more root folders.
 *
 * Consolidates similar code previously found in:
 *  - ProjectContext.generateAsciiTree
 *  - fileMapBuilder.ts
 *  - PromptContext.generateCombinedAsciiMapsForFolders
 *
 * Exported Functions:
 *  1) generateAsciiTree(folders: string[]): Promise<string>
 *     - Accepts an array of folder paths.
 *     - For each folder, calls electronAPI.listDirectory to get the directory structure.
 *     - Recursively builds an ASCII representation of the tree.
 *     - Combines the ASCII output for all folders into one final string.
 *
 * Implementation Details:
 *  - We define a TreeNode interface matching the shape returned by listDirectory (which includes children[]).
 *  - We define a helper function buildAsciiLines for recursion.
 *  - For each folder in the input array, we retrieve its directory listing via electronAPI, then build lines.
 *  - We label the top folder with the absolute path and represent subfolders/files as:
 *       ├── ...
 *       └── ...
 *  - Directories are prefixed with "[D] " to distinguish them from files.
 *  - We return the combined ASCII for all folders, separated by blank lines if multiple roots are given.
 *
 * Edge Cases:
 *  - If electronAPI.listDirectory is unavailable or errors, we log a warning and skip that folder.
 *  - If a folder has no children, we still display the root line with no sub-tree.
 *  - The function sorts directories before files for consistent ordering.
 *
 * Example Usage:
 *    import { generateAsciiTree } from './asciiTreeGenerator';
 *    const ascii = await generateAsciiTree(['/path/to/folderA', '/path/to/folderB']);
 *    console.log(ascii);
 *
 * @notes
 *  - This file was created to unify and remove duplicative ASCII generation logic scattered across the codebase.
 */

interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: TreeNode[];
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
    // Indicate directory
    label = '[D] ' + node.name;
  }

  lines.push(prefix + nodeMarker + label);

  if (node.type === 'directory' && node.children && node.children.length > 0) {
    // Sort directories first, then files, then alphabetical
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
 * generateAsciiTree
 * Builds a combined ASCII directory tree for one or more folder paths.
 *
 * @param folders string[] - An array of folder paths
 * @returns A Promise resolving to a single string containing the ASCII directory tree
 * for each folder, separated by blank lines if multiple folders are provided.
 *
 * Implementation Steps:
 *  1) For each folderPath:
 *     - Call electronAPI.listDirectory(folderPath) to obtain { absolutePath, baseName, children }
 *     - Construct a root node representing that directory, then recursively build lines for its children.
 *     - Prefix the output with <file_map> / </file_map> lines for easy insertion in the final prompt if needed.
 *  2) Combine all folder ASCII maps with a double newline separator.
 *  3) If any error occurs or electronAPI is unavailable, we log a warning and skip that folder.
 *
 * Example:
 *    const asciiStr = await generateAsciiTree(['/Users/myuser/ProjectA']);
 *    console.log(asciiStr);
 */
export async function generateAsciiTree(folders: string[]): Promise<string> {
  // If no folders, return empty
  if (!folders || folders.length === 0) {
    return '';
  }

  // Check electron API
  if (!window.electronAPI?.listDirectory) {
    console.warn('[asciiTreeGenerator] No electronAPI.listDirectory found. Returning empty.');
    return '';
  }

  let finalOutput = '';

  for (let i = 0; i < folders.length; i++) {
    const folderPath = folders[i];
    try {
      const listing = await window.electronAPI.listDirectory(folderPath);
      if (!listing) {
        console.warn(
          `[asciiTreeGenerator] No directory listing returned for folder: ${folderPath}`
        );
        continue;
      }

      const rootNode: TreeNode = {
        name: listing.baseName,
        path: listing.absolutePath,
        type: 'directory',
        children: listing.children,
      };

      // Begin with <file_map> tag
      let lines: string[] = [];
      lines.push('<file_map>');
      lines.push(rootNode.path);

      // Sort children in the same manner
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
      // Add extra blank line if multiple folders
      if (i < folders.length - 1) {
        lines.push('');
      }

      finalOutput += lines.join('\n');
      if (i < folders.length - 1) {
        finalOutput += '\n';
      }
    } catch (err) {
      console.warn('[asciiTreeGenerator] Failed to process folder:', folderPath, err);
      continue;
    }
  }

  return finalOutput.trim();
}
