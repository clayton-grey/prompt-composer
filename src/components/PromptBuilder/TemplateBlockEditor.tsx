
/**
 * @file TemplateBlockEditor.tsx
 * @description
 * Editing interface for template blocks. Now we do an async call to 
 * replaceTemplateGroup so that nested templates can be expanded at parse time.
 */

import React, { useState, useEffect } from 'react';
import { TemplateBlock, Block } from '../../types/Block';
import { usePrompt } from '../../context/PromptContext';

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
      if (block.label === 'Template Segment') {
        raw += block.content;
      } else if (block.label === 'Nested Template Block') {
        raw += `{{TEMPLATE_BLOCK=${block.content}}}`;
      } else if (block.label?.startsWith('Inline Template:')) {
        const templateName = block.label.replace('Inline Template:', '').trim();
        raw += `{{${templateName}}}`;
      } else if (block.label?.startsWith('Cyclic Template Ref:')) {
        // We'll keep that as is
        const refName = block.label.replace('Cyclic Template Ref:', '').trim();
        raw += `{{${refName}}}`;
      } else if (block.label === 'Unknown Template Placeholder'
              || block.label === 'Unknown Template'
      ) {
        // If we have an unknown template, keep the content which might be {{SOMETHING}}
        raw += block.content;
      } else {
        // fallback
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
  const [isEditingRaw, setIsEditingRaw] = useState<boolean>(block.editingRaw || false);
  const [rawContent, setRawContent] = useState<string>('');
  const [originalRawContent, setOriginalRawContent] = useState<string>('');

  useEffect(() => {
    if (isEditingRaw) {
      const reconstructed = reconstructRawTemplateFromGroup(block.groupId!, block.id, blocks);
      setRawContent(reconstructed);
      setOriginalRawContent(reconstructed);
    }
  }, [isEditingRaw, block.groupId, block.id, blocks]);

  const handleFlipToRawClick = () => {
    if (!block.groupId) return;
    setIsEditingRaw(true);
    onChange({ ...block, editingRaw: true });
  };

  /**
   * handleRawConfirm is now async, so we can await replaceTemplateGroup which does the parse 
   * that loads nested template content from disk.
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

  // Normal mode: show content read-only if any
  return (
    <div>
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

      {block.content && (
        <div className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-100 border border-gray-300 dark:border-gray-600 rounded p-2">
          {block.content}
        </div>
      )}
    </div>
  );
};

export default TemplateBlockEditor;
