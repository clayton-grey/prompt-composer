
/**
 * @file TemplateBlockEditor.tsx
 * @description
 * Provides an editing interface for a "template" type block. If this block is
 * the lead block of its group, we allow "Edit Raw" mode. When entering raw mode,
 * we reconstruct the entire template as a single text string. For each sub-block:
 *  - Template segments become literal text
 *  - Text blocks become {{TEXT_BLOCK=some content}}
 *  - File blocks become {{FILE_BLOCK}}
 *  - Nested templates become {{TEMPLATE_BLOCK=some content}} or inline references
 *    if they appear as "Inline Template: XYZ"
 *
 * On confirm, if the user changed anything from the original raw text, we call
 * replaceTemplateGroup to parse and replace the entire group. If they didn't change
 * anything, we skip re-parsing and just exit raw mode.
 */

import React, { ChangeEvent, useState, useEffect } from 'react';
import { TemplateBlock, Block } from '../../types/Block';
import { usePrompt } from '../../context/PromptContext';

/**
 * reconstructRawTemplateFromGroup
 * Gathers all blocks in the same groupId, in the order they appear in the global block list.
 * Returns a single string that uses placeholders for text/file/nested blocks.
 *
 * Implementation details:
 *  - For text blocks: use {{TEXT_BLOCK=<block.content>}}
 *  - For file blocks: use {{FILE_BLOCK}}
 *  - For nested template blocks:
 *       If label is "Nested Template Block", do {{TEMPLATE_BLOCK=block.content}}
 *       If label is "Inline Template: X", we might do {{X}} but we can't do a full expansion 
 *         without an async load. We'll just do {{X}} so the user can see it. 
 *  - For "Template Segment" blocks, we add them as literal text in the final string
 */
function reconstructRawTemplateFromGroup(
  groupId: string,
  leadBlockId: string,
  allBlocks: Block[]
): string {
  // We'll gather the blocks in order
  const groupBlocksInOrder = allBlocks.filter((b) => b.groupId === groupId);

  // We want them in the same order they appear in the global list
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
      // If label is "Template Segment", we treat content as literal text
      // If label is "Nested Template Block", we do {{TEMPLATE_BLOCK=...}}
      // If label starts with "Inline Template:", we do e.g. {{HELLO}}
      if (block.label === 'Template Segment') {
        raw += block.content;
      } else if (block.label === 'Nested Template Block') {
        raw += `{{TEMPLATE_BLOCK=${block.content}}}`;
      } else if (block.label.startsWith('Inline Template:')) {
        // parse out the template name from the label e.g. "Inline Template: HELLO"
        const templateName = block.label.replace('Inline Template:', '').trim();
        raw += `{{${templateName}}}`;
      } else {
        // fallback
        raw += block.content;
      }
    } else if (block.type === 'text') {
      // Insert as {{TEXT_BLOCK=content}}
      const content = block.content || '';
      // We might want to escape braces if necessary, but let's do a direct insertion for now
      raw += `{{TEXT_BLOCK=${content}}}`;
    } else if (block.type === 'files') {
      // Insert as {{FILE_BLOCK}}
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
  const [collapsed, setCollapsed] = useState<boolean>(false);

  /**
   * local "raw editing" UI:
   *  - originalRawContent: stores the initial raw string from the group
   *  - rawContent: user edits
   *  - isEditingRaw: toggles UI
   */
  const [isEditingRaw, setIsEditingRaw] = useState<boolean>(block.editingRaw || false);
  const [rawContent, setRawContent] = useState<string>('');
  const [originalRawContent, setOriginalRawContent] = useState<string>('');

  useEffect(() => {
    // If isEditingRaw just became true, reconstruct
    if (isEditingRaw) {
      const reconstructed = reconstructRawTemplateFromGroup(block.groupId!, block.id, blocks);
      setRawContent(reconstructed);
      setOriginalRawContent(reconstructed);
    }
  }, [isEditingRaw, block.groupId, block.id, blocks]);

  /**
   * handleLabelChange
   */
  const handleLabelChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange({ ...block, label: e.target.value });
  };

  /**
   * handleContentChange
   */
  const handleContentChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    onChange({ ...block, content: e.target.value });
  };

  /**
   * handleFlipToRawClick
   */
  const handleFlipToRawClick = () => {
    if (!block.groupId) return;
    setIsEditingRaw(true);
    // Also set editingRaw = true on the block
    onChange({ ...block, editingRaw: true });
  };

  /**
   * handleRawConfirm
   * If the user changed the raw content, we parse & replace the group. Otherwise, skip.
   */
  const handleRawConfirm = () => {
    if (!block.groupId) {
      setIsEditingRaw(false);
      onChange({ ...block, editingRaw: false });
      return;
    }
    replaceTemplateGroup(block.id, block.groupId, rawContent, originalRawContent);
    // We'll rely on replaceTemplateGroup to set editingRaw=false or re-initialize
    setIsEditingRaw(false);
  };

  /**
   * handleRawCancel
   * We revert any changes, set editingRaw = false
   */
  const handleRawCancel = () => {
    setIsEditingRaw(false);
    onChange({ ...block, editingRaw: false });
  };

  /**
   * handleVariableDefaultChange
   */
  const handleVariableDefaultChange = (index: number, value: string) => {
    const updatedVariables = [...block.variables];
    updatedVariables[index] = { ...updatedVariables[index], default: value };
    onChange({ ...block, variables: updatedVariables });
  };

  const toggleCollapsed = () => setCollapsed(!collapsed);

  // If user is in raw editing mode, show only the raw editing UI
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

  return (
    <div className="p-3 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800">
      {/* Header Row */}
      <div className="flex items-center justify-between">
        {/* Label Field */}
        <div className="mr-2 flex-1">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
            Label:
          </label>
          <input
            type="text"
            className="w-full rounded border-gray-300 dark:border-gray-700 dark:bg-gray-700 dark:text-gray-100"
            value={block.label}
            onChange={handleLabelChange}
          />
        </div>

        {/* Collapse/Expand Button */}
        <button
          onClick={toggleCollapsed}
          className="ml-2 p-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded"
          title={collapsed ? 'Expand Template Details' : 'Collapse Template Details'}
        >
          {collapsed ? (
            <svg
              className="h-5 w-5 text-gray-700 dark:text-gray-200"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              {/* Down Arrow = Expand */}
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
            </svg>
          ) : (
            <svg
              className="h-5 w-5 text-gray-700 dark:text-gray-200"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              {/* Up Arrow = Collapse */}
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 15l-6-6-6 6" />
            </svg>
          )}
        </button>

        {/* Edit Raw if lead block */}
        {block.isGroupLead && !block.editingRaw && (
          <button
            onClick={handleFlipToRawClick}
            className="ml-2 px-2 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600"
          >
            Edit Raw
          </button>
        )}
      </div>

      {/* Template details hidden if collapsed */}
      {!collapsed && (
        <>
          {/* Template Content */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
              Template Content:
            </label>
            <textarea
              rows={4}
              className="w-full rounded border-gray-300 dark:border-gray-700 dark:bg-gray-700 dark:text-gray-100"
              value={block.content}
              onChange={handleContentChange}
            />
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              Use <code className="bg-gray-100 dark:bg-gray-900 px-1 py-0.5 rounded">
                {"{{variableName}}"}
              </code>{" "}
              syntax for placeholders in content. Or define sub-block placeholders
              like <code className="bg-gray-100 dark:bg-gray-900 px-1 py-0.5 rounded">
                {"{{TEXT_BLOCK=...}}"}
              </code>.
            </p>
          </div>

          {/* Variables List */}
          <div className="mt-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
              Template Variables
            </h3>
            {block.variables.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                No variables defined.
              </p>
            ) : (
              <ul className="space-y-2">
                {block.variables.map((v, idx) => (
                  <li key={idx} className="text-sm">
                    <div className="flex items-center space-x-2">
                      <span className="font-medium text-gray-700 dark:text-gray-300">
                        {v.name}:
                      </span>
                      <input
                        type="text"
                        className="flex-1 rounded border-gray-300 dark:border-gray-700 dark:bg-gray-700 dark:text-gray-100"
                        value={v.default}
                        onChange={(e) =>
                          handleVariableDefaultChange(idx, e.target.value)
                        }
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default TemplateBlockEditor;
