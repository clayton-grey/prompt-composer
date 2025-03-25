
/**
 * @file Sidebar.tsx
 * @description
 * The main sidebar component for displaying the project's file tree and
 * now floating the "selected files token usage" at the bottom.
 *
 * Step 3 Changes:
 *  1. Moved the "Selected files token usage" display here, at the bottom of the side bar,
 *     referencing prompt.selectedFilesTokenCount from the context.
 *  2. Removed any leftover references to the "Add selected to prompt" button, which has
 *     been removed from FileTree.
 */

import React from 'react';
import FileTree from './Sidebar/FileTree';
import { usePrompt } from '../context/PromptContext';

const Sidebar: React.FC = () => {
  const { selectedFilesTokenCount } = usePrompt();

  return (
    <aside className="bg-gray-200 dark:bg-gray-700 w-64 flex flex-col h-full relative">
      {/* Main area: File tree */}
      <div className="flex-grow overflow-y-auto p-2">
        <div className="text-gray-900 dark:text-gray-50 font-medium mb-2">
          Project Files
        </div>
        <FileTree rootPath="." />
      </div>

      {/* Bottom bar for selected file usage */}
      <div className="p-2 text-sm bg-gray-300 dark:bg-gray-800 text-gray-800 dark:text-gray-100">
        Selected files token usage (Preview): {selectedFilesTokenCount}
      </div>
    </aside>
  );
};

export default Sidebar;
