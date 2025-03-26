
/**
 * @file PromptBuilder.tsx
 * @description
 * Provides the UI for adding text blocks, template blocks, and file blocks, then displays them
 * in a block list. Also includes a toggle to show a plain text preview of the final prompt.
 *
 * Step 4 (Basic Template Block Management):
 *  - We add an "Add Template Block" button so users can create a template block.
 *  - The new template block initializes with an empty variables array.
 *  - The user can then edit placeholders and variables in TemplateBlockEditor.
 *
 * Key Responsibilities:
 *  1) Provide interface to add Text, Template, and File blocks
 *  2) Retrieve selected file entries from ProjectContext if adding a File block
 *  3) Display the block list and optional plain-text preview
 *
 * Dependencies:
 *  - nanoid for unique block IDs
 *  - usePrompt() for the prompt state (blocks, token usage, etc.)
 *  - useProject() for file selection data
 *
 * Notes & Limitations:
 *  - Expand/collapse for template fields is done in Step 6, so for now, the user simply sees
 *    all variables if any exist in the template block.
 *  - This file now includes handleAddTemplateBlock() for Step 4.
 *  - handleAddFileBlock remains unchanged from before, except for referencing user instructions.
 */

import React, { useState, useEffect } from 'react';
import { Block } from '../../types/Block';
import BlockList from './BlockList';
import { usePrompt } from '../../context/PromptContext';
import PromptPreview from './PromptPreview';
import { useProject } from '../../context/ProjectContext';
import { nanoid } from 'nanoid';

export const PromptBuilder: React.FC = () => {
  const { addBlock, updateFileBlock, tokenUsage } = usePrompt();
  const { getSelectedFileEntries, generateAsciiTree, directoryCache } = useProject();
  const [showPreview, setShowPreview] = useState(false);
  const [rootFolders, setRootFolders] = useState<string[]>([]);

  // Gather all known folder paths from directoryCache (if user has added multiple root folders)
  useEffect(() => {
    const folderPaths = Object.keys(directoryCache);
    if (folderPaths.length > 0) {
      setRootFolders(folderPaths);
    }
  }, [directoryCache]);

  /**
   * handleAddTextBlock
   * Creates a simple text block with an empty string as content.
   */
  const handleAddTextBlock = () => {
    addBlock({
      id: nanoid(),
      type: 'text',
      label: 'Text Block',
      content: '',
    });
  };

  /**
   * handleAddTemplateBlock
   * Creates a template block with empty content and empty variables array.
   * Step 4: This allows user to create a TemplateBlock and edit it via TemplateBlockEditor.
   */
  const handleAddTemplateBlock = () => {
    addBlock({
      id: nanoid(),
      type: 'template',
      label: 'Template Block',
      content: '',
      variables: []
    });
  };

  /**
   * handleAddFileBlock
   * Gathers currently selected files from ProjectContext, optionally builds an ASCII map,
   * and updates or creates a single file block in PromptContext.
   */
  const handleAddFileBlock = async () => {
    const fileEntries = getSelectedFileEntries();

    if (fileEntries.length === 0) {
      console.log('[PromptBuilder] No files currently selected in the sidebar. Nothing to add.');
      return;
    }

    console.log(`[PromptBuilder] Adding ${fileEntries.length} files to prompt:`);
    fileEntries.forEach((file) => {
      console.log(`- ${file.path} (${file.content.length} chars)`);
    });

    console.log(`[PromptBuilder] PromptContext total tokens before update: ${tokenUsage.totalTokens}`);

    // Try to find which root folder encloses the selected files (for ASCII map generation)
    const rootFolder = findRootFolderForFiles(fileEntries, rootFolders);

    if (rootFolder) {
      console.log(`[PromptBuilder] Generating ASCII map for root folder: ${rootFolder}`);
      try {
        const completeMap = await generateAsciiTree(rootFolder);
        if (completeMap) {
          console.log(`[PromptBuilder] Generated complete ASCII map (${completeMap.length} chars)`);
          updateFileBlock(fileEntries, completeMap);

          setTimeout(() => {
            console.log(`[PromptBuilder] PromptContext total tokens after update: ${tokenUsage.totalTokens}`);
          }, 500);
          return;
        }
      } catch (error) {
        console.error('[PromptBuilder] Error generating ASCII tree:', error);
      }
    }

    // Fallback if ASCII map couldn't be generated
    console.log('[PromptBuilder] Using fallback simple file list');
    const simpleMap = generateSimpleFileList(fileEntries);
    updateFileBlock(fileEntries, simpleMap);

    setTimeout(() => {
      console.log(`[PromptBuilder] PromptContext total tokens after update: ${tokenUsage.totalTokens}`);
    }, 500);
  };

  /**
   * findRootFolderForFiles
   * Attempts to locate which root folder path encloses all selected files.
   * Returns the best match or null if none found.
   */
  function findRootFolderForFiles(
    files: Array<{ path: string }>,
    rootFolders: string[]
  ): string | null {
    if (files.length === 0 || rootFolders.length === 0) return null;

    const sortedRoots = [...rootFolders].sort((a, b) => b.length - a.length);

    for (const root of sortedRoots) {
      const allFilesInRoot = files.every((file) => file.path.startsWith(root));
      if (allFilesInRoot) {
        return root;
      }
    }

    const firstFilePath = files[0].path;
    for (const root of sortedRoots) {
      if (firstFilePath.startsWith(root)) {
        return root;
      }
    }

    return null;
  }

  /**
   * generateSimpleFileList
   * Fallback ASCII representation if the real generateAsciiTree fails or is unavailable.
   */
  function generateSimpleFileList(
    files: { path: string; content: string; language: string }[]
  ): string {
    let map = '<file_map>\n';

    if (files.length > 0) {
      const paths = files.map((f) => f.path);
      const firstPath = paths[0];
      const parts = firstPath.split('/');

      // Try to find a common prefix
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
        // This next line is naive: just remove the prefix used above from the path to get a "relative" path
        const commonLine = map.split('\n')[1] || ''; 
        const relativePath = file.path.substring(commonLine.length + 1);
        map += prefix + relativePath + '\n';
      });
    } else {
      map += 'No files selected\n';
    }

    map += '</file_map>';
    return map;
  }

  /**
   * Toggles the plain text preview on/off
   */
  const togglePreview = () => {
    setShowPreview((prev) => !prev);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header Row for the Prompt Builder */}
      <div className="flex justify-between items-center p-4 border-b dark:border-gray-600">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
          Prompt Builder
        </h2>

        <div className="flex gap-2">
          {/* Add Text Block */}
          <button
            onClick={handleAddTextBlock}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Add Text Block
          </button>

          {/* Add Template Block (Step 4) */}
          <button
            onClick={handleAddTemplateBlock}
            className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600"
          >
            Add Template Block
          </button>

          {/* Add File Block */}
          <button
            onClick={handleAddFileBlock}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
          >
            Add File Block
          </button>

          {/* Toggle Plain Text View */}
          <button
            onClick={togglePreview}
            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
          >
            {showPreview ? 'Hide Plain Text View' : 'Show Plain Text View'}
          </button>
        </div>
      </div>

      {/* Main content area: blocks list + optional preview */}
      <div className="flex-1 overflow-auto p-4">
        <BlockList />
        {showPreview && <PromptPreview />}
      </div>
    </div>
  );
};
