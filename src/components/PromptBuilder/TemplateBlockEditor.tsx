
/**
 * @file TemplateBlockEditor.tsx
 * @description
 * Provides an editing interface for a "template" type block. Now if this block
 * is the lead block of its group (isGroupLead=true), we allow "Edit Raw" mode.
 * When entering raw mode, we set block.editingRaw = true so child blocks are
 * hidden in the BlockList. On cancel or confirm, we revert or remove that state.
 *
 * We also continue to support label, content, and variable editing for normal usage.
 * 
 * Additionally, we do not overwrite the disk version of the template; it's purely 
 * an in-memory transformation for this session.
 */

import React, { ChangeEvent, useState } from 'react';
import { TemplateBlock } from '../../types/Block';
import { usePrompt } from '../../context/PromptContext';

/**
 * We assume placeholders to reconstruct if they're locked sub-blocks of the group.
 * In raw mode, child blocks are hidden from BlockList. We'll flip editingRaw
 * on the lead block so the user sees only this block while raw editing.
 */
function reconstructRawTemplateFromGroup(
  groupId: string,
  leadBlockId: string,
  allBlocks: any[]
): string {
  // Sort the blocks in the order they appear in 'allBlocks'
  const blockOrder: { block: any; index: number }[] = [];
  allBlocks.forEach((b: any, idx: number) => {
    if (b.groupId === groupId) {
      blockOrder.push({ block: b, index: idx });
    }
  });
  blockOrder.sort((a, b) => a.index - b.index);

  let raw = '';

  blockOrder.forEach(({ block }) => {
    // If it's the lead or a "template" block not labeled "Nested Template Block", we treat content as literal text
    if (block.type === 'template') {
      if (block.label === 'Nested Template Block') {
        raw += '{{TEMPLATE_BLOCK}}';
      } else {
        // treat as text
        raw += block.content;
      }
    } else if (block.type === 'text') {
      if (block.locked) {
        // locked text sub-block => was originally {{TEXT_BLOCK}}
        raw += '{{TEXT_BLOCK}}';
      } else {
        // Possibly the lead block? We'll just treat it as text
        raw += block.content;
      }
    } else if (block.type === 'files') {
      // locked => was originally {{FILE_BLOCK}}
      raw += '{{FILE_BLOCK}}';
    }
  });

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
   * Step 4 / 5: local "raw editing" UI
   * But now we also set block.editingRaw on the block itself so that child blocks get hidden.
   */
  const [isEditingRaw, setIsEditingRaw] = useState<boolean>(block.editingRaw || false);
  const [rawTemplateContent, setRawTemplateContent] = useState<string>('');

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
   * handleVariableDefaultChange
   */
  const handleVariableDefaultChange = (index: number, value: string) => {
    const updatedVariables = [...block.variables];
    updatedVariables[index] = { ...updatedVariables[index], default: value };
    onChange({ ...block, variables: updatedVariables });
  };

  /**
   * toggleCollapsed
   */
  const toggleCollapsed = () => setCollapsed(!collapsed);

  /**
   * handleEditRawClick
   * We set editingRaw to true on the block, so the child blocks are hidden in the list,
   * and we reconstruct the entire raw text from the group.
   */
  const handleEditRawClick = () => {
    if (!block.groupId) return;
    // 1) reconstruct
    const reconstructed = reconstructRawTemplateFromGroup(block.groupId, block.id, blocks);
    setRawTemplateContent(reconstructed);

    // 2) set local state
    setIsEditingRaw(true);

    // 3) update the block to have editingRaw = true
    const updated = { ...block, editingRaw: true };
    onChange(updated);
  };

  /**
   * handleRawConfirm
   * We call replaceTemplateGroup. That removes all sub-blocks and re-parses from new text.
   * The new lead block will come in fresh, with editingRaw = false by default.
   */
  const handleRawConfirm = () => {
    if (!block.groupId) {
      setIsEditingRaw(false);
      return;
    }
    replaceTemplateGroup(block.id, block.groupId, rawTemplateContent);
    // We rely on the newly created blocks having editingRaw = false by default.
  };

  /**
   * handleRawCancel
   * We revert any changes, set editingRaw = false on the lead block,
   * so the child blocks become visible again.
   */
  const handleRawCancel = () => {
    setIsEditingRaw(false);
    onChange({ ...block, editingRaw: false });
  };

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
            onClick={handleEditRawClick}
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
