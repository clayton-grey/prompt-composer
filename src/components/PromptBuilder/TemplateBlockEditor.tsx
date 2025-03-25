
/**
 * @file TemplateBlockEditor.tsx
 * @description
 * Provides an editing interface for a "template" type block. This includes
 * a label, a multiline text area for the template content, and a list of
 * variables (with default values) used in the template.
 *
 * Key Responsibilities:
 *  - Show and update the block's label
 *  - Show and update the block's template content
 *  - Display each variable in a simple list with default-value editing
 *
 * @notes
 *  - We keep variable editing minimal: user can only change the "default" field here.
 *  - In a future step, we might let users add/remove variables or do advanced editing.
 */

import React, { ChangeEvent } from 'react';
import { TemplateBlock } from '../../types/Block';

interface TemplateBlockEditorProps {
  block: TemplateBlock;
  onChange: (updatedBlock: TemplateBlock) => void;
}

const TemplateBlockEditor: React.FC<TemplateBlockEditorProps> = ({
  block,
  onChange
}) => {
  /**
   * Updates the block label in context.
   */
  const handleLabelChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange({ ...block, label: e.target.value });
  };

  /**
   * Updates the block content in context.
   */
  const handleContentChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    onChange({ ...block, content: e.target.value });
  };

  /**
   * Updates a variable's default value by index.
   */
  const handleVariableDefaultChange = (index: number, value: string) => {
    const updatedVariables = [...block.variables];
    updatedVariables[index] = { ...updatedVariables[index], default: value };
    onChange({ ...block, variables: updatedVariables });
  };

  return (
    <div className="p-3 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800">
      {/* Label Field */}
      <div className="mb-2">
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

      {/* Template Content */}
      <div className="mb-4">
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
      <div>
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
    </div>
  );
};

export default TemplateBlockEditor;
