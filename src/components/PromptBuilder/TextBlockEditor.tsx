/**
 * @file TextBlockEditor.tsx
 * @description
 * Renders a text block as a text area the user can type in. We add a small padding ("p-2")
 * inside the text area for comfort.
 */

import React, { ChangeEvent } from 'react';
import { TextBlock } from '../../types/Block';

interface TextBlockEditorProps {
  block: TextBlock;
  onChange: (updatedBlock: TextBlock) => void;
}

const TextBlockEditor: React.FC<TextBlockEditorProps> = ({ block, onChange }) => {
  const handleContentChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    onChange({ ...block, content: e.target.value });
  };

  return (
    <textarea
      rows={4}
      className="w-full text-sm rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 p-2"
      value={block.content}
      onChange={handleContentChange}
      placeholder="Enter text..."
      aria-label="Text Block Editor"
    />
  );
};

export default TextBlockEditor;
