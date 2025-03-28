/**
 * @file TemplateBlockEditor.tsx
 * @description
 * Renders a template block's text content in a read-only manner, applying a
 * purely UI-based transform:
 *   1) Skip exactly one blank line after a line that has a placeholder (like {{FILE_BLOCK}}).
 *   2) Trim leading and trailing blank lines from the entire final text.
 *
 * This way, you don't see an extra newline at the start or end, or a blank line
 * immediately after a placeholder.
 *
 * Implementation details:
 *  - We split block.content into lines with split(/\r?\n/).
 *  - For each line i, if lineHasPlaceholder(trimmed), then if line i+1 is blank, skip it.
 *  - Then join the lines with '\n'.
 *  - Then remove leading blank lines (using a regex) and trailing blank lines (same).
 *  - Return that final string. We do not modify the actual block content in context.
 */

import React from 'react';
import { TemplateBlock } from '../../types/Block';

/**
 * Regex to detect placeholders in a line, e.g. {{FILE_BLOCK}}, {{TEXT_BLOCK=stuff}}, etc.
 * We'll detect them anywhere in the line.
 */
const PLACEHOLDER_ANYWHERE = /\{\{[A-Za-z0-9_\-]+(?:=[^}]*)?\}\}/;

interface TemplateBlockEditorProps {
  block: TemplateBlock;
}

const TemplateBlockEditor: React.FC<TemplateBlockEditorProps> = ({ block }) => {
  const displayedText = transformForDisplay(block.content);

  return (
    <div className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-100">
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
 *
 * @param originalText - The original block content with all newlines.
 * @returns The final display string with certain blank lines removed
 */
function transformForDisplay(originalText: string): string {
  // Split on CRLF or LF
  const lines = originalText.split(/\r?\n/);
  const result: string[] = [];

  // console.log('[TemplateBlockEditor] transformForDisplay: original lines count =', lines.length);

  for (let i = 0; i < lines.length; i++) {
    const currentLine = lines[i];
    const trimmedLine = currentLine.trim();

    // Check if line has a placeholder
    if (PLACEHOLDER_ANYWHERE.test(trimmedLine)) {
      // If next line is blank => skip it
      if (i + 1 < lines.length && lines[i + 1].trim() === '') {
        // console.log(`Skipping blank line after line index=${i}`);
        i++;
      }
    }
    result.push(currentLine);
  }

  // Join them back
  let finalText = result.join('\n');

  // Remove leading blank lines (any number):
  // This regex means: start of string ^, then any number of whitespace or newlines, repeated
  // We'll do a bit more direct approach with "^\s*(\r?\n)+" => let's do simpler
  finalText = finalText.replace(/^(?:[ \t]*\r?\n)+/, '');
  // Remove trailing blank lines:
  finalText = finalText.replace(/(?:\r?\n[ \t]*)+$/, '');

  const finalLines = finalText.split('\n');
  // console.log('[TemplateBlockEditor] transformForDisplay: final lines count =', finalLines.length);
  return finalText;
}

export default TemplateBlockEditor;
