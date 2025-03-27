
/**
 * @file TemplateBlockEditor.tsx
 * @description
 * Provides an editing interface for a "template" type block. Before Step 4, we only
 * allowed labeling, content editing, and variable editing. Now we add a "flip" or "Edit
 * Raw Template" feature for the lead block. This allows the user to see the entire
 * reconstructed raw template text (including placeholders like {{TEXT_BLOCK}}), edit it,
 * and confirm to re-parse all sub-blocks in the group. This does NOT overwrite the
 * underlying file on disk; it's purely an in-memory transformation.
 *
 * Step 4 Implementation:
 *  - If block.isGroupLead, show an "Edit Raw Template" button. On click, we gather all
 *    blocks that share this block's groupId and reconstruct the raw text from them:
 *       e.g. for sub-block type text => {{TEXT_BLOCK}}, etc.
 *  - The user sees a <textarea> with the entire raw text. On confirm, we call
 *    promptContext.replaceTemplateGroup(leadBlockId=block.id, groupId=block.groupId, newText=...) 
 *    to remove and re-parse that group. Then we exit "edit mode."
 *
 * There's some existing code here for label + content + variable editing. That remains.
 * The "flip" mode is in addition to that. 
 */

import React, { ChangeEvent, useState } from 'react';
import { TemplateBlock } from '../../types/Block';
import { usePrompt } from '../../context/PromptContext';

/**
 * We assume these placeholders to reverse-engineer from block types:
 *  - text block with locked => '{{TEXT_BLOCK}}'
 *  - files block => '{{FILE_BLOCK}}'
 *  - template block with label "Nested Template Block" => '{{TEMPLATE_BLOCK}}'
 */
function reconstructRawTemplateFromGroup(
  groupId: string,
  leadBlockId: string,
  allBlocks: any[]
): string {
  // 1) Filter blocks in that group
  const groupBlocks = allBlocks.filter((b: any) => b.groupId === groupId);

  // 2) Sort them in the order they appear in the main blocks array
  //    We'll rely on their index in allBlocks
  const blockOrder: { block: any; index: number }[] = [];
  allBlocks.forEach((b: any, idx: number) => {
    if (b.groupId === groupId) {
      blockOrder.push({ block: b, index: idx });
    }
  });
  blockOrder.sort((a, b) => a.index - b.index);

  // 3) Build up the raw text in sequence
  let raw = '';

  blockOrder.forEach(({ block }) => {
    // If it's the lead block (or a template block that isn't specifically a placeholder), we treat
    // its text as "template segment." Unless the label is "Nested Template Block."
    if (block.type === 'template') {
      if (block.label === 'Nested Template Block') {
        raw += '{{TEMPLATE_BLOCK}}';
      } else {
        // We treat this as a chunk of literal text
        raw += block.content;
      }
    } else if (block.type === 'text') {
      // If it's locked and part of the group => we interpret it as a placeholder
      // We assume this was originally {{TEXT_BLOCK}}
      if (block.locked) {
        raw += '{{TEXT_BLOCK}}';
      } else {
        // If it wasn't locked, it might be a lead block... but normally the lead block is template.
        raw += block.content;
      }
    } else if (block.type === 'files') {
      // We treat this as a {{FILE_BLOCK}}
      raw += '{{FILE_BLOCK}}';
    }
  });

  return raw;
}

interface TemplateBlockEditorProps {
  /**
   * The TemplateBlock being edited
   */
  block: TemplateBlock;

  /**
   * Callback invoked when the block data changes
   */
  onChange: (updatedBlock: TemplateBlock) => void;
}

const TemplateBlockEditor: React.FC<TemplateBlockEditorProps> = ({
  block,
  onChange
}) => {
  const { blocks, replaceTemplateGroup } = usePrompt();

  /**
   * Collapsed UI states from prior implementation
   */
  const [collapsed, setCollapsed] = useState<boolean>(false);

  /**
   * Step 4: Local editing ("flip") state
   */
  const [isEditingRaw, setIsEditingRaw] = useState<boolean>(false);
  const [rawTemplateContent, setRawTemplateContent] = useState<string>('');

  /**
   * handleLabelChange
   * Updates the block label in context.
   */
  const handleLabelChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange({ ...block, label: e.target.value });
  };

  /**
   * handleContentChange
   * Updates the block content in context.
   */
  const handleContentChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    onChange({ ...block, content: e.target.value });
  };

  /**
   * handleVariableDefaultChange
   * Updates a variable's default value by index.
   */
  const handleVariableDefaultChange = (index: number, value: string) => {
    const updatedVariables = [...block.variables];
    updatedVariables[index] = { ...updatedVariables[index], default: value };
    onChange({ ...block, variables: updatedVariables });
  };

  /**
   * toggleCollapsed
   * Flips the 'collapsed' state to hide or show details.
   */
  const toggleCollapsed = () => {
    setCollapsed((prev) => !prev);
  };

  /**
   * Step 4: Flip or "Edit Raw Template" for the lead block
   */
  const handleEditRawClick = () => {
    // Reconstruct from all blocks in that group
    if (!block.groupId) {
      console.warn('[TemplateBlockEditor] No groupId for block, cannot flip edit');
      return;
    }
    const reconstructed = reconstructRawTemplateFromGroup(block.groupId, block.id, blocks);
    setRawTemplateContent(reconstructed);
    setIsEditingRaw(true);
  };

  /**
   * handleRawConfirm
   * On confirm, we call replaceTemplateGroup to re-parse everything from rawTemplateContent.
   */
  const handleRawConfirm = () => {
    if (!block.groupId) return;
    replaceTemplateGroup(block.id, block.groupId, rawTemplateContent);
    setIsEditingRaw(false);
  };

  /**
   * handleRawCancel
   */
  const handleRawCancel = () => {
    setIsEditingRaw(false);
  };

  // If we are in raw editing mode, show only the text area + confirm/cancel
  if (isEditingRaw) {
    return (
      <div className="p-3 border border-yellow-400 bg-yellow-50 rounded">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">
          Edit Raw Template
        </h3>
        <textarea
          rows={8}
          className="w-full rounded border-gray-300 dark:border-gray-700 dark:bg-gray-700 dark:text-gray-100"
          value={rawTemplateContent}
          onChange={(e) => setRawTemplateContent(e.target.value)}
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
      {/* Header Row: Label + Expand/Collapse Toggle + (Optionally) "Edit Raw" button */}
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

        {/* Step 4: "Edit Raw Template" button if this block is the group lead */}
        {block.isGroupLead && (
          <button
            onClick={handleEditRawClick}
            className="ml-2 px-2 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600"
            title="Edit Raw Template Text"
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
              syntax for placeholders.
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
