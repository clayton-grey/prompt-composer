/**
 * @file TextBlockEditor.tsx
 * @description
 * An editing interface for a "text" type block. 
 * 
 * Changes:
 *  - Removed the label display and input, as per user request 
 *    ("Remove the labels and type descriptions").
 *  - We keep the content <textarea> for user editing.
 *
 * Step 5 Changes (Accessibility):
 *  - Added aria-label to the <textarea> so screen readers know it is a text block editor.
 */

import React, { ChangeEvent } from 'react';
import { TextBlock } from '../../types/Block';

interface TextBlockEditorProps {
  block: TextBlock;
  onChange: (updatedBlock: TextBlock) => void;
}

const TextBlockEditor: React.FC < TextBlockEditorProps > = ({ block, onChange }) => {
  /**
   * handleContentChange: user edits the text block content
   */
  const handleContentChange = (e: ChangeEvent < HTMLTextAreaElement > ) => {
    onChange({ ...block, content: e.target.value });
  };

  return ( <
    div > { /* We only show the content textarea, no label */ } <
    textarea rows = { 4 } className = "w-full rounded border-gray-300 dark:border-gray-700 dark:bg-gray-700 dark:text-gray-100"
    value = { block.content } onChange = { handleContentChange } placeholder = "Enter text..."
    aria - label = "Text Block Editor" /
    >
    <
    /div>
  );
};

export default TextBlockEditor;
