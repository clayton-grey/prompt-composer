/**
 * @file PromptResponseBlockEditor.tsx
 * @description
 * A specialized editor for the PromptResponseBlock. This block is loaded from a .prompt-composer
 * file, but the user can edit the text in place. Changes are persisted (debounced) to the
 * sourceFile in .prompt-composer. The main template raw edit does NOT affect this block.
 *
 * Behavior:
 *  - If the block's group lead is in raw edit, we disable this text area (can't edit).
 *  - Otherwise, the user can type freely. Each change triggers a local state update and a
 *    debounced call to `writePromptComposerFile(sourceFile, content)`.
 *  - We also update the block in the context so that the composition has the up-to-date content
 *    for final flattening, etc.
 *
 * Implementation:
 *  - We check if the block is effectively "locked" due to group lead editingRaw.
 *    (We detect that by scanning for the lead if groupId is set, or we can rely on
 *    the block editor's disabling logic, but here we do a direct approach.)
 *  - We store local text in `localContent`. On change, setLocalContent -> debounced write -> updateBlock.
 *
 * @notes
 *  - The user might externally modify the file, but we do not have auto-reload. This is by design.
 *    The user would have to re-parse the template if they want an updated file version.
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

  // Check if the block's group lead is editing raw (disable editing in that case)
  const isDisabled = isParentGroupInRawEdit(block, blocks);

  // Whenever block.content changes externally, update local content
  useEffect(() => {
    if (block.content !== localContent) {
      setLocalContent(block.content);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.content]);

  // On changes to localContent, we schedule a write + updateBlock
  const persistChanges = useCallback(
    (newVal: string) => {
      // 1) update the block in context
      const updated: PromptResponseBlock = {
        ...block,
        content: newVal,
      };
      updateBlock(updated);

      // 2) call the electron API to write the file
      if (window.electronAPI?.writePromptComposerFile) {
        window.electronAPI.writePromptComposerFile(block.sourceFile, newVal).catch(err => {
          console.error('[PromptResponseBlockEditor] Failed to write file:', err);
        });
      }
    },
    [block, updateBlock]
  );

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newVal = e.target.value;
    setLocalContent(newVal);

    // Debounce the writes
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    debounceTimer.current = setTimeout(() => {
      persistChanges(newVal);
    }, DEBOUNCE_MS);
  };

  return (
    <div>
      <div className="flex items-center mb-1">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          className="mr-1 text-gray-700 dark:text-gray-200"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 19.5V4.5a1 1 0 0 1 1-1h5.67a1 1 0 0 1 .7.29l1.42 1.42a1 1 0 0 0 .7.29H19a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
          <path d="M14 2.5V6a2 2 0 0 0 2 2h3.5" />
        </svg>
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
          Prompt Response ({block.sourceFile})
        </span>
      </div>

      <textarea
        rows={5}
        className="w-full rounded border-gray-300 dark:border-gray-700 dark:bg-gray-700 dark:text-gray-100"
        placeholder="Type your response..."
        value={localContent}
        onChange={handleChange}
        disabled={isDisabled}
        aria-label="Prompt Response Editor"
      />
      {isDisabled && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Disabled while main template is in raw edit mode.
        </p>
      )}
    </div>
  );
};

/**
 * Determines if the block's group lead is currently editing raw. If so, we disable editing.
 */
function isParentGroupInRawEdit(block: PromptResponseBlock, allBlocks: Block[]): boolean {
  if (!block.groupId) return false;
  const lead = allBlocks.find(b => b.groupId === block.groupId && b.isGroupLead);
  if (!lead) return false;
  return lead.editingRaw === true;
}

export default PromptResponseBlockEditor;
