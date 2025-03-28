/**
 * @file BottomBar.tsx
 * @description
 * A bottom bar component for displaying token usage, warnings, or other
 * status indicators. Now updated to reflect real token usage from the
 * PromptContext.
 *
 * Key Responsibilities:
 *  - Show real-time token usage (total) vs. maxTokens
 *  - Highlight a warning if usage exceeds maxTokens
 *  - Potentially add additional status info in the future
 *
 * @notes
 *  - The "tokenUsage" is updated automatically by the context whenever blocks change.
 *  - If totalTokens > settings.maxTokens, we show a red highlight or text.
 */

import React from 'react';
import { usePrompt } from '../context/PromptContext';

const BottomBar: React.FC = () => {
  const { tokenUsage, settings } = usePrompt();
  const { totalTokens } = tokenUsage;
  const { maxTokens } = settings;

  // Determine if we're over the limit
  const isOverLimit = totalTokens > maxTokens;
  const barBgColor = isOverLimit ? 'bg-red-100 dark:bg-red-800' : 'bg-white dark:bg-gray-800';
  const textColor = isOverLimit
    ? 'text-red-600 dark:text-red-300 font-semibold'
    : 'text-gray-700 dark:text-gray-300';

  return (
    <footer className={`w-full h-10 flex items-center justify-between px-4 shadow ${barBgColor}`}>
      {/* Token usage display */}
      <span className={`text-sm ${textColor}`}>
        Token usage: {totalTokens} / {maxTokens}
      </span>

      {/* Status text */}
      {isOverLimit ? (
        <span className={`text-sm ${textColor}`}>Over token limit!</span>
      ) : (
        <span className="text-sm text-gray-700 dark:text-gray-300">Within limit</span>
      )}
    </footer>
  );
};

export default BottomBar;
