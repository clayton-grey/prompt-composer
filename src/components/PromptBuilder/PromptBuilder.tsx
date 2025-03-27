
/**
 * @file PromptBuilder.tsx
 * @description
 * Provides the UI for adding text/template/file blocks, plus a toggle
 * for plain text preview and a prefab insertion. We now ensure the
 * builder area can scroll by setting "flex-1 overflow-auto" on the
 * block list container.
 *
 * We'll remove the partial "min-h-0" approach from the previous step
 * and rely on the layout in App -> MainContent for the overall structure.
 */

import React, { useState, useEffect } from 'react';
import { nanoid } from 'nanoid';
import BlockList from './BlockList';
import { usePrompt } from '../../context/PromptContext';
import PromptPreview from './PromptPreview';
import { useProject } from '../../context/ProjectContext';
import { parsePrefab } from '../../utils/prefabParser';

export const PromptBuilder: React.FC = () => {
  const { addBlock, addBlocks, updateFileBlock, tokenUsage } = usePrompt();
  const { getSelectedFileEntries, generateAsciiTree, directoryCache } = useProject();
  const [showPreview, setShowPreview] = useState(false);
  const [rootFolders, setRootFolders] = useState<string[]>([]);

  useEffect(() => {
    const folderPaths = Object.keys(directoryCache);
    if (folderPaths.length > 0) {
      setRootFolders(folderPaths);
    }
  }, [directoryCache]);

  const handleAddTextBlock = () => {
    addBlock({
      id: nanoid(),
      type: 'text',
      label: 'Text Block',
      content: ''
    });
  };

  const handleAddTemplateBlock = () => {
    addBlock({
      id: nanoid(),
      type: 'template',
      label: 'Template Block',
      content: '',
      variables: []
    });
  };

  const handleAddFileBlock = async () => {
    const fileEntries = getSelectedFileEntries();
    if (fileEntries.length === 0) {
      console.log('[PromptBuilder] No files selected in sidebar. Nothing to add.');
      return;
    }

    const rootFolder = findRootFolderForFiles(fileEntries, rootFolders);
    try {
      if (rootFolder) {
        const completeMap = await generateAsciiTree(rootFolder);
        if (completeMap) {
          updateFileBlock(fileEntries, completeMap);
          return;
        }
      }
    } catch (err) {
      console.error('[PromptBuilder] generateAsciiTree error:', err);
    }
    // Fallback
    const simpleMap = generateSimpleFileList(fileEntries);
    updateFileBlock(fileEntries, simpleMap);
  };

  function findRootFolderForFiles(
    files: Array<{ path: string }>,
    rootFolders: string[]
  ): string | null {
    if (files.length === 0 || rootFolders.length === 0) return null;
    const sortedRoots = [...rootFolders].sort((a, b) => b.length - a.length);
    for (const root of sortedRoots) {
      const allInRoot = files.every((f) => f.path.startsWith(root));
      if (allInRoot) return root;
    }
    const first = files[0].path;
    for (const root of sortedRoots) {
      if (first.startsWith(root)) return root;
    }
    return null;
  }

  function generateSimpleFileList(
    files: { path: string; content: string; language: string }[]
  ): string {
    let map = '<file_map>\n';
    if (files.length > 0) {
      const paths = files.map((f) => f.path);
      const firstPath = paths[0];
      const parts = firstPath.split('/');
      for (let i = parts.length; i > 0; i--) {
        const prefix = parts.slice(0, i).join('/');
        if (paths.every((p) => p.startsWith(prefix))) {
          map += prefix + '\n';
          break;
        }
      }
      files.forEach((file, idx) => {
        const isLast = idx === files.length - 1;
        const prefix = isLast ? '└── ' : '├── ';
        const lines = map.split('\n');
        const secondLine = lines[1] || '';
        const relativePath = file.path.substring(secondLine.length + 1);
        map += prefix + relativePath + '\n';
      });
    } else {
      map += 'No files selected\n';
    }
    map += '</file_map>';
    return map;
  }

  const togglePreview = () => setShowPreview(!showPreview);

  // Example prefab text
  const examplePrefab = `The start of a template.
This would create a user text block {{TEXT_BLOCK}}.
This would create a {{FILE_BLOCK}}.
And this would wrap up the template.`;

  const [showPrefabMenu, setShowPrefabMenu] = useState(false);

  const handleAddPrefabClick = () => {
    setShowPrefabMenu(!showPrefabMenu);
  };

  const handleInsertExamplePrefab = () => {
    setShowPrefabMenu(false);
    const newBlocks = parsePrefab(examplePrefab);
    addBlocks(newBlocks);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header row */}
      <div className="flex justify-between items-center p-4 border-b dark:border-gray-600">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
          Prompt Builder
        </h2>
        <div className="relative inline-block">
          <div className="flex gap-2">
            <button
              onClick={handleAddTextBlock}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Add Text Block
            </button>
            <button
              onClick={handleAddTemplateBlock}
              className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600"
            >
              Add Template Block
            </button>
            <button
              onClick={handleAddFileBlock}
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
            >
              Add File Block
            </button>
            <button
              onClick={handleAddPrefabClick}
              className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600"
            >
              Add Prefab
            </button>
            <button
              onClick={togglePreview}
              className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
            >
              {showPreview ? 'Hide Plain Text View' : 'Show Plain Text View'}
            </button>
          </div>

          {showPrefabMenu && (
            <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-700 shadow-lg rounded z-50">
              <ul className="py-1">
                <li>
                  <button
                    onClick={handleInsertExamplePrefab}
                    className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 dark:text-gray-200"
                  >
                    Insert Example Prefab
                  </button>
                </li>
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Scrolling area for blocks */}
      <div className="flex-1 overflow-auto p-4 bg-gray-100 dark:bg-gray-800">
        <BlockList />
        {showPreview && <PromptPreview />}
      </div>
    </div>
  );
};
