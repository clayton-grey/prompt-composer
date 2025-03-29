/**
 * @file Sidebar.tsx
 * @description
 * Implements the left sidebar for Prompt Composer, displaying and managing project folders,
 * the file tree, and a footer showing the total token usage of selected files.
 *
 * Accessibility Updates (Step 7):
 * 1) Switched "Project Folders" label from a <span> to an <h2> for better semantic hierarchy.
 * 2) Added aria-hidden="true" to SVG icons that are purely decorative or already labeled by their parent button.
 * 3) Kept existing title/aria-label on clickable buttons to ensure they're accessible to screen readers.
 *
 * Key Responsibilities:
 *  - Shows the list of project folders and a FileTree for each
 *  - Provides buttons for add folder, refresh, copy output
 *  - Displays a mini-footer with selected file token usage
 */

import React from 'react';
import FileTree from './Sidebar/FileTree';
import { useProject } from '../context/ProjectContext';
import { useToast } from '../context/ToastContext';
import { generateAsciiTree } from '../utils/asciiTreeGenerator';

const Sidebar: React.FC = () => {
  const {
    projectFolders,
    addProjectFolder,
    removeProjectFolder,
    refreshFolders,
    selectedFilesTokenCount,
    getSelectedFileEntries,
  } = useProject();

  const { showToast } = useToast();

  /**
   * handleAddFolder
   */
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

  /**
   * handleRefresh
   */
  const handleRefresh = async () => {
    try {
      await refreshFolders(projectFolders);
    } catch (err) {
      console.error('[Sidebar] Refresh error:', err);
    }
  };

  /**
   * handleRemoveFolder
   */
  const handleRemoveFolder = (folderPath: string) => {
    removeProjectFolder(folderPath);
  };

  /**
   * handleCopyFileBlockOutput
   * Gathers ASCII tree for each folder plus selected file contents, copies the final string.
   */
  const handleCopyFileBlockOutput = async () => {
    try {
      let finalOutput = '';

      // For each project folder, generate the ASCII tree
      for (const folder of projectFolders) {
        const ascii = await generateAsciiTree([folder]);
        if (ascii) {
          finalOutput += ascii.trim() + '\n\n';
        }
      }

      // Now append all selected file entries
      const selectedEntries = getSelectedFileEntries();
      for (const entry of selectedEntries) {
        finalOutput += `<file_contents>\nFile: ${entry.path}\n\`\`\`${entry.language}\n${entry.content}\n\`\`\`\n</file_contents>\n\n`;
      }

      // Copy to clipboard
      await navigator.clipboard.writeText(finalOutput.trim());
      console.log('[Sidebar] Copied file block output to clipboard.');
      showToast('Copied file block output to clipboard!', 'info');
    } catch (err) {
      console.error('[Sidebar] Failed to copy file block output:', err);
      showToast('Failed to copy file block output. See console.', 'error');
    }
  };

  return (
    <aside className="bg-gray-200 dark:bg-gray-700 flex flex-col h-full relative min-w-[270px]">
      {/* Top controls: "Project Folders" label plus copy/refresh/add folder buttons */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-300 dark:border-gray-600">
        {/* Changed to <h2> for better semantics */}
        <h2 className="text-gray-900 dark:text-gray-50 font-medium text-base m-0 p-0">
          Project Folders
        </h2>
        <div className="flex items-center gap-2">
          {/* Only show Copy/Refresh if there's at least one project folder */}
          {projectFolders.length > 0 && (
            <>
              {/* Copy File Block Output Button */}
              <button
                onClick={handleCopyFileBlockOutput}
                className="w-8 h-8 rounded hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 flex items-center justify-center"
                title="Copy File Block Output"
                aria-label="Copy File Block Output"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="lucide lucide-copy-icon lucide-copy"
                  aria-hidden="true"
                >
                  <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                  <path
                    d="M4 16c-1.1 0-2-.9-2-2V4
                       c0-1.1.9-2 2-2h10
                       c1.1 0 2 .9 2 2"
                  />
                </svg>
              </button>

              {/* Refresh Button */}
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
                  aria-hidden="true"
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
            </>
          )}

          {/* Add Folder Button (always visible) */}
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
              aria-hidden="true"
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

      {/* Footer: same height as the EditorFooter => h-10, text-sm */}
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
          aria-hidden="true"
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
          aria-hidden="true"
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
