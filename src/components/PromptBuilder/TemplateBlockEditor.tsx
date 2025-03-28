/**
 * @file TemplateBlockEditor.tsx
 * @description
 * Now a simple read-only display of the template block content in normal mode,
 * since raw editing is handled by FullScreenRawEditor at the app level.
 */

import React from 'react';
import { TemplateBlock } from '../../types/Block';

interface TemplateBlockEditorProps {
  block: TemplateBlock;
  onChange: (updatedBlock: TemplateBlock) => void;
}

const TemplateBlockEditor: React.FC<TemplateBlockEditorProps> = ({ block }) => {
  // We now just show block.content as read-only text
  return (
    <div className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-100">
      {block.content}
    </div>
  );
};

export default TemplateBlockEditor;
