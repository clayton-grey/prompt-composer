
/**
 * @file Sidebar.tsx
 * @description
 * The main sidebar component for adding and managing project folders. The user can
 * click "Add Folder" to select a local directory. The chosen folder path is appended
 * to an internal array (additionalFolders). We pass this array to <FileTree folders={...}>
 * to display the tri-state file tree. The user can remove a folder from the tree using
 * the remove button inside the FileTree, which calls onRemoveFolder, removing it from
 * additionalFolders.
 *
 * Step 17A Changes:
 *  - We no longer pass rootPath="." by default. The user starts with no folders added.
 *  - The <FileTree> now only takes a 'folders' array. We pass additionalFolders to it.
 *  - Implement onRemoveFolder method, which updates additionalFolders to remove the folder.
 *  - Simplify the layout around the file tree. No default root or framing is used.
 *
 * Additional Features:
 *  - "Add Folder" button triggers electronAPI.showOpenDialog with { properties: ['openDirectory'] }
 *  - We still have a bottom label for selected files token usage from the PromptContext.
 */

import React, { useState, useCallback } from 'react';
import FileTree from './Sidebar/FileTree';
import FileMapViewer from './Sidebar/FileMapViewer';
import { usePrompt } from '../context/PromptContext';

const Sidebar: React.FC = () => {
  const { selectedFilesTokenCount } = usePrompt();
  // We start with no folders => do not include any project folder by default
  const [additionalFolders, setAdditionalFolders] = useState<string[]>([]);

  /**
   * addFolder() opens a directory selection dialog and adds the selected folder
   * to the array of additionalFolders if the user confirms.
   */
  const addFolder = async () => {
    try {
      const result = await window.electronAPI.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Select Project Folder'
      });
      if (result.canceled || result.filePaths.length === 0) {
        console.log('[Sidebar] Folder selection canceled');
        return;
      }
      const folderPath = result.filePaths[0];
      console.log('[Sidebar] Selected folder:', folderPath);
      setAdditionalFolders((prev) => {
        if (!prev.includes(folderPath)) {
          return [...prev, folderPath];
        }
        return prev; // ignore duplicates
      });
    } catch (err) {
      console.error('[Sidebar] addFolder error:', err);
    }
  };

  /**
   * removeFolder is passed to <FileTree />, letting it call us back with
   * a root folder path the user wants to remove from the UI.
   */
  const removeFolder = useCallback((folderPath: string) => {
    setAdditionalFolders((prev) => prev.filter((p) => p !== folderPath));
  }, []);

  return (
    <aside
      className="bg-gray-200 dark:bg-gray-700 flex flex-col h-full relative min-w-[180px]"
      style={{ overflow: 'hidden' }}
    >
      {/* Top controls */}
      <div className="flex items-center justify-between p-2 border-b border-gray-300 dark:border-gray-600">
        <span className="text-gray-900 dark:text-gray-50 font-medium">Project Folders</span>
        <button
          onClick={addFolder}
          className="ml-2 text-xs border border-gray-500 rounded px-2 py-1 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100"
        >
          Add Folder
        </button>
      </div>

      {/* Main area: File tree + FileMapViewer */}
      <div className="flex-grow overflow-y-auto p-2">
        {/* The updated FileTree with no default root. We pass only additionalFolders. */}
        <FileTree
          folders={additionalFolders}
          onRemoveFolder={removeFolder}
        />

        {/* Divider */}
        <hr className="my-3 border-gray-400 dark:border-gray-600" />

        {/* File Map Viewer remains as an optional feature. The user can still see an ASCII tree. */}
        <FileMapViewer rootPath="." />
      </div>

      {/* Bottom bar for selected file usage */}
      <div className="p-2 text-xs bg-gray-300 dark:bg-gray-800 text-gray-800 dark:text-gray-100">
        Selected files token usage: {selectedFilesTokenCount}
      </div>
    </aside>
  );
};

export default Sidebar;
