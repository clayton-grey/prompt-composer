/**
 * @file PromptResponseBlockEditor.tsx
 * @description
 * A flattened display of the prompt response block. No heading or borders.
 * - If block is effectively locked due to raw edit, we disable the text area.
 * - We remove all extra styling, icons, etc.
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

  const isDisabled = isParentGroupInRawEdit(block, blocks);

  useEffect(() => {
    if (block.content !== localContent) {
      setLocalContent(block.content);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.content]);

  const persistChanges = useCallback(
    (newVal: string) => {
      const updated: PromptResponseBlock = {
        ...block,
        content: newVal,
      };
      updateBlock(updated);

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

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    debounceTimer.current = setTimeout(() => {
      persistChanges(newVal);
    }, DEBOUNCE_MS);
  };

  if (block.locked) {
    // Show read-only
    return (
      <div className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-100">
        {block.content}
      </div>
    );
  }

  // Show text area
  return (
    <textarea
      rows={5}
      className="w-full text-sm rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
      placeholder="Type your response..."
      value={localContent}
      onChange={handleChange}
      disabled={isDisabled}
      aria-label="Prompt Response Editor"
    />
  );
};

function isParentGroupInRawEdit(block: PromptResponseBlock, allBlocks: Block[]): boolean {
  if (!block.groupId) return false;
  const lead = allBlocks.find(b => b.groupId === block.groupId && b.isGroupLead);
  if (!lead) return false;
  return lead.editingRaw === true;
}

export default PromptResponseBlockEditor;
