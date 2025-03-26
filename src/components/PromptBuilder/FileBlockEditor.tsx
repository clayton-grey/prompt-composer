/**
 * @file FileBlockEditor.tsx
 * @description
 * Provides an editing interface for a "files" type block.
 *
 * In Step 17B, we simplify the file block so that:
 *  1) It only shows a fixed label "File Block" (no longer user-editable).
 *  2) It provides a single toggle for "Include File Map" (includeProjectMap).
 *  3) We do NOT show the raw file list or file contents in the UI. The data
 *     still exists in the block for final prompt flattening, but it's hidden
 *     from the user.
 *
 * Key Responsibilities:
 *  - Render a heading "File Block"
 *  - Render a single toggle to update `block.includeProjectMap`.
 *
 * @notes
 *  - The user can no longer rename the block or see raw file contents here.
 *  - The flattenPrompt logic will conditionally include the projectAsciiMap
 *    if `includeProjectMap` is true.
 *  - If a user unchecks "Include File Map," we skip rendering the ASCII map
 *    in the final prompt.
 */

import React, { ChangeEvent } from 'react';
import { FilesBlock } from '../../types/Block';

interface FileBlockEditorProps {
  block: FilesBlock;
  onChange: (updatedBlock: FilesBlock) => void;
}

const FileBlockEditor: React.FC<FileBlockEditorProps> = ({ block, onChange }) => {
  /**
   * Toggle whether we include the project map in the final output.
   */
  const handleToggleIncludeMap = (e: ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.checked;
    console.log(`[FileBlockEditor] Toggling includeProjectMap to: ${newValue}`);
    console.log(`[FileBlockEditor] Files block has ${block.files.length} files`);
    
    if (block.projectAsciiMap) {
      console.log(`[FileBlockEditor] ASCII map length: ${block.projectAsciiMap.length} chars`);
      // Log the current block to check its structure
      console.log('[FileBlockEditor] Current block before update:', JSON.stringify(block, null, 2));
    } else {
      console.log('[FileBlockEditor] No ASCII map is present');
    }
    
    // Create a new block with the updated includeProjectMap value
    const updated = {
      ...block,
      includeProjectMap: newValue
    };
    
    // Log the updated block to verify the change
    console.log('[FileBlockEditor] Updated block after toggle:', JSON.stringify(updated, null, 2));
    
    // Apply the update
    onChange(updated);
    
    // Add a delayed log to check if the token count updates
    setTimeout(() => {
      console.log('[FileBlockEditor] Token count should be updated by now');
    }, 500);
  };

  // We forcibly rename the block label to "File Block" for consistency with step 17B.
  // This ensures the label always reads "File Block" in the UI (BlockList header, etc.)
  // Just in case the user had changed it before:
  if (block.label !== 'File Block') {
    onChange({ ...block, label: 'File Block' });
  }

  return (
    <div className="p-3 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800">
      {/* Always displayed heading: "File Block" */}
      <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-2">
        File Block
      </h3>

      {/* Toggle for "Include File Map" */}
      <label className="flex items-center space-x-2 text-sm text-gray-700 dark:text-gray-200">
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
