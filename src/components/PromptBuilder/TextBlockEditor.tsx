/**
 * @file TextBlockEditor.tsx
 * @description
 * Renders a text block as a textarea the user can type in. We now add auto-resizing logic
 * so that it grows to fit its content, showing all lines without an internal scrollbar.
 *
 * Implementation details:
 *  1) We keep a ref to the <textarea>.
 *  2) On each change (and initial mount), we set the height to 'auto', then set it to scrollHeight.
 *  3) We style the textarea with `overflow-hidden` to avoid an inner scrollbar.
 *  4) That means if the user types 50 lines, the textarea becomes 50 lines tall.
 */

import React, { ChangeEvent, useRef, useEffect } from 'react';
import { TextBlock } from '../../types/Block';

interface TextBlockEditorProps {
  block: TextBlock;
  onChange: (updatedBlock: TextBlock) => void;
}

const TextBlockEditor: React.FC<TextBlockEditorProps> = ({ block, onChange }) => {
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-resize logic
  const resizeTextArea = () => {
    const el = textAreaRef.current;
    if (!el) return;
    // Temporarily reset the height to 'auto' so the scrollHeight is correct
    el.style.height = 'auto';
    // Set it to the scrollHeight
    el.style.height = `${el.scrollHeight}px`;
  };

  // On each render or content change, ensure we recalc the height
  useEffect(() => {
    resizeTextArea();
  }, [block.content]);

  const handleContentChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    onChange({ ...block, content: e.target.value });
  };

  const handleInput = () => {
    resizeTextArea();
  };

  return (
    <textarea
      ref={textAreaRef}
      rows={1}
      className="w-full text-sm rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 p-2 overflow-hidden resize-none"
      value={block.content}
      onChange={handleContentChange}
      onInput={handleInput}
      placeholder="Enter text..."
      aria-label="Text Block Editor"
    />
  );
};

export default TextBlockEditor;
