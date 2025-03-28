
/**
 * @file PromptPreview.tsx
 * @description
 * A component that displays a real-time or on-demand preview of the flattened prompt.
 * 
 * In this update (Step 5a), we remove the top margin to ensure it fits snugly in the new
 * resizable container. We also ensure the preview is scrollable if the text is large.
 */

import React, { useEffect, useState } from 'react';
import { usePrompt } from '../../context/PromptContext';

const PromptPreview: React.FC = () => {
  const { blocks, getFlattenedPrompt } = usePrompt();
  const [previewText, setPreviewText] = useState<string>('Loading...');

  useEffect(() => {
    let isMounted = true;

    const fetchPreview = async () => {
      try {
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
    <div className="h-full w-full px-4 py-2 overflow-auto">
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
