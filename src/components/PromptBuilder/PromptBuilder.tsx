/**
 * @file PromptBuilder.tsx
 * @description
 * Main UI for building and editing prompts. Now updated so that if no blocks
 * are loaded (meaning no template is active), we display a new TemplateListView
 * component in the main content area. This lets the user pick from the available
 * templates discovered in the project/global .prompt-composer directories.
 *
 * Implementation:
 *  - We import TemplateListView from './TemplateListView'.
 *  - In our render logic, if blocks.length === 0, we show <TemplateListView />;
 *    otherwise, we show the existing BlockList. This ensures the user can pick a
 *    template if none is currently loaded.
 *
 * Refs:
 *  - The usage of parseTemplateBlocksAsync is done inside TemplateListView (or
 *    the user can do so once the user selects from the scrollable list).
 *
 * Note:
 *  - We do not remove the concept of the top row label (Prompt Builder), as we
 *    still want that. The main difference is that the central content area is
 *    replaced with a "pick a template" screen if empty.
 */

import React from 'react';
import { usePrompt } from '../../context/PromptContext';
import BlockList from './BlockList';
import TemplateListView from './TemplateListView';

export const PromptBuilder: React.FC = () => {
  const { blocks } = usePrompt();

  const hasBlocks = blocks.length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header row */}
      <div className="flex justify-between items-center p-4 border-b dark:border-gray-600">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Prompt Builder</h2>
      </div>

      {/* Main content area */}
      <div className="flex-1 overflow-hidden bg-gray-100 dark:bg-gray-800 flex flex-col">
        <div className="flex-1 overflow-auto p-4">
          {hasBlocks ? <BlockList /> : <TemplateListView />}
        </div>
      </div>
    </div>
  );
};

export default PromptBuilder;
