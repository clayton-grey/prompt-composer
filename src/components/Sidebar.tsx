/**
 * @file Sidebar.tsx
 * @description
 * A sidebar component for displaying the project file tree or other navigation.
 * In future steps, it will show folders/files and respect .gitignore. Currently,
 * it's just a placeholder for layout demonstration.
 *
 * Key Responsibilities:
 *  - Provide a collapsible or fixed area where files can be shown
 *  - Serve as a site-wide navigation if needed
 *
 * @notes
 *  - In Step 4, we only focus on layout. File listing logic will come later.
 */

import React from 'react';

const Sidebar: React.FC = () => {
  return (
    <aside className="bg-gray-200 dark:bg-gray-700 w-64 p-2 overflow-y-auto">
      <div className="text-gray-900 dark:text-gray-50 font-medium">
        <p className="mb-2">Project Sidebar</p>
        <ul className="space-y-1">
          <li className="text-sm">
            {/* Placeholder items - Real file tree will be implemented later */}
            <span className="block px-2 py-1 rounded hover:bg-gray-300 dark:hover:bg-gray-600 cursor-pointer">
              File/Folder 1
            </span>
            <span className="block px-2 py-1 rounded hover:bg-gray-300 dark:hover:bg-gray-600 cursor-pointer">
              File/Folder 2
            </span>
          </li>
        </ul>
      </div>
    </aside>
  );
};

export default Sidebar;
