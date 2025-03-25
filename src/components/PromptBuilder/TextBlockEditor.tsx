
/**
 * @file TextBlockEditor.tsx
 * @description
 * Provides an editing interface for a "text" type block. This includes a label
 * field and a multiline text area to edit the block's content.
 *
 * Key Responsibilities:
 *  - Show and update the block's label
 *  - Show and update the block's textual content
 *
 * @notes
 *  - Changes are immediately passed upwards through the onChange callback.
 *  - In a future step, we might add formatting help or advanced editing.
 */

import React, { ChangeEvent } from 'react';
import { TextBlock } from '../../types/Block';

interface TextBlockEditorProps {
  block: TextBlock;
  onChange: (updatedBlock: TextBlock) => void;
}

const TextBlockEditor: React.FC<TextBlockEditorProps> = ({ block, onChange }) => {
  /**
   * Called whenever the label input changes.
   * We clone the block and update the label, then fire onChange.
   */
  const handleLabelChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange({ ...block, label: e.target.value });
  };

  /**
   * Called whenever the content textarea changes.
   */
  const handleContentChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    onChange({ ...block, content: e.target.value });
  };

  return (
    <div className="p-3 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800">
      <div className="mb-2">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
          Label:
        </label>
        <input
          type="text"
          className="w-full rounded border-gray-300 dark:border-gray-700 dark:bg-gray-700 dark:text-gray-100"
          value={block.label}
          onChange={handleLabelChange}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
          Content:
        </label>
        <textarea
          rows={4}
          className="w-full rounded border-gray-300 dark:border-gray-700 dark:bg-gray-700 dark:text-gray-100"
          value={block.content}
          onChange={handleContentChange}
        />
      </div>
    </div>
  );
};

export default TextBlockEditor;
