/**
 * @file TextBlockEditor.tsx
 * @description
 * Renders a text block as a textarea that the user can type in. Includes auto-resizing logic
 * so it grows to fit content without an internal scrollbar.
 *
 * Step 6 Changes (Fine-Tune Layout & Responsiveness):
 *  - We add "break-words" to ensure extremely long words do not overflow horizontally.
 *
 * Implementation details:
 *  1) On each change, we set the textarea to 'auto' height, then measure scrollHeight,
 *     then set the height to that scrollHeight.
 *  2) "break-words" helps avoid horizontal scrolling if the user types a single unbroken string.
 *
 * Key features:
 *  - Self-resizing, minimal styling
 *  - Full "whitespace-pre-wrap" & "break-words" approach to ensure comfortable text entry on smaller screens
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
    // Then set it to the scrollHeight
    el.style.height = `${el.scrollHeight}px`;
  };

  // Recalc height whenever the block content changes
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
      className="w-full text-sm rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 p-2 overflow-hidden resize-none whitespace-pre-wrap break-words"
      value={block.content}
      onChange={handleContentChange}
      onInput={handleInput}
      placeholder="Enter text..."
      aria-label="Text Block Editor"
    />
  );
};

export default TextBlockEditor;
