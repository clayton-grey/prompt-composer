/**
 * @file TemplateBlockEditor.tsx
 * @description
 * Renders a template block's text content in a read-only manner.
 * If desired, we can do a purely VISUAL fix to remove exactly one blank line
 * after placeholders like {{FILE_BLOCK}} or {{TEXT_BLOCK}}, etc.
 *
 * Implementation:
 *  - We define a function "transformForDisplay(originalText)" that splits lines
 *    and, if it sees a line that is purely a placeholder and the next line is blank,
 *    it removes that blank line from the final displayed text.
 *  - This does NOT mutate the block's content. Only modifies what we show to the user.
 *
 * If you do not want any skipping logic, simply remove or comment out the transform step.
 */

import React from 'react';
import { TemplateBlock } from '../../types/Block';

// Regex that matches e.g. {{FILE_BLOCK}}, {{TEXT_BLOCK=...}}, or any single-line placeholder.
const PLACEHOLDER_RE = /^\{\{([A-Za-z0-9_\-]+)(?:=[^}]*)?\}\}$/;

interface TemplateBlockEditorProps {
  block: TemplateBlock;
  onChange: (updatedBlock: TemplateBlock) => void;
}

const TemplateBlockEditor: React.FC<TemplateBlockEditorProps> = ({ block }) => {
  const contentToShow = transformForDisplay(block.content);

  return (
    <div className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-100">
      {contentToShow}
    </div>
  );
};

/**
 * transformForDisplay
 * Splits on newlines, then if line X is a placeholder and line X+1 is blank,
 * remove line X+1. This effectively hides exactly one blank line after the placeholder.
 */
function transformForDisplay(originalText: string): string {
  const lines = originalText.split(/\r?\n/);
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const currentLine = lines[i];
    // Check if it is purely a placeholder
    if (PLACEHOLDER_RE.test(currentLine.trim())) {
      // If next line is blank => skip adding that next line
      if (i + 1 < lines.length && lines[i + 1].trim() === '') {
        // skip the next line
        i++;
      }
    }
    // Always push the current line to result
    result.push(currentLine);
  }

  return result.join('\n');
}

export default TemplateBlockEditor;
