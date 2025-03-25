
/**
 * @file MainContent.tsx
 * @description
 * The main content area of Prompt Composer. In Step 6, we update this file to
 * include the actual PromptBuilder interface rather than a placeholder.
 *
 * Key Responsibilities:
 *  - Render the PromptBuilder component (the block-based UI)
 *  - Provide a scrolling area for the prompt editing workflow
 *
 * @notes
 *  - We remove the previous placeholder text. Now it hosts the real builder.
 *  - The PromptBuilder handles the core logic for adding blocks.
 */

import React from 'react';
import PromptBuilder from './PromptBuilder/PromptBuilder';

const MainContent: React.FC = () => {
  return (
    <main className="flex-grow bg-gray-100 dark:bg-gray-800 p-4 overflow-auto">
      <PromptBuilder />
    </main>
  );
};

export default MainContent;
