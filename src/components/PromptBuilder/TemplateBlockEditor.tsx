/**
 * @file TemplateBlockEditor.tsx
 * @description
 * Editing interface for template blocks. In earlier versions, we displayed a top-right
 * "Edit Raw" button. Now we remove that button from here and let BlockList handle
 * the raw edit icon in the bottom-right corner on hover.
 *
 * Step 6 Changes:
 *  - Removed the mention of "Flip" from the doc comment to standardize references
 *    solely around "Raw Edit." We no longer mention "flip" in code or doc.
 *
 * We still show the raw editing textarea if block.editingRaw is true, but the button
 * to enter raw mode is now in BlockList (the pencil icon).
 *
 * Implementation:
 *  - If block.editingRaw, we show a textarea for editing the entire template group text.
 *    Once confirmed, we parse it into sub-blocks that replace the old group.
 *  - If not editingRaw, we simply display the existing block's content read-only.
 *
 * Exports: TemplateBlockEditor
 */

import React, { useState, useEffect } from 'react';
import { TemplateBlock, Block } from '../../types/Block';
import { usePrompt } from '../../context/PromptContext';

/**
 * reconstructRawTemplateFromGroup
 * Reconstructs the raw template text from all blocks in the group in order,
 * combining template blocks, text blocks, and file placeholders.
 *
 * Implementation:
 *  - Finds all blocks in the same group (groupId),
 *  - Sort them by their index in the blocks array,
 *  - For each block:
 *     if template: we append block.content
 *     if text: we insert {{TEXT_BLOCK=...}}
 *     if file: we insert {{FILE_BLOCK}}
 *
 * @param groupId  The group ID shared by the template expansion
 * @param leadBlockId  The ID of the lead block (unused in logic but included for clarity)
 * @param allBlocks  The full array of blocks from context
 * @returns A single string representing the entire template group in "raw" form
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

const TemplateBlockEditor: React.FC<TemplateBlockEditorProps> = ({ block, onChange }) => {
  const { blocks, replaceTemplateGroup } = usePrompt();
  const [isEditingRaw, setIsEditingRaw] = useState<boolean>(block.editingRaw || false);
  const [rawContent, setRawContent] = useState<string>('');
  const [originalRawContent, setOriginalRawContent] = useState<string>('');

  // If block.editingRaw becomes true, reconstruct the entire raw text
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
   * handleRawConfirm
   * The user confirms their edits to the raw template. We call replaceTemplateGroup
   * to parse the new text into sub-blocks, replacing the old group in context.
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
   * handleRawCancel
   * The user cancels the raw edit. We revert back to the old mode, discarding changes.
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
          onChange={e => setRawContent(e.target.value)}
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

  // Normal (non-raw) mode:
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
