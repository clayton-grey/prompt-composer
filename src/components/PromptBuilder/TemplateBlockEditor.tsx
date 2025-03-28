
/**
 * @file TemplateBlockEditor.tsx
 * @description
 * Editing interface for template blocks. In earlier versions, we displayed a top-right
 * "Edit Raw" button. Now we remove that button from here and let BlockList handle
 * the raw edit icon in the bottom-right corner on hover.
 *
 * We still show the raw editing textarea if block.editingRaw is true, but the button
 * to enter raw mode is no longer here.
 *
 * Step X changes:
 *  - Removed the old "Flip" or "Edit Raw" button from the top bar. Instead, the parent
 *    container in BlockList shows a pencil icon in the bottom-right corner on hover.
 *
 * Step 5 Changes (Accessibility):
 *  - Added aria-label to the raw editing <textarea>.
 */

import React, { useState, useEffect } from 'react';
import { TemplateBlock, Block } from '../../types/Block';
import { usePrompt } from '../../context/PromptContext';

/**
 * Reconstruct the raw template text from the group. 
 * This is the same function as before, so we keep it for editingRaw usage.
 */
function reconstructRawTemplateFromGroup(
  groupId: string,
  leadBlockId: string,
  allBlocks: Block[]
): string {
  const sortedByIndex: { block: Block; index: number }[] = [];
  allBlocks.forEach((block, idx) => {
    if (block.groupId === groupId) {
      sortedByIndex.push({ block, index: idx });
    }
  });
  sortedByIndex.sort((a, b) => a.index - b.index);

  let raw = '';
  for (const { block } of sortedByIndex) {
    if (block.type === 'template') {
      // We keep the original content
      raw += block.content;
    } else if (block.type === 'text') {
      // replaced with {{TEXT_BLOCK=...}}
      raw += `{{TEXT_BLOCK=${block.content}}}`;
    } else if (block.type === 'files') {
      raw += `{{FILE_BLOCK}}`;
    }
  }
  return raw;
}

interface TemplateBlockEditorProps {
  block: TemplateBlock;
  onChange: (updatedBlock: TemplateBlock) => void;
}

const TemplateBlockEditor: React.FC<TemplateBlockEditorProps> = ({
  block,
  onChange
}) => {
  const { blocks, replaceTemplateGroup } = usePrompt();
  const [isEditingRaw, setIsEditingRaw] = useState<boolean>(block.editingRaw || false);
  const [rawContent, setRawContent] = useState<string>('');
  const [originalRawContent, setOriginalRawContent] = useState<string>('');

  // Whenever editingRaw toggles, reconstruct the raw text or reset states
  useEffect(() => {
    if (block.editingRaw) {
      setIsEditingRaw(true);
      const reconstructed = reconstructRawTemplateFromGroup(block.groupId!, block.id, blocks);
      setRawContent(reconstructed);
      setOriginalRawContent(reconstructed);
    } else {
      setIsEditingRaw(false);
    }
  }, [block.editingRaw, block.groupId, block.id, blocks]);

  /**
   * handleRawConfirm: user has edited raw text and clicked "Confirm"
   * We parse it to form new sub-blocks in place. 
   */
  const handleRawConfirm = async () => {
    if (!block.groupId) {
      setIsEditingRaw(false);
      onChange({ ...block, editingRaw: false });
      return;
    }

    await replaceTemplateGroup(block.id, block.groupId, rawContent, originalRawContent);
    setIsEditingRaw(false);
  };

  /**
   * handleRawCancel: revert to normal display with no changes
   */
  const handleRawCancel = () => {
    setIsEditingRaw(false);
    onChange({ ...block, editingRaw: false });
  };

  if (isEditingRaw) {
    return (
      <div className="p-3 border border-yellow-400 bg-yellow-50 rounded">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">
          Edit Raw Template
        </h3>
        <textarea
          rows={8}
          className="w-full rounded border-gray-300 dark:border-gray-700 dark:bg-gray-700 dark:text-gray-100"
          value={rawContent}
          onChange={(e) => setRawContent(e.target.value)}
          aria-label="Raw Template Editor"
        />
        <div className="mt-2 flex gap-2">
          <button
            onClick={handleRawConfirm}
            className="px-3 py-1 text-sm rounded bg-green-500 hover:bg-green-600 text-white"
          >
            Confirm
          </button>
          <button
            onClick={handleRawCancel}
            className="px-3 py-1 text-sm rounded bg-gray-400 hover:bg-gray-500 text-white"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Normal mode: just show the block content read-only if any
  return (
    <div>
      {block.content && (
        <div className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-100 border border-gray-300 dark:border-gray-600 rounded p-2">
          {block.content}
        </div>
      )}
    </div>
  );
};

export default TemplateBlockEditor;
