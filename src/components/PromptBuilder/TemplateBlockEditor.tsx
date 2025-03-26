
/**
 * @file TemplateBlockEditor.tsx
 * @description
 * Provides an editing interface for a "template" type block. This includes
 * a label, a multiline text area for the template content, and a list of
 * variables (with default values) used in the template.
 *
 * Step 6: Expand/Collapse Template Fields
 * ---------------------------------------
 * We now add a local 'collapsed' state, along with an arrow icon button
 * near the block heading. When collapsed, we hide the content textarea
 * and the variable list. This lets the user quickly minimize clutter if
 * they don't need to see the template details. The label remains visible.
 *
 * Key Responsibilities:
 *  - Show and update the block's label
 *  - Show and update the block's template content (now hideable)
 *  - Display each variable in a simple list with default-value editing (also hideable)
 *  - Provide a simple arrow toggle to expand/collapse these sections
 *
 * Inputs:
 *  - block (TemplateBlock): The template block data
 *  - onChange (function): Callback invoked when the block data changes
 *
 * Outputs:
 *  - Renders an interactive UI allowing label, content, and variable modifications
 *
 * Edge Cases & Notes:
 *  - If the block has zero variables, the variable list remains empty
 *  - Collapsing is purely a UI convenience; no data is lost
 */

import React, { ChangeEvent, useState } from 'react';
import { TemplateBlock } from '../../types/Block';

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
  /**
   * Local state for expand/collapse
   */
  const [collapsed, setCollapsed] = useState<boolean>(false);

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

  return (
    <div className="p-3 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800">
      {/* Header Row: Label + Expand/Collapse Toggle */}
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
      </div>

      {/* Template details are hidden if collapsed is true */}
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
              Use <code className="bg-gray-100 dark:bg-gray-900 px-1 py-0.5 rounded">{"{{variableName}}"}</code> syntax for placeholders.
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
