/**
 * @file TemplateBlockEditor.tsx
 * @description
 * Renders a template block's text content in a read-only manner, with slight blank-line
 * cleanup after placeholders. We also handle leading/trailing blank lines.
 *
 * Step 6 Changes (Fine-Tune Layout & Responsiveness):
 *  - We add the "break-words" utility class so that if there's a very long line or word,
 *    it doesn't overflow horizontally in narrow windows.
 *
 * Implementation details:
 *  - transformForDisplay: If a line has a placeholder, skip the next blank line
 *  - Then trim leading/trailing blank lines from the entire final text
 */

import React from 'react';
import { TemplateBlock } from '../../types/Block';

/**
 * Regex to detect placeholders in a line, e.g. {{FILE_BLOCK}}, {{TEXT_BLOCK=stuff}}, etc.
 */
const PLACEHOLDER_ANYWHERE = /\{\{[A-Za-z0-9_\-]+(?:=[^}]*)?\}\}/;

interface TemplateBlockEditorProps {
  block: TemplateBlock;
}

const TemplateBlockEditor: React.FC<TemplateBlockEditorProps> = ({ block }) => {
  const displayedText = transformForDisplay(block.content);

  return (
    <div className="whitespace-pre-wrap break-words text-sm text-gray-800 dark:text-gray-100">
      {displayedText}
    </div>
  );
};

/**
 * transformForDisplay
 * 1) Splits text into lines
 * 2) For each line, if it has a placeholder anywhere, skip the next line if blank
 * 3) Rejoin
 * 4) Strip leading blank lines and trailing blank lines from final
 */
function transformForDisplay(originalText: string): string {
  // Split on CRLF or LF
  const lines = originalText.split(/\r?\n/);
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const currentLine = lines[i];
    const trimmedLine = currentLine.trim();

    // Check if line has a placeholder
    if (PLACEHOLDER_ANYWHERE.test(trimmedLine)) {
      // If next line is blank => skip it
      if (i + 1 < lines.length && lines[i + 1].trim() === '') {
        i++;
      }
    }
    result.push(currentLine);
  }

  let finalText = result.join('\n');

  // Remove leading blank lines
  finalText = finalText.replace(/^(?:[ \t]*\r?\n)+/, '');
  // Remove trailing blank lines
  finalText = finalText.replace(/(?:\r?\n[ \t]*)+$/, '');

  return finalText;
}

export default TemplateBlockEditor;
