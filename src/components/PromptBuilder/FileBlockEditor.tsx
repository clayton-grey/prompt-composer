/**
 * @file FileBlockEditor.tsx
 * @description
 * An editing interface for a "files" type block. Now we add a folder-tree icon
 * at the start to visually identify it. 
 *
 * Step X changes:
 *  - Insert the "folder-tree" SVG at the beginning of the block, next to the heading "File Block".
 *
 * Step 5 Changes (Accessibility):
 *  - Added htmlFor / id pairing for the "Include File Map" checkbox to make the label accessible.
 */

import React, { ChangeEvent } from 'react';
import { FilesBlock } from '../../types/Block';

interface FileBlockEditorProps {
  block: FilesBlock;
  onChange: (updatedBlock: FilesBlock) => void;
}

const FileBlockEditor: React.FC < FileBlockEditorProps > = ({ block, onChange }) => {
  const handleToggleIncludeMap = (e: ChangeEvent < HTMLInputElement > ) => {
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

  return ( <
    div > { /* Heading with folder-tree icon */ } <
    div className = "flex items-center mb-2" >
    <
    svg xmlns = "http://www.w3.org/2000/svg"
    width = "20"
    height = "20"
    viewBox = "0 0 24 24"
    fill = "none"
    stroke = "currentColor"
    strokeWidth = "2"
    strokeLinecap = "round"
    strokeLinejoin = "round"
    className = "lucide lucide-folder-tree-icon lucide-folder-tree text-gray-700 dark:text-gray-200 mr-1" >
    <
    path d = "M20 10a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2.5a1 1 0 0 1-.8-.4l-.9-1.2A1 1 0 0 0 15 3h-2a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1Z" > < /path> <
    path d = "M20 21a1 1 0 0 0 1-1v-3a1 1 0 0 0-1-1h-2.9a1 1 0 0 1-.88-.55l-.42-.85a1 1 0 0 0-.92-.6H13a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1Z" > < /path> <
    path d = "M3 5a2 2 0 0 0 2 2h3" > < /path> <
    path d = "M3 3v13a2 2 0 0 0 2 2h3" > < /path> <
    /svg> <
    h3 className = "font-semibold text-gray-800 dark:text-gray-100 text-sm" >
    File Block <
    /h3> <
    /div>

    <
    label className = "flex items-center space-x-2 text-xs text-gray-700 dark:text-gray-200"
    htmlFor = { `${block.id}-includeMap` } >
    <
    input id = { `${block.id}-includeMap` } type = "checkbox"
    className = "w-4 h-4"
    checked = { block.includeProjectMap ?? true } onChange = { handleToggleIncludeMap }
    /> <
    span > Include File Map < /span> <
    /label> <
    /div>
  );
};

export default FileBlockEditor;
