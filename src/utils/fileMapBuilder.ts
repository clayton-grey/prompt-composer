/**
 * @file fileMapBuilder.ts
 * @description
 * Exports an async function `generateProjectAsciiMap` that:
 *  1) Invokes the "list-directory" IPC handler to get the entire directory tree,
 *  2) Builds an ASCII representation of that tree (fully expanded),
 *  3) Wraps it with <file_map> ... </file_map> and returns the resulting string.
 *
 * Usage (in PromptContext for instance):
 *   const ascii = await generateProjectAsciiMap('.');
 *
 * Dependencies:
 *  - window.electronAPI.listDirectory for reading the project structure
 *
 * Implementation:
 *  - We define an interface matching the return from listDirectory: { baseName, absolutePath, children }
 *  - We define a recursive function `buildAsciiLines` that constructs lines for each node.
 */

interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children ? : TreeNode[];
}

interface ListDirectoryResult {
  absolutePath: string;
  baseName: string;
  children: TreeNode[];
}

/**
 * Recursively builds ASCII lines for a node and its children.
 * @param node - Current TreeNode
 * @param prefix - The ASCII prefix used for indentation (e.g. '│  ', '   ')
 * @param isLast - Whether this node is the last child of its parent
 * @returns array of lines
 */
function buildAsciiLines(node: TreeNode, prefix: string = '', isLast: boolean = true): string[] {
  const lines: string[] = [];
  const nodeMarker = isLast ? '└── ' : '├── ';

  // Node label: if it's a directory, we could denote it, but let's keep it simple
  const label = node.name;

  // Construct the line
  lines.push(`${prefix}${nodeMarker}${label}`);

  // If directory, handle children
  if (node.type === 'directory' && node.children) {
    const childPrefix = prefix + (isLast ? '    ' : '│   ');
    node.children.forEach((child, idx) => {
      const childIsLast = idx === node.children!.length - 1;
      lines.push(...buildAsciiLines(child, childPrefix, childIsLast));
    });
  }

  return lines;
}

/**
 * generateProjectAsciiMap
 * @param rootPath - The folder path to start from (usually '.')
 * @returns A string with <file_map> ... ASCII ... </file_map>
 *
 * Implementation:
 *  1) calls electronAPI.listDirectory(rootPath) to get the directory tree
 *  2) builds lines from the root node
 */
export async function generateProjectAsciiMap(rootPath: string = '.'): Promise < string > {
  if (!window.electronAPI?.listDirectory) {
    console.warn('[fileMapBuilder] No electronAPI.listDirectory found. Returning empty.');
    return '';
  }

  try {
    const result = await window.electronAPI.listDirectory(rootPath) as ListDirectoryResult;
    const rootNode: TreeNode = {
      name: result.baseName,
      path: result.absolutePath,
      type: 'directory',
      children: result.children
    };

    const lines: string[] = [];
    lines.push('<file_map>');
    lines.push(rootNode.path);

    if (rootNode.children && rootNode.children.length > 0) {
      rootNode.children.forEach((child, idx) => {
        const isLast = idx === rootNode.children!.length - 1;
        lines.push(...buildAsciiLines(child, '', isLast));
      });
    }
    lines.push('</file_map>');

    const asciiMap = lines.join('\n');
    return asciiMap;
  } catch (err) {
    console.error('[fileMapBuilder] Failed to generate ASCII map:', err);
    return '';
  }
}
