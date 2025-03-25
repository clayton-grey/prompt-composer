/**
 * @file TopBar.tsx
 * @description
 * A simple top bar component for the Prompt Composer. Displays the application
 * title and (in later steps) icons or buttons for theme toggles, export, etc.
 *
 * Key Responsibilities:
 *  - Provide a consistent header across the application
 *  - Placeholder for future toolbar features (XML import/export, copy, etc.)
 *
 * @notes
 *  - Tailwind classes used for basic styling
 *  - In future steps, we might add more interactive elements
 */

import React from 'react';

const TopBar: React.FC = () => {
  return (
    <header className="w-full h-14 bg-white dark:bg-gray-800 flex items-center px-4 shadow">
      <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
        Prompt Composer
      </h1>
    </header>
  );
};

export default TopBar;
