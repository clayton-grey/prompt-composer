
/**
 * @file PromptPreview.tsx
 * @description
 * A component that displays a real-time (or on-demand) preview of the
 * flattened prompt. Previously, it might have imported 'flattenBlocks'
 * directly. Now we rely on the context's async 'getFlattenedPrompt()'.
 *
 * Implementation:
 *  1) We fetch the prompt via getFlattenedPrompt() from PromptContext.
 *  2) We store it in local state, so the user can see the fully flattened text.
 *  3) We watch for changes in the blocks array (or a refresh trigger) and re-fetch if needed.
 *
 * Notes:
 *  - This is a simple read-only preview of the final prompt text,
 *    for convenience in the UI.
 *  - If you need frequent/real-time updates, you can watch the entire block
 *    structure and re-run the flatten logic as the user edits blocks.
 */

import React, { useEffect, useState } from 'react';
import { usePrompt } from '../../context/PromptContext';

const PromptPreview: React.FC = () => {
  const { blocks, getFlattenedPrompt } = usePrompt();
  const [previewText, setPreviewText] = useState<string>('Loading...');

  /**
   * Whenever the 'blocks' array changes, we re-fetch the flattened prompt
   */
  useEffect(() => {
    let isMounted = true;

    const fetchPreview = async () => {
      try {
        // Call our async context method
        const flattened = await getFlattenedPrompt();
        if (isMounted) {
          setPreviewText(flattened);
        }
      } catch (error) {
        console.error('[PromptPreview] Failed to flatten prompt:', error);
        if (isMounted) {
          setPreviewText('(Error flattening prompt)');
        }
      }
    };

    fetchPreview();

    return () => {
      isMounted = false;
    };
  }, [blocks, getFlattenedPrompt]);

  return (
    <div className="mt-4 p-4 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 rounded">
      <h3 className="text-md font-semibold mb-2 text-gray-700 dark:text-gray-200">
        Prompt Preview
      </h3>
      <pre className="text-sm whitespace-pre-wrap break-words text-gray-800 dark:text-gray-100">
        {previewText}
      </pre>
    </div>
  );
};

export default PromptPreview;
