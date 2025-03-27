
/**
 * @file TemplateBlockEditor.tsx
 * @description
 * Editing interface for "template" type blocks.
 *
 * Updated to ensure:
 *  - The template block content is VISIBLE in normal (non-raw) mode, but only as read-only text.
 *  - The user can only modify that content in raw edit mode.
 */

import React, { useState, useEffect } from 'react';
import { TemplateBlock, Block } from '../../types/Block';
import { usePrompt } from '../../context/PromptContext';

/**
 * reconstructRawTemplateFromGroup
 * Gathers all blocks in the same groupId, in the order they appear in the global block list,
 * then builds a single string with placeholders for text/file/nested template blocks.
 */
function reconstructRawTemplateFromGroup(
  groupId: string,
  leadBlockId: string,
  allBlocks: Block[]
): string {
  // Collect all blocks with groupId
  const sortedByIndex: { block: Block; index: number }[] = [];
  allBlocks.forEach((block, idx) => {
    if (block.groupId === groupId) {
      sortedByIndex.push({ block, index: idx });
    }
  });
  // Sort them according to their actual index in the global list
  sortedByIndex.sort((a, b) => a.index - b.index);

  let raw = '';
  for (const { block } of sortedByIndex) {
    if (block.type === 'template') {
      // Distinguish if label is "Template Segment", "Nested Template Block", or "Inline Template"
      if (block.label === 'Template Segment') {
        raw += block.content;
      } else if (block.label === 'Nested Template Block') {
        raw += `{{TEMPLATE_BLOCK=${block.content}}}`;
      } else if (block.label?.startsWith('Inline Template:')) {
        const templateName = block.label.replace('Inline Template:', '').trim();
        raw += `{{${templateName}}}`;
      } else {
        // fallback: treat as literal text
        raw += block.content;
      }
    } else if (block.type === 'text') {
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

  // Whether we're displaying raw editing mode
  const [isEditingRaw, setIsEditingRaw] = useState<boolean>(block.editingRaw || false);

  // The raw content shown to the user in raw editing mode
  const [rawContent, setRawContent] = useState<string>('');
  // For checking if user changed anything (to skip re-parse if no changes)
  const [originalRawContent, setOriginalRawContent] = useState<string>('');

  // On entering raw mode, reconstruct the entire group as a single text
  useEffect(() => {
    if (isEditingRaw) {
      const reconstructed = reconstructRawTemplateFromGroup(block.groupId!, block.id, blocks);
      setRawContent(reconstructed);
      setOriginalRawContent(reconstructed);
    }
  }, [isEditingRaw, block.groupId, block.id, blocks]);

  /**
   * handleFlipToRawClick
   * Called when the user clicks "Edit Raw"
   */
  const handleFlipToRawClick = () => {
    if (!block.groupId) return;
    setIsEditingRaw(true);
    onChange({ ...block, editingRaw: true });
  };

  /**
   * handleRawConfirm
   * If user actually changed the raw text, we parse & replace the group; otherwise skip
   */
  const handleRawConfirm = () => {
    if (!block.groupId) {
      // If no group, skip
      setIsEditingRaw(false);
      onChange({ ...block, editingRaw: false });
      return;
    }
    replaceTemplateGroup(block.id, block.groupId, rawContent, originalRawContent);
    setIsEditingRaw(false);
  };

  /**
   * handleRawCancel
   * Cancel raw editing, revert to normal mode
   */
  const handleRawCancel = () => {
    setIsEditingRaw(false);
    onChange({ ...block, editingRaw: false });
  };

  // If we are in raw edit mode, show the raw editing UI
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

  // Otherwise, normal (non-raw) mode
  // We show the block's content in a read-only manner
  return (
    <div>
      {/* If this is the lead block and not locked in raw mode, show "Edit Raw" button */}
      {block.isGroupLead && !block.editingRaw && (
        <div className="flex items-center justify-end mb-2">
          <button
            onClick={handleFlipToRawClick}
            className="px-2 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600"
          >
            Edit Raw
          </button>
        </div>
      )}

      {/* Show the template content as read-only text */}
      {block.content && (
        <div className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-100 border border-gray-300 dark:border-gray-600 rounded p-2">
          {block.content}
        </div>
      )}
    </div>
  );
};

export default TemplateBlockEditor;
