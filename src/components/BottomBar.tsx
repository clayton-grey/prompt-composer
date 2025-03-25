/**
 * @file BottomBar.tsx
 * @description
 * A bottom bar component for displaying token usage, warnings, or other
 * status indicators. In future steps, it will show dynamic token counts
 * and limits.
 *
 * Key Responsibilities:
 *  - Serve as a status/info panel for the user
 *  - Provide a place to show real-time token usage or other metrics
 *
 * @notes
 *  - Step 4 uses static placeholder text
 *  - Dynamic functionality will be added later
 */

import React from 'react';

const BottomBar: React.FC = () => {
  return (
    <footer className="w-full h-10 bg-white dark:bg-gray-800 flex items-center justify-between px-4 shadow">
      <span className="text-sm text-gray-700 dark:text-gray-300">
        Token usage: 0 / 8000
      </span>
      <span className="text-sm text-gray-700 dark:text-gray-300">
        Status: OK
      </span>
    </footer>
  );
};

export default BottomBar;
