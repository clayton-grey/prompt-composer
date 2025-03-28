/**
 * @file Sidebar.tsx
 * We finalize the 2-column approach with footers of the same height. We do h-10 in the
 * footer, text-sm, and replace "Selected files token usage: X" with two icons:
 *   1) square-check-icon
 *   2) coins-icon
 * plus the numeric count. e.g. [check-icon] [coins-icon] 35
 */

import React from 'react';
import FileTree from './Sidebar/FileTree';
import { useProject } from '../context/ProjectContext';

const Sidebar: React.FC = () => {
  const {
    projectFolders,
    addProjectFolder,
    removeProjectFolder,
    refreshFolders,
    selectedFilesTokenCount,
  } = useProject();

  const handleAddFolder = async () => {
    try {
      if (!window.electronAPI?.showOpenDialog) {
        console.warn('[Sidebar] Missing electronAPI.showOpenDialog');
        return;
      }
      const result = await window.electronAPI.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Select Project Folder',
      });
      if (result.canceled || result.filePaths.length === 0) {
        console.log('[Sidebar] Folder selection canceled');
        return;
      }
      const folderPath = result.filePaths[0];
      await addProjectFolder(folderPath);
    } catch (err) {
      console.error('[Sidebar] addFolder error:', err);
    }
  };

  const handleRefresh = async () => {
    await refreshFolders(projectFolders);
  };

  const handleRemoveFolder = (folderPath: string) => {
    removeProjectFolder(folderPath);
  };

  return (
    <aside className="bg-gray-200 dark:bg-gray-700 flex flex-col h-full relative min-w-[250px]">
      {/* Top controls: "Project Folders" label plus add/refresh buttons */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-300 dark:border-gray-600">
        <span className="text-gray-900 dark:text-gray-50 font-medium">Project Folders</span>
        <div className="flex items-center gap-2">
          <button
            onClick={handleAddFolder}
            className="w-8 h-8 rounded hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 flex items-center justify-center"
            title="Add Folder"
            aria-label="Add Folder"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-6 h-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 10v6" />
              <path d="M9 13h6" />
              <path
                d="M20 20a2 2 0 0 0 2-2V8
                   a2 2 0 0 0-2-2h-7.9
                   a2 2 0 0 1-1.69-.9l-.81-1.2
                   A2 2 0 0 0 7.93 3H4
                   a2 2 0 0 0-2 2v13
                   a2 2 0 0 0 2 2Z"
              />
            </svg>
          </button>
          <button
            onClick={handleRefresh}
            className="w-8 h-8 rounded hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 flex items-center justify-center"
            title="Refresh Folders"
            aria-label="Refresh Folders"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-6 h-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path
                d="M9 20H4
                   a2 2 0 0 1-2-2V5
                   a2 2 0 0 1 2-2h3.9
                   a2 2 0 0 1 1.69.9l.81 1.2
                   a2 2 0 0 0 1.67.9H20
                   a2 2 0 0 1 2 2v.5"
              />
              <path d="M12 10v4h4" />
              <path d="m12 14 1.535-1.605a5 5 0 0 1 8 1.5" />
              <path d="M22 22v-4h-4" />
              <path d="m22 18-1.535 1.605a5 5 0 0 1-8-1.5" />
            </svg>
          </button>
        </div>
      </div>

      {/* The file tree listing */}
      <div className="flex-grow overflow-y-auto p-2">
        {projectFolders.length === 0 && (
          <div className="text-gray-500 italic">
            No folders added. Click "Add Folder" to include your project.
          </div>
        )}
        {projectFolders.map(folderPath => (
          <div key={folderPath} className="mb-4">
            <FileTree
              folders={[folderPath]}
              onRemoveFolder={() => handleRemoveFolder(folderPath)}
            />
          </div>
        ))}
      </div>

      {/* Footer: same height as the EditorFooter => h-10, text-sm 
          Replacing label with:
            [square-check icon] [coins icon] selectedFilesTokenCount
      */}
      <div className="h-10 flex items-center px-4 border-t border-gray-300 dark:border-gray-600 bg-gray-300 dark:bg-gray-800 text-gray-800 dark:text-gray-100 flex-none text-sm justify-start gap-2">
        {/* square-check icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="w-5 h-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect width="18" height="18" x="3" y="3" rx="2" />
          <path d="m9 12 2 2 4-4" />
        </svg>

        {/* coins icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="w-5 h-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="8" cy="8" r="6" />
          <path d="M18.09 10.37A6 6 0 1 1 10.34 18" />
          <path d="M7 6h1v4" />
          <path d="m16.71 13.88.7.71-2.82 2.82" />
        </svg>

        <span>{selectedFilesTokenCount}</span>
      </div>
    </aside>
  );
};

export default Sidebar;
