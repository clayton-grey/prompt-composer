/**
 * @file PromptBuilder.tsx
 * @description
 * Provides the UI for adding text, template, and file blocks, plus a toggle for plain text preview.
 *
 * Step 5a Changes:
 *  - We introduce a resizable preview area at the bottom, separated by a horizontal drag handle.
 *  - The user can toggle the preview on/off with the "Show/Hide Plain Text View" button. If shown,
 *    the bottom area appears with a given height (previewHeight). The user can drag to resize it.
 *
 * Implementation:
 *  1. We keep the top bar with "Add Text / Template / File" buttons as before.
 *  2. The main portion now is a flex container with a column for the block list (scrollable),
 *     then a small "div" that acts as a horizontal drag handle, then the preview container.
 *  3. We replicate the logic from the sidebar resizing approach: track isResizingPreview,
 *     lastClientY, and handle mousemove globally to apply the new height.
 */

import React, { useState, useEffect, useRef } from 'react';
import { nanoid } from 'nanoid';
import BlockList from './BlockList';
import { usePrompt } from '../../context/PromptContext';
import PromptPreview from './PromptPreview';
import { useProject } from '../../context/ProjectContext';
import TemplateSelectorModal from './TemplateSelectorModal';

export const PromptBuilder: React.FC = () => {
  const { addBlock, addBlocks, updateFileBlock } = usePrompt();
  const { getSelectedFileEntries, generateAsciiTree, directoryCache } = useProject();

  const [showPreview, setShowPreview] = useState(false);

  // For "Add Template Block" pop-up
  const [showTemplateModal, setShowTemplateModal] = useState(false);

  // List of root folders from directoryCache
  const [rootFolders, setRootFolders] = useState<string[]>([]);

  // For the preview resizing
  const [previewHeight, setPreviewHeight] = useState<number>(300);
  const isResizingPreviewRef = useRef<boolean>(false);
  const lastClientYRef = useRef<number>(0);

  useEffect(() => {
    const folderPaths = Object.keys(directoryCache);
    if (folderPaths.length > 0) {
      setRootFolders(folderPaths);
    }
  }, [directoryCache]);

  /**
   * Adding blocks
   */
  const handleAddTextBlock = () => {
    addBlock({
      id: nanoid(),
      type: 'text',
      label: 'Text Block',
      content: '',
    });
  };

  const handleAddTemplateBlock = () => {
    setShowTemplateModal(true);
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

    // fallback
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
      const allInRoot = files.every(f => f.path.startsWith(root));
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
      const paths = files.map(f => f.path);
      const firstPath = paths[0];
      const parts = firstPath.split('/');
      for (let i = parts.length; i > 0; i--) {
        const prefix = parts.slice(0, i).join('/');
        if (paths.every(p => p.startsWith(prefix))) {
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

  /**
   * show/hide the preview
   */
  const togglePreview = () => {
    setShowPreview(!showPreview);
  };

  /**
   * handleInsertTemplateBlocks
   * Called by TemplateSelectorModal once the user picks a file. We parse that content
   * into multiple blocks (possibly sub-blocks) and add them to the composition.
   */
  const handleInsertTemplateBlocks = (parsedBlocks: any[]) => {
    addBlocks(parsedBlocks);
  };

  /**
   * Resizing logic for the preview area
   */
  const onMouseDownPreviewHandle = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    isResizingPreviewRef.current = true;
    lastClientYRef.current = e.clientY;
  };

  const onMouseMove = (e: MouseEvent) => {
    if (!isResizingPreviewRef.current) return;
    const delta = e.clientY - lastClientYRef.current;
    lastClientYRef.current = e.clientY;
    setPreviewHeight(prev => {
      const newVal = prev - delta;
      // Min/Max clamp
      if (newVal < 100) return 100;
      if (newVal > 800) return 800;
      return newVal;
    });
  };

  const onMouseUp = () => {
    isResizingPreviewRef.current = false;
  };

  useEffect(() => {
    function handleGlobalMouseMove(ev: MouseEvent) {
      onMouseMove(ev);
    }
    function handleGlobalMouseUp() {
      onMouseUp();
    }
    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Header row for add-block buttons */}
      <div className="flex justify-between items-center p-4 border-b dark:border-gray-600">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Prompt Builder</h2>
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
              onClick={togglePreview}
              className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
            >
              {showPreview ? 'Hide Plain Text View' : 'Show Plain Text View'}
            </button>
          </div>
        </div>
      </div>

      {/* Main content area includes block list and, optionally, the preview at bottom. */}
      <div className="flex-1 overflow-hidden bg-gray-100 dark:bg-gray-800 flex flex-col">
        {/* Block list region: if the preview is shown, we set a flex layout that 
            leaves space at the bottom for the preview. We do not rely on a separate 
            container's height if preview is hidden. */}
        <div
          className="flex-1 overflow-auto p-4"
          style={
            {
              // if not showing preview, let this take full height
              // if showing, we reduce height by previewHeight (minus handle size) via flex approach
              // but here we rely on flex + the handle + preview container to handle layout
            }
          }
        >
          <BlockList />
        </div>

        {/* If the preview is shown, we have a drag handle and a preview area. */}
        {showPreview && (
          <>
            {/* Horizontal drag handle */}
            <div className="preview-drag-handle h-2" onMouseDown={onMouseDownPreviewHandle} />

            {/* Preview container with scroll */}
            <div
              className="bg-white dark:bg-gray-700 border-t border-gray-300 dark:border-gray-600 overflow-auto"
              style={{ height: `${previewHeight}px` }}
            >
              <PromptPreview />
            </div>
          </>
        )}
      </div>

      {/* Template selector modal */}
      <TemplateSelectorModal
        isOpen={showTemplateModal}
        onClose={() => setShowTemplateModal(false)}
        onInsertBlocks={handleInsertTemplateBlocks}
      />
    </div>
  );
};
