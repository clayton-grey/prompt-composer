/**
 * @file PromptResponseBlockEditor.tsx
 * @description
 * Renders a dotted outline block for the {{PROMPT_RESPONSE=fileName.txt}} tag. Allows toggling
 * of bullet-style checkboxes even if locked, but no other text edits when locked. We also
 * switch between lock/unlock states with a button.
 *
 * Accessibility Improvements (Step 5):
 *  - Added a `title` and `aria-label` for the lock/unlock button for screen readers.
 *  - Minor updates to ensure better clarity for keyboard and screen reader users.
 *
 * Implementation details:
 *  - The text area is editable only if `block.locked === false` and the parent group is not in raw edit mode.
 *  - If locked, user can still toggle bullet checkboxes (like - [ ] ) unless we are in raw edit mode.
 *  - Debounced saving to .prompt-composer file via electronAPI.
 *
 * @notes
 * - We ensure an aria-label or title is present on interactive elements for accessibility.
 */

/// <reference path="../../types/electron.d.ts" />
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { PromptResponseBlock, Block } from '../../types/Block';
import { usePrompt } from '../../context/PromptContext';
import { useToast } from '../../context/ToastContext';

interface PromptResponseBlockEditorProps {
  block: PromptResponseBlock;
  onChange: (updatedBlock: Block) => void;
}

const DEBOUNCE_MS = 500;

/**
 * Regex matching bullet checkboxes:
 *  - e.g. "- [ ] Some text" or "- [X] Some text"
 *  - group(1) => the space or 'X'
 */
const CHECKBOX_PATTERN = /- \[([ xX])\]/g;

const PromptResponseBlockEditor: React.FC<PromptResponseBlockEditorProps> = ({
  block,
  onChange,
}) => {
  const { blocks, updateBlock } = usePrompt();
  const { showToast } = useToast();
  const [localContent, setLocalContent] = useState<string>(block.content || '');
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  // If the parent group is in raw edit mode, we disable all interactions
  const isParentRawEditing = isParentGroupInRawEdit(block, blocks);

  // If block is unlocked AND not raw editing => user can freely edit the entire text
  const canEditFully = !block.locked && !isParentRawEditing;

  // If block is locked but not raw editing => user sees read-only text, but can toggle checkboxes
  const canToggleCheckboxes = !isParentRawEditing;

  useEffect(() => {
    // If the block content changes externally, sync to localContent
    if (block.content !== localContent) {
      setLocalContent(block.content);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.content]);

  /**
   * Writes the updated content to the .prompt-composer file,
   * updates the block in context
   */
  const persistChanges = useCallback(
    (newVal: string) => {
      const updated: PromptResponseBlock = {
        ...block,
        content: newVal,
      };
      updateBlock(updated);

      // Use type assertion to access electronAPI
      const electronAPI = (window as any).electronAPI;
      if (electronAPI && electronAPI.writePromptComposerFile) {
        electronAPI
          .writePromptComposerFile({
            relativeFilename: block.sourceFile,
            content: newVal,
          })
          .then((result: any) => {
            // Check if the result has an error property
            if (result && typeof result === 'object' && 'error' in result) {
              showToast(`Could not write to prompt-composer file: ${result.error}`, 'error');
              console.error('[PromptResponseBlockEditor] Failed to write file:', result.error);
            }
          })
          .catch((err: any) => {
            console.error('[PromptResponseBlockEditor] Failed to write file:', err);
            showToast(`Could not write to prompt-composer file: ${block.sourceFile}`, 'error');
          });
      }
    },
    [block, updateBlock, showToast]
  );

  /**
   * handleFullTextChange
   * Called when user types in the <textarea> (unlocked mode)
   */
  const handleFullTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newVal = e.target.value;
    setLocalContent(newVal);

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    debounceTimer.current = setTimeout(() => {
      persistChanges(newVal);
    }, DEBOUNCE_MS);
  };

  /**
   * handleToggleLocked
   * Toggles the locked property (locked <-> unlocked).
   */
  const handleToggleLocked = () => {
    const updated: PromptResponseBlock = {
      ...block,
      locked: !block.locked,
    };
    updateBlock(updated);
  };

  /**
   * handleCheckboxToggle
   * Called when user toggles a bullet checkbox in read-only mode.
   * We find the correct occurrence in the line and replace [ ] with [X] or vice versa.
   */
  const handleCheckboxToggle = (lineIndex: number, matchIndex: number, oldVal: string) => {
    if (!canToggleCheckboxes) return;

    const newVal = oldVal === ' ' ? 'X' : ' ';
    const lines = localContent.split('\n');
    if (lineIndex < 0 || lineIndex >= lines.length) return;

    const line = lines[lineIndex];

    let occurrences = 0;
    const updatedLine = line.replace(CHECKBOX_PATTERN, (fullMatch, group1) => {
      if (occurrences === matchIndex) {
        occurrences++;
        return `- [${newVal}]`;
      } else {
        occurrences++;
        return fullMatch;
      }
    });

    lines[lineIndex] = updatedLine;
    const updatedContent = lines.join('\n');
    setLocalContent(updatedContent);

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    debounceTimer.current = setTimeout(() => {
      persistChanges(updatedContent);
    }, DEBOUNCE_MS);
  };

  /**
   * parseCheckboxLine
   * Splits a line into segments, rendering text normally,
   * but each occurrence of "- [ ]" / "- [X]" is turned into a checkbox.
   */
  const parseCheckboxLine = (line: string, lineIndex: number): React.ReactNode => {
    const segments: React.ReactNode[] = [];

    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let matchCount = 0; // index of the match in this line

    const pattern = new RegExp(CHECKBOX_PATTERN, 'g');

    while ((match = pattern.exec(line)) !== null) {
      const start = match.index;
      const end = start + match[0].length;

      // push text before this match
      if (start > lastIndex) {
        const beforeText = line.substring(lastIndex, start);
        segments.push(<span key={`txt-${start}`}>{beforeText}</span>);
      }

      const oldValLocal = match[1]; // ' ' or 'x'/'X'
      const isChecked = oldValLocal.toUpperCase() === 'X';

      // store local copy of matchCount so each checkbox has stable data
      const localMatchIndex = matchCount;
      const handleChange = () => {
        handleCheckboxToggle(lineIndex, localMatchIndex, oldValLocal);
      };

      segments.push(
        <span key={`cb-${start}`} className="inline-flex items-center">
          <span>- </span>
          <input
            type="checkbox"
            className="mx-1"
            checked={isChecked}
            onChange={handleChange}
            disabled={!canToggleCheckboxes}
          />
        </span>
      );

      matchCount++;
      lastIndex = end;
    }

    // push remainder
    if (lastIndex < line.length) {
      const remainder = line.substring(lastIndex);
      segments.push(<span key={`end-${lastIndex}`}>{remainder}</span>);
    }

    return <div>{segments}</div>;
  };

  /**
   * renderReadOnlyContent
   * We render the entire text, line by line. Each line can contain bullet checkboxes.
   */
  const renderReadOnlyContent = () => {
    const lines = localContent.split('\n');
    return (
      <div className="flex flex-col space-y-1 text-sm text-gray-700 dark:text-gray-100 whitespace-pre-wrap">
        {lines.map((line, idx) => (
          <div key={idx} className="leading-snug">
            {parseCheckboxLine(line, idx)}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="border-4 border-dashed border-gray-500 rounded p-3 mb-2">
      <div className="text-sm text-gray-800 dark:text-gray-100 space-y-2">
        {/* Header row: label + file name + lock/unlock button if not raw editing */}
        <div className="flex items-center justify-between">
          <span className="font-semibold">
            Prompt Response Block: <span className="italic">{block.sourceFile}</span>
          </span>

          {!isParentRawEditing && (
            <button
              type="button"
              onClick={handleToggleLocked}
              className="p-1 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
              title="Toggle lock"
              aria-label="Toggle lock"
            >
              {block.locked ? (
                /* Locked icon */
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="lucide lucide-lock-icon lucide-lock w-5 h-5"
                  aria-hidden="true"
                >
                  <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              ) : (
                /* Unlocked icon */
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="lucide lucide-lock-open-icon lucide-lock-open w-5 h-5"
                  aria-hidden="true"
                >
                  <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                </svg>
              )}
            </button>
          )}
        </div>

        {/* Main content area */}
        {canEditFully ? (
          <textarea
            rows={8}
            className="w-full text-sm rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 p-2 resize-none"
            placeholder="Type your response..."
            value={localContent}
            onChange={handleFullTextChange}
            aria-label="Prompt Response Editor"
          />
        ) : (
          // Read-only mode (locked or raw editing) => parse lines for checkboxes
          renderReadOnlyContent()
        )}
      </div>
    </div>
  );
};

/**
 * Checks if the parent group is in raw editing mode, which means we disable all user edits.
 */
function isParentGroupInRawEdit(block: PromptResponseBlock, allBlocks: Block[]): boolean {
  if (!block.groupId) return false;
  const lead = allBlocks.find(b => b.groupId === block.groupId && b.isGroupLead);
  if (!lead) return false;
  return lead.editingRaw === true;
}

export default PromptResponseBlockEditor;
