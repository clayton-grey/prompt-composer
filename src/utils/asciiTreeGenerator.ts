/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

/**
 * @file asciiTreeGenerator.ts
 * @description
 * **Patch – May 18 2025**
 *
 * The previous implementation used a **naïve in‑memory cache** (lastFoldersInput / lastAsciiResult)
 * to avoid regenerating identical ASCII trees. Unfortunately, that optimisation caused stale
 * directory trees to be emitted after files were added, removed, or renamed – you had to restart
 * Prompt Composer to see an accurate tree.
 *
 * The cache has been **completely removed** so every call produces a fresh view of the file system.
 * The performance impact is negligible for the typical project sizes we target (< 2 000 nodes).
 *
 * If you ever want caching again you can re‑introduce it behind an explicit `useCache` flag,
 * but the default behaviour must now prioritise correctness.
 */

// -------------------------------------------------------------------------------------------------
//  Types
// -------------------------------------------------------------------------------------------------

interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: TreeNode[];
}

// -------------------------------------------------------------------------------------------------
//  Helpers
// -------------------------------------------------------------------------------------------------

/**
 * Recursively builds the ASCII lines for a given node and its children.
 */
function buildAsciiLines(node: TreeNode, prefix = '', isLast = true): string[] {
  const lines: string[] = [];
  const nodeMarker = isLast ? '└── ' : '├── ';

  let label = node.name;
  if (node.type === 'directory') label = `[D] ${node.name}`;

  lines.push(prefix + nodeMarker + label);

  if (node.type === 'directory' && node.children && node.children.length > 0) {
    // Sort directories first, then files for a tidy output.
    const sorted = [...node.children].sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    const childPrefix = prefix + (isLast ? '    ' : '│   ');
    sorted.forEach((child, idx) => {
      const childIsLast = idx === sorted.length - 1;
      lines.push(...buildAsciiLines(child, childPrefix, childIsLast));
    });
  }

  return lines;
}

/**
 * Request a fresh directory listing for `folderPath` from the main process.
 * We always force a **non‑shallow** read so the ASCII tree is complete.
 */
async function fetchDirectoryListing(folderPath: string): Promise<TreeNode | null> {
  // @ts-ignore – suppressing type checks for the injected API
  if (!window.electronAPI?.listDirectory) {
    console.warn('[asciiTreeGenerator] window.electronAPI.listDirectory unavailable.');
    return null;
  }

  try {
    // @ts-ignore
    const listing = await window.electronAPI.listDirectory(folderPath, { shallow: false });
    if (!listing) return null;

    return {
      name: listing.baseName,
      path: listing.absolutePath,
      type: 'directory',
      children: listing.children,
    } as TreeNode;
  } catch (err) {
    console.warn('[asciiTreeGenerator] Failed to fetch directory listing:', folderPath, err);
    return null;
  }
}

// -------------------------------------------------------------------------------------------------
//  Public API
// -------------------------------------------------------------------------------------------------

/**
 * Generate an ASCII directory tree for one or more root folders.
 * Always returns a freshly computed string – no caching.
 */
export async function generateAsciiTree(folders: string[]): Promise<string> {
  if (!folders || folders.length === 0) return '';

  let output = '';

  for (let i = 0; i < folders.length; i++) {
    const folderPath = folders[i];
    const rootNode = await fetchDirectoryListing(folderPath);
    if (!rootNode) continue;

    const lines: string[] = [];
    lines.push('<file_map>');
    lines.push(rootNode.path);

    if (rootNode.children && rootNode.children.length > 0) {
      const sortedTop = [...rootNode.children].sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      sortedTop.forEach((child, idx) => {
        const isLast = idx === sortedTop.length - 1;
        lines.push(...buildAsciiLines(child, '', isLast));
      });
    }

    lines.push('</file_map>');
    if (i < folders.length - 1) lines.push('');

    output += lines.join('\n');
    if (i < folders.length - 1) output += '\n';
  }

  return output.trim();
}

// Stub retained for backward compatibility – does nothing now but avoids runtime errors.
export function clearAsciiCache(): void {
  /* no‑op – cache removed */
}
