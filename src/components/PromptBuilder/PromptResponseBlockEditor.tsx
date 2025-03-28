/**
 * @file PromptResponseBlockEditor.tsx
 * @description
 * Renders a dotted outline block (like the FileBlockEditor) for the {{PROMPT_RESPONSE=fileName.txt}} tag.
 * It loads the response content from a .prompt-composer file and updates it as the user types.
 *
 * Behavior:
 *  - By default, the block is locked (read-only).
 *  - A small "Edit" button toggles locked => false, allowing inline edits in a textarea.
 *  - An "Lock" button reverts to locked => true, restoring read-only display.
 *  - Changes are persisted to the .prompt-composer/filename.txt file as the user types (debounced).
 *  - If the parent template group is in raw edit mode, we disable editing entirely.
 *
 * Implementation Notes:
 *  - The "locked" field is part of the block data from parseTemplateBlocksAsync.
 *  - If locked===true, we show the content in a div. If locked===false, we show a textarea for editing.
 *  - We also check if the parent group is in raw edit mode (isParentGroupInRawEdit) to disable the textarea.
 *  - On each keystroke, we persist changes to the .prompt-composer file (debounced).
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { PromptResponseBlock, Block } from '../../types/Block';
import { usePrompt } from '../../context/PromptContext';

interface PromptResponseBlockEditorProps {
  block: PromptResponseBlock;
  onChange: (updatedBlock: Block) => void;
}

const DEBOUNCE_MS = 500;

const PromptResponseBlockEditor: React.FC<PromptResponseBlockEditorProps> = ({
  block,
  onChange,
}) => {
  const { blocks, updateBlock } = usePrompt();
  const [localContent, setLocalContent] = useState<string>(block.content || '');

  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  // If the parent template is in raw edit mode, we must disable editing of this block
  const isDisabled = isParentGroupInRawEdit(block, blocks);

  useEffect(() => {
    // If the block content changes externally, sync it
    if (block.content !== localContent) {
      setLocalContent(block.content);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.content]);

  // Writes changes to the .prompt-composer file and updates the block in context
  const persistChanges = useCallback(
    (newVal: string) => {
      const updated: PromptResponseBlock = {
        ...block,
        content: newVal,
      };
      // update block in context
      updateBlock(updated);

      // Attempt to persist to .prompt-composer
      if (window.electronAPI?.writePromptComposerFile) {
        window.electronAPI.writePromptComposerFile(block.sourceFile, newVal).catch(err => {
          console.error('[PromptResponseBlockEditor] Failed to write file:', err);
        });
      }
    },
    [block, updateBlock]
  );

  // Debounce user edits
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newVal = e.target.value;
    setLocalContent(newVal);

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    debounceTimer.current = setTimeout(() => {
      persistChanges(newVal);
    }, DEBOUNCE_MS);
  };

  // Toggles the locked status of the block
  const handleToggleLocked = () => {
    const updated: PromptResponseBlock = {
      ...block,
      locked: !block.locked,
    };
    updateBlock(updated);
  };

  return (
    <div className="border-4 border-dashed border-gray-500 rounded p-3 mb-2">
      <div className="text-sm text-gray-800 dark:text-gray-100 space-y-2">
        {/* Header Row: block label + file name + toggle button */}
        <div className="flex items-center justify-between">
          <span className="font-semibold">
            Prompt Response Block: <span className="italic">{block.sourceFile}</span>
          </span>
          {!isDisabled && (
            <button
              type="button"
              onClick={handleToggleLocked}
              className="text-xs px-2 py-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded"
              disabled={isDisabled}
            >
              {block.locked ? 'Edit' : 'Lock'}
            </button>
          )}
        </div>

        {/* Main content area */}
        {block.locked ? (
          // Read-only mode
          <div className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-100">
            {block.content}
          </div>
        ) : (
          // Editable mode
          <textarea
            rows={5}
            className="w-full text-sm rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 p-2 resize-none"
            placeholder="Type your response..."
            value={localContent}
            onChange={handleChange}
            disabled={isDisabled}
            aria-label="Prompt Response Editor"
          />
        )}
      </div>
    </div>
  );
};

/**
 * isParentGroupInRawEdit
 * Determines whether the parent template group is currently in raw edit mode,
 * which disables editing of any child blocks.
 */
function isParentGroupInRawEdit(block: PromptResponseBlock, allBlocks: Block[]): boolean {
  if (!block.groupId) return false;
  const lead = allBlocks.find(b => b.groupId === block.groupId && b.isGroupLead);
  if (!lead) return false;
  return lead.editingRaw === true;
}

export default PromptResponseBlockEditor;
