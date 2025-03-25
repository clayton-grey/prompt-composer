
/**
 * @file TopBar.tsx
 * @description
 * A simple top bar for the Prompt Composer. Now updated (Step 13) to add a
 * "Copy Prompt" button which retrieves the flattened prompt from context
 * and copies it to the clipboard using the `navigator.clipboard` API.
 *
 * Key Responsibilities:
 *  - Display the application title
 *  - Provide a "Copy Prompt" button
 *  - In future steps, might also have Export/Import XML and Theme toggle
 *
 * @notes
 *  - We rely on usePrompt() -> getFlattenedPrompt() to retrieve the final prompt string
 *  - handleCopy uses try/catch with navigator.clipboard to handle any potential failures
 */

import React from 'react';
import { usePrompt } from '../context/PromptContext';

const TopBar: React.FC = () => {
  const { getFlattenedPrompt } = usePrompt();

  /**
   * Copies the flattened prompt to the clipboard.
   * Logs success or error to the console.
   */
  const handleCopy = async () => {
    try {
      const promptString = getFlattenedPrompt();
      await navigator.clipboard.writeText(promptString);
      console.log('[TopBar] Prompt copied to clipboard!');
    } catch (err) {
      console.error('[TopBar] Failed to copy prompt:', err);
    }
  };

  return (
    <header className="w-full h-14 bg-white dark:bg-gray-800 flex items-center px-4 shadow">
      <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
        Prompt Composer
      </h1>

      {/* Right-aligned container for top bar actions */}
      <div className="ml-auto flex items-center gap-3">
        {/* Copy Prompt Button */}
        <button
          onClick={handleCopy}
          className="px-3 py-1 text-sm rounded bg-blue-500 hover:bg-blue-600 text-white"
        >
          Copy Prompt
        </button>
      </div>
    </header>
  );
};

export default TopBar;
