/**
 * @file MainContent.tsx
 * @description
 * The main content area of Prompt Composer. For now, it's just a placeholder
 * demonstrating layout. In future steps, we'll integrate the Prompt Builder
 * components (Block Editors, etc.) here.
 *
 * Key Responsibilities:
 *  - Provide space where prompt blocks, text editors, and file block previews
 *    will appear
 *
 * @notes
 *  - Step 4 focuses on layout only; the real functionality will follow in
 *    subsequent steps.
 */

import React from 'react';

const MainContent: React.FC = () => {
  return (
    <main className="flex-grow bg-gray-100 dark:bg-gray-800 p-4 overflow-auto">
      <div className="text-gray-800 dark:text-gray-100">
        <h2 className="text-lg font-semibold mb-2">Main Content Area</h2>
        <p className="text-sm">
          This is where prompt blocks and editing interfaces will go.
        </p>
      </div>
    </main>
  );
};

export default MainContent;
