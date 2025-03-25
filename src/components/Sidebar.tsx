
/**
 * @file Sidebar.tsx
 * @description
 * The main sidebar component for displaying the project's file tree. In this step,
 * we integrate FileTree.tsx, which calls "listDirectory" via IPC and renders a
 * nested folder/file structure respecting .gitignore.
 *
 * Key Responsibilities:
 *  - Provide a container/wrapper for FileTree
 *  - Potentially provide additional controls or filters in future steps
 *
 * @notes
 *  - For now, we simply render <FileTree rootPath="." /> to list from project root
 *  - Additional filtering or searching can be added as needed
 */

import React from 'react';
import FileTree from './Sidebar/FileTree';

const Sidebar: React.FC = () => {
  return (
    <aside className="bg-gray-200 dark:bg-gray-700 w-64 p-2 overflow-y-auto">
      <div className="text-gray-900 dark:text-gray-50 font-medium">
        <p className="mb-2">Project Files</p>
        <FileTree rootPath="." />
      </div>
    </aside>
  );
};

export default Sidebar;
