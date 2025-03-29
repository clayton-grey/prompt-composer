/**
 * @file PromptResponseBlockEditor.tsx
 * @description
 * Allows the user to view and edit text for a {{PROMPT_RESPONSE=filename.txt}} block.
 * In this version, we've adapted the text area to auto-resize just like TextBlockEditor
 * rather than show an internal scrollbar.
 *
 * Implementation:
 *  1) Create a `textareaRef` which references the <textarea>.
 *  2) On each render and content change, adjust the textarea's height to 'auto', then read
 *     its `scrollHeight` and set that as the new height (auto-resizing).
 *  3) Use `break-words` and `whitespace-pre-wrap` to ensure that very long lines wrap properly
 *     and do not overflow horizontally.
 *  4) We still preserve the bullet checkbox toggling for read-only mode (locked state),
 *     while fully editable in unlocked state.
 *
 * Key changes from previous version:
 *  - The <textarea> no longer scrolls internally; it grows vertically as the user types.
 *  - We added `handleResize` logic, called on input changes or content updates.
 *
 * Behavior:
 *  - If the block is locked, we show read-only text with optional bullet checkboxes toggles.
 *  - If unlocked, the user can edit text in a self-resizing <textarea> (just like TextBlockEditor).
 *  - We still support toggling lock/unlock via the button, updating the .prompt-composer file after changes.
 *
 * Edge Cases:
 *  - If user types extremely large amounts of text, the <textarea> can grow to a large height. This is intended.
 *  - For bullet toggles, we only allow them if the block is locked but not raw editing (and canToggleCheckboxes is true).
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { PromptResponseBlock, Block } from '../../types/Block';
import { usePrompt } from '../../context/PromptContext';
import { useToast } from '../../context/ToastContext';

interface PromptResponseBlockEditorProps {
  block: PromptResponseBlock;
  onChange: (updatedBlock: Block) => void;
}

/**
 * Regex matching bullet checkboxes:
 *  - e.g. "- [ ] Some text" or "- [X] Some text"
 *  - group(1) => the space or 'X'
 */
const CHECKBOX_PATTERN = /- \[([ xX])\]/g;

/**
 * Debounce constant for writes to disk (500ms).
 */
const DEBOUNCE_MS = 500;

const PromptResponseBlockEditor: React.FC<PromptResponseBlockEditorProps> = ({
  block,
  onChange,
}) => {
  const { blocks, updateBlock } = usePrompt();
  const { showToast } = useToast();

  const [localContent, setLocalContent] = useState<string>(block.content || '');

  // We use a ref to track the timer for debounce
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  // For auto-resizing text area
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);

  // Determine if the parent group is raw editing
  const isParentRawEditing = isParentGroupInRawEdit(block, blocks);

  // If block is unlocked AND not raw editing => user can fully edit text
  const canEditFully = !block.locked && !isParentRawEditing;

  // If block is locked but not raw editing => read-only text, but we can still toggle checkboxes
  const canToggleCheckboxes = !isParentRawEditing && block.locked;

  useEffect(() => {
    // Sync external block content changes => localContent
    if (block.content !== localContent) {
      setLocalContent(block.content);
    }
  }, [block.content, localContent]);

  useEffect(() => {
    // Whenever localContent changes, auto-resize
    if (canEditFully) {
      handleResizeTextArea();
    }
  }, [localContent, canEditFully]);

  /**
   * Writes updated content to .prompt-composer, updates block in context
   */
  const persistChanges = useCallback(
    (newVal: string) => {
      const updated: PromptResponseBlock = {
        ...block,
        content: newVal,
      };
      updateBlock(updated);

      // If electronAPI is present, write to .prompt-composer
      const electronAPI = (window as any).electronAPI;
      if (electronAPI && electronAPI.writePromptComposerFile) {
        electronAPI
          .writePromptComposerFile({
            relativeFilename: block.sourceFile,
            content: newVal,
          })
          .then((result: any) => {
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
   * Toggles the locked property (locked <-> unlocked)
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
   * For bullet toggles in read-only mode. We replace [ ] with [X] or vice versa.
   */
  const handleCheckboxToggle = (lineIndex: number, matchIndex: number, oldVal: string) => {
    if (!canToggleCheckboxes) return;

    const newVal = oldVal === ' ' ? 'X' : ' ';
    const lines = localContent.split('\n');
    if (lineIndex < 0 || lineIndex >= lines.length) return;

    let occurrences = 0;
    const updatedLine = lines[lineIndex].replace(CHECKBOX_PATTERN, (fullMatch, group1) => {
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
   * Splits a line into segments, rendering normal text but converting each "- [ ]" or "- [X]" to a checkbox
   */
  const parseCheckboxLine = (line: string, lineIndex: number): React.ReactNode => {
    const segments: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let matchCount = 0;

    const pattern = new RegExp(CHECKBOX_PATTERN, 'g');

    while ((match = pattern.exec(line)) !== null) {
      const start = match.index;
      const end = start + match[0].length;

      // push text before the match
      if (start > lastIndex) {
        const beforeText = line.substring(lastIndex, start);
        segments.push(<span key={`txt-${start}`}>{beforeText}</span>);
      }

      const oldValLocal = match[1]; // ' ' or 'x'/'X'
      const isChecked = oldValLocal.toUpperCase() === 'X';

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

    // remainder
    if (lastIndex < line.length) {
      const remainder = line.substring(lastIndex);
      segments.push(<span key={`end-${lastIndex}`}>{remainder}</span>);
    }

    return <div>{segments}</div>;
  };

  /**
   * renderReadOnlyContent
   * We display text line by line, toggling bullet checkboxes if present.
   * Use break-words so it doesn't overflow on narrow screens.
   */
  const renderReadOnlyContent = () => {
    const lines = localContent.split('\n');
    return (
      <div className="flex flex-col space-y-1 text-sm text-gray-700 dark:text-gray-100 whitespace-pre-wrap break-words">
        {lines.map((line, idx) => (
          <div key={idx} className="leading-snug">
            {parseCheckboxLine(line, idx)}
          </div>
        ))}
      </div>
    );
  };

  /**
   * handleResizeTextArea
   * The auto-resizing logic for the editable <textarea>.
   */
  const handleResizeTextArea = () => {
    const el = textAreaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  return (
    <div className="border-4 border-dashed border-gray-500 rounded p-3 mb-2">
      <div className="text-sm text-gray-800 dark:text-gray-100 space-y-2">
        {/* Header row: label + filename + lock/unlock */}
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
                // locked icon
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
                // unlocked icon
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

        {canEditFully ? (
          // Editable text area (auto-resizing)
          <textarea
            ref={textAreaRef}
            rows={1}
            className="w-full text-sm rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 p-2 resize-none whitespace-pre-wrap break-words overflow-hidden"
            placeholder="Type your response..."
            value={localContent}
            onChange={handleFullTextChange}
            onInput={handleResizeTextArea}
            aria-label="Prompt Response Editor"
          />
        ) : (
          // Read-only content w/ bullet toggles
          renderReadOnlyContent()
        )}
      </div>
    </div>
  );
};

/**
 * isParentGroupInRawEdit
 * Check if the parent template group is in raw edit mode, disabling all user edits.
 */
function isParentGroupInRawEdit(block: PromptResponseBlock, allBlocks: Block[]): boolean {
  if (!block.groupId) return false;
  const lead = allBlocks.find(b => b.groupId === block.groupId && b.isGroupLead);
  if (!lead) return false;
  return lead.editingRaw === true;
}

export default PromptResponseBlockEditor;
