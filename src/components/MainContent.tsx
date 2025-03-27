
/**
 * @file MainContent.tsx
 * @description
 * The main content area of Prompt Composer. We wrap the PromptBuilder in a
 * flex container so that it can grow/shrink and scroll if needed.
 *
 * Implementation:
 *  - "flex flex-col h-full overflow-hidden" on outer
 *  - Inside, the PromptBuilder can do "flex-1 overflow-auto"
 */

import React from 'react';
import { PromptBuilder } from './PromptBuilder/PromptBuilder';

const MainContent: React.FC = () => {
  return (
    <main className="flex flex-col h-full overflow-hidden">
      <PromptBuilder />
    </main>
  );
};

export default MainContent;
