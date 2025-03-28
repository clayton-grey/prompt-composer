/**
 * @file FileBlockEditor.tsx
 * @description
 * Renders the "File Block" with a thick dashed outline.
 *
 * Updated layout per user request:
 *   [ icon ]   File Block
 *              [checkbox] Include File Map
 *
 * Only one icon is shown on the left. The text is stacked on the right in two lines.
 *
 * The "dark:invert" utility ensures the icon inverts in dark mode.
 */

import React, { ChangeEvent } from 'react';
import { FilesBlock } from '../../types/Block';

interface FileBlockEditorProps {
  block: FilesBlock;
  onChange: (updatedBlock: FilesBlock) => void;
}

const FileBlockEditor: React.FC<FileBlockEditorProps> = ({ block, onChange }) => {
  const handleToggleIncludeMap = (e: ChangeEvent<HTMLInputElement>) => {
    onChange({ ...block, includeProjectMap: e.target.checked });
  };

  return (
    <div className="border-4 border-dashed border-gray-500 rounded p-3">
      <div className="flex flex-row items-start">
        {/* Single icon on the left */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="45"
          height="45"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="lucide lucide-folder-tree-icon lucide-folder-tree dark:invert mr-3"
        >
          <path d="M20 10a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2.5a1 1 0 0 1-.8-.4l-.9-1.2A1 1 0 0 0 15 3h-2a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1Z" />
          <path d="M20 21a1 1 0 0 0 1-1v-3a1 1 0 0 0-1-1h-2.9a1 1 0 0 1-.88-.55l-.42-.85a1 1 0 0 0-.92-.6H13a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1Z" />
          <path d="M3 5a2 2 0 0 0 2 2h3" />
          <path d="M3 3v13a2 2 0 0 0 2 2h3" />
        </svg>

        {/* The right side: two lines => "File Block" label, then the checkbox row */}
        <div className="flex flex-col text-sm text-gray-800 dark:text-gray-100 space-y-1">
          {/* First line: "File Block" label */}
          <span className="font-semibold">File Block</span>

          {/* Second line: the checkbox */}
          <label className="inline-flex items-center space-x-2">
            <input
              type="checkbox"
              className="w-4 h-4"
              checked={block.includeProjectMap ?? false}
              onChange={handleToggleIncludeMap}
            />
            <span>Include File Map</span>
          </label>
        </div>
      </div>
    </div>
  );
};

export default FileBlockEditor;
