/**
 * @file PromptResponseBlockEditor.tsx
 * @description
 * Allows the user to view and edit text for a {{PROMPT_RESPONSE=filename.txt}} block.
 * In this file, we unify error handling for file writes (persistChanges) with
 * toasts, removing direct console.warn in production. We keep dev logs behind
 * an environment check.
 *
 * Step 5 (Centralize & Enhance Error Handling):
 *  - Removed leftover console.warn calls in production pathways. Instead, we rely on showToast
 *    and only log to console in dev if needed.
 *  - Ensured meaningful error toasts appear if writing fails (already done).
 *
 * Implementation details remain the same; we only altered the error logging approach.
 */

import React, { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
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

const PromptResponseBlockEditor: React.FC<PromptResponseBlockEditorProps> = ({
  block,
  onChange,
}) => {
  const { blocks, updateBlock } = usePrompt();
  const { showToast } = useToast();

  const originalContentRef = useRef<string>(block.content || '');
  const initializedRef = useRef<boolean>(false);
  const previousBlockIdRef = useRef<string | null>(null);

  const [localContent, setLocalContent] = useState<string>(block.content || '');

  useEffect(() => {
    // Check if block ID changed => new block => reset original content
    const blockIdChanged = previousBlockIdRef.current !== block.id;
    if (!initializedRef.current || blockIdChanged) {
      originalContentRef.current = block.content || '';
      setLocalContent(block.content || '');
      initializedRef.current = true;
      previousBlockIdRef.current = block.id;
    }
  }, [block.id, block.content]);

  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);

  const isParentRawEditing = isParentGroupInRawEdit(block, blocks);
  const canEditFully = !block.locked && !isParentRawEditing;
  const canToggleCheckboxes = !isParentRawEditing && block.locked;

  const handleResizeTextArea = useCallback(() => {
    const textarea = textAreaRef.current;
    if (!textarea) return;

    const isActive = document.activeElement === textarea;
    const cursorStart = isActive ? textarea.selectionStart : null;
    const cursorEnd = isActive ? textarea.selectionEnd : null;
    const scrollTop = textarea.scrollTop;

    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;

    if (isActive && cursorStart !== null && cursorEnd !== null) {
      textarea.setSelectionRange(cursorStart, cursorEnd);
      textarea.scrollTop = scrollTop;
    }
  }, []);

  useLayoutEffect(() => {
    if (canEditFully && textAreaRef.current) {
      handleResizeTextArea();
    }
  }, [canEditFully, handleResizeTextArea]);

  useEffect(() => {
    if (canEditFully) {
      handleResizeTextArea();
    }
  }, [localContent, canEditFully, handleResizeTextArea]);

  /**
   * Writes updated content to disk
   */
  const persistChanges = useCallback(
    (newVal: string) => {
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI?.writePromptComposerFile) {
        showToast(`Cannot save: electronAPI.writePromptComposerFile not available.`, 'error');
        if (process.env.NODE_ENV === 'development') {
          console.error(
            '[PromptResponseBlockEditor] electronAPI.writePromptComposerFile not found.'
          );
        }
        return;
      }

      electronAPI
        .writePromptComposerFile({
          relativeFilename: block.sourceFile,
          content: newVal,
        })
        .then((result: any) => {
          if (result && typeof result === 'object' && 'error' in result) {
            showToast(`Could not write to .prompt-composer file: ${result.error}`, 'error');
            if (process.env.NODE_ENV === 'development') {
              console.error('[PromptResponseBlockEditor] Write error object:', result.error);
            }
          }
        })
        .catch((err: unknown) => {
          showToast(`Could not write to .prompt-composer file: ${block.sourceFile}`, 'error');
          if (process.env.NODE_ENV === 'development') {
            console.error('[PromptResponseBlockEditor] Write error:', err);
          }
        });
    },
    [block.sourceFile, showToast]
  );

  const handleFullTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newVal = e.target.value;
    const cursorPos = e.target.selectionStart;
    const cursorEnd = e.target.selectionEnd;

    setLocalContent(newVal);

    requestAnimationFrame(() => {
      if (textAreaRef.current && document.activeElement === textAreaRef.current) {
        handleResizeTextArea();
        textAreaRef.current.setSelectionRange(cursorPos, cursorEnd);
      }
    });

    const updatedBlock: PromptResponseBlock = {
      ...block,
      content: newVal,
    };
    updateBlock(updatedBlock);
  };

  const handleToggleLocked = () => {
    const newLockedState = !block.locked;
    if (newLockedState) {
      // LOCKING => write to disk
      persistChanges(localContent);
      originalContentRef.current = localContent;
    }

    const updated: PromptResponseBlock = {
      ...block,
      locked: newLockedState,
      content: localContent,
    };
    onChange(updated);
    updateBlock(updated);
  };

  const handleCancel = useCallback(() => {
    const originalContent = originalContentRef.current;
    setLocalContent(originalContent);

    const updated: PromptResponseBlock = {
      ...block,
      locked: true,
      content: originalContent,
    };
    onChange(updated);
    updateBlock(updated);
    // no disk writes on cancel
  }, [block, onChange, updateBlock]);

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

    const updated: PromptResponseBlock = {
      ...block,
      content: updatedContent,
    };
    onChange(updated);
    updateBlock(updated);

    originalContentRef.current = updatedContent;
    persistChanges(updatedContent);
  };

  const parseCheckboxLine = (line: string, lineIndex: number): React.ReactNode => {
    const segments: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let matchCount = 0;

    const pattern = new RegExp(CHECKBOX_PATTERN, 'g');

    while ((match = pattern.exec(line)) !== null) {
      const start = match.index;
      const end = start + match[0].length;

      if (start > lastIndex) {
        const beforeText = line.substring(lastIndex, start);
        segments.push(<span key={`txt-${start}`}>{beforeText}</span>);
      }

      const oldValLocal = match[1];
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

    if (lastIndex < line.length) {
      const remainder = line.substring(lastIndex);
      segments.push(<span key={`end-${lastIndex}`}>{remainder}</span>);
    }

    return <div>{segments}</div>;
  };

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

  useEffect(() => {
    if (!block.locked) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          handleCancel();
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [block.locked, handleCancel]);

  return (
    <div className="border-4 border-dashed border-gray-500 rounded p-3 mb-2">
      <div className="text-sm text-gray-800 dark:text-gray-100 space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-semibold">
            Prompt Response Block: <span className="italic">{block.sourceFile}</span>
          </span>

          <div className="flex items-center gap-2">
            {!isParentRawEditing && !block.locked && (
              <button
                type="button"
                onClick={handleCancel}
                className="p-1 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                title="Cancel edits (Esc)"
                aria-label="Cancel edits"
              >
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
                  className="w-5 h-5"
                >
                  <rect width="18" height="18" x="3" y="3" rx="2"></rect>
                  <path d="m15 9-6 6"></path>
                  <path d="m9 9 6 6"></path>
                </svg>
              </button>
            )}

            {!isParentRawEditing && (
              <button
                type="button"
                onClick={handleToggleLocked}
                className="p-1 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                title="Toggle lock"
                aria-label="Toggle lock"
              >
                {block.locked ? (
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
                  >
                    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                ) : (
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
                  >
                    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                  </svg>
                )}
              </button>
            )}
          </div>
        </div>

        {canEditFully ? (
          <textarea
            ref={textAreaRef}
            rows={1}
            className="w-full text-sm rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 p-2 resize-none whitespace-pre-wrap break-words overflow-hidden"
            placeholder="Type your response..."
            value={localContent}
            onChange={handleFullTextChange}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === 'Backspace' || e.key === 'Delete') {
                setTimeout(handleResizeTextArea, 0);
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                handleCancel();
              }
            }}
            onPaste={() => setTimeout(handleResizeTextArea, 0)}
            onCut={() => setTimeout(handleResizeTextArea, 0)}
            aria-label="Prompt Response Editor"
          />
        ) : (
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
