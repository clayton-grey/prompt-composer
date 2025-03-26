
/**
 * @file Sidebar.tsx
 * @description
 * The main sidebar for managing project folders. The user can add a folder,
 * which is appended to local additionalFolders. Then we pass that array to
 * <FileTree> for tri-state toggling.
 *
 * Step 2: We now add a "Refresh" button to re-fetch directory listings from the
 * ProjectContext. This ensures newly added or removed files in the OS are reflected
 * in the tri-state file tree.
 *
 * Final Cleanup (Step 11):
 *  - Removed FileMapViewer import and usage, so the ASCII file map is no
 *    longer displayed in the sidebar. Only the tri-state file tree remains.
 */

import React, { useState, useCallback } from 'react';
import FileTree from './Sidebar/FileTree';
import { useProject } from '../context/ProjectContext';

const Sidebar: React.FC = () => {
  // We keep track of root folder paths
  const [additionalFolders, setAdditionalFolders] = useState<string[]>([]);

  // We'll show the selectedFilesTokenCount from ProjectContext, not from PromptContext
  const { selectedFilesTokenCount, refreshFolders } = useProject();

  /**
   * addFolder
   * Allows the user to open a dialog and select a new project folder to track.
   */
  const addFolder = async () => {
    try {
      if (!window.electronAPI?.showOpenDialog) {
        console.warn('[Sidebar] Missing electronAPI.showOpenDialog');
        return;
      }
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
        return prev;
      });
    } catch (err) {
      console.error('[Sidebar] addFolder error:', err);
    }
  };

  /**
   * removeFolder
   * Removes a folder from the local array. This no longer wipes tri-state in ProjectContext,
   * but effectively hides that folder from the user. If re-added, we re-initialize it.
   */
  const removeFolder = useCallback((folderPath: string) => {
    setAdditionalFolders((prev) => prev.filter((p) => p !== folderPath));
  }, []);

  /**
   * handleRefresh
   * Step 2: Calls refreshFolders in the ProjectContext with our array of additionalFolders.
   */
  const handleRefresh = async () => {
    console.log('[Sidebar] handleRefresh triggered');
    if (!refreshFolders) {
      console.warn('[Sidebar] refreshFolders is unavailable');
      return;
    }
    await refreshFolders(additionalFolders);
  };

  return (
    <aside className="bg-gray-200 dark:bg-gray-700 flex flex-col h-full relative min-w-[180px]">
      {/* Top controls */}
      <div className="flex items-center justify-between p-2 border-b border-gray-300 dark:border-gray-600">
        <span className="text-gray-900 dark:text-gray-50 font-medium">
          Project Folders
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={addFolder}
            className="text-xs border border-gray-500 rounded px-2 py-1 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100"
          >
            Add Folder
          </button>
          {/* Step 2: "Refresh" button */}
          <button
            onClick={handleRefresh}
            className="text-xs border border-gray-500 rounded px-2 py-1 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="flex-grow overflow-y-auto p-2">
        {/* Render the FileTree for these additionalFolders */}
        <FileTree
          folders={additionalFolders}
          onRemoveFolder={removeFolder}
        />
      </div>

      {/* Bottom bar with selected files token usage */}
      <div className="p-2 text-xs bg-gray-300 dark:bg-gray-800 text-gray-800 dark:text-gray-100">
        Selected files token usage: {selectedFilesTokenCount}
      </div>
    </aside>
  );
};

export default Sidebar;
