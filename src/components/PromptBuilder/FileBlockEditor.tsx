/**
 * @file FileBlockEditor.tsx
 * @description
 * A more visually prominent file block with a thick dashed outline
 * around the entire block, to show it's special.
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
      <div className="text-sm text-gray-800 dark:text-gray-100 space-y-1">
        <div className="font-semibold">File Block</div>
        <div>
          <label className="inline-flex items-center space-x-2">
            <input
              type="checkbox"
              className="w-4 h-4"
              checked={block.includeProjectMap ?? true}
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
