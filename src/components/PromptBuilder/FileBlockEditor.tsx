
/**
 * @file FileBlockEditor.tsx
 * @description
 * Provides an editing interface for a "files" type block.
 *
 * Changes:
 *  - Removed any display of block label or type, except we forcibly show 
 *    "File Block" in the UI.
 *  - Maintains the toggle for including the ASCII file map.
 */

import React, { ChangeEvent } from 'react';
import { FilesBlock } from '../../types/Block';

interface FileBlockEditorProps {
  block: FilesBlock;
  onChange: (updatedBlock: FilesBlock) => void;
}

const FileBlockEditor: React.FC<FileBlockEditorProps> = ({ block, onChange }) => {
  /**
   * Toggle whether we include the project map in final output
   */
  const handleToggleIncludeMap = (e: ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.checked;
    const updated = {
      ...block,
      includeProjectMap: newValue
    };
    onChange(updated);
  };

  // Force the label in memory as "File Block" if needed
  if (block.label !== 'File Block') {
    onChange({ ...block, label: 'File Block' });
  }

  return (
    <div>
      <h3 className="font-semibold text-gray-800 dark:text-gray-100 text-sm mb-2">
        File Block
      </h3>
      <label className="flex items-center space-x-2 text-xs text-gray-700 dark:text-gray-200">
        <input
          type="checkbox"
          className="w-4 h-4"
          checked={block.includeProjectMap ?? true}
          onChange={handleToggleIncludeMap}
        />
        <span>Include File Map</span>
      </label>
    </div>
  );
};

export default FileBlockEditor;
