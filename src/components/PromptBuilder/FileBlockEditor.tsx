
/**
 * @file FileBlockEditor.tsx
 * @description
 * Provides an editing interface for a "files" type block. Displays the block's
 * label, and any file entries (path, language, content) if present.
 *
 * Key Responsibilities:
 *  - Show and update the block's label
 *  - Display the list of files included in this block
 *
 * @notes
 *  - In a future step, we'll implement the actual file-selection logic and
 *    integration with the sidebar. For now, we only display existing data.
 *  - We do not handle removing files in this step.
 */

import React, { ChangeEvent } from 'react';
import { FilesBlock } from '../../types/Block';

interface FileBlockEditorProps {
  block: FilesBlock;
  onChange: (updatedBlock: FilesBlock) => void;
}

const FileBlockEditor: React.FC<FileBlockEditorProps> = ({ block, onChange }) => {
  /**
   * Updates the block label (title).
   */
  const handleLabelChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange({ ...block, label: e.target.value });
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

      {/* Files List */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
          Included Files
        </h3>
        {block.files.length === 0 ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            No files selected yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {block.files.map((fileObj, idx) => (
              <li key={idx} className="text-sm p-2 border rounded border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700">
                <p className="font-medium text-gray-700 dark:text-gray-100">
                  Path: {fileObj.path}
                </p>
                <p className="text-gray-600 dark:text-gray-300">
                  Language: {fileObj.language}
                </p>
                <pre className="mt-1 p-2 bg-gray-100 dark:bg-gray-900 text-xs text-gray-800 dark:text-gray-100 rounded max-h-32 overflow-auto">
{fileObj.content}
                </pre>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default FileBlockEditor;
