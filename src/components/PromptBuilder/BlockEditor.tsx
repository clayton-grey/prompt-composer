/**
 * @file BlockEditor.tsx
 * @description
 * A factory/wrapper component that selects the correct editor for a given block type:
 * TextBlockEditor, TemplateBlockEditor, FileBlockEditor, or PromptResponseBlockEditor.
 *
 * Step 4 Changes:
 *  - Added a new 'promptResponse' case to render <PromptResponseBlockEditor />.
 *    This handles the newly introduced PromptResponseBlock interface.
 */

import React from 'react';
import { Block } from '../../types/Block';
import TextBlockEditor from './TextBlockEditor';
import TemplateBlockEditor from './TemplateBlockEditor';
import FileBlockEditor from './FileBlockEditor';
import PromptResponseBlockEditor from './PromptResponseBlockEditor';

interface BlockEditorProps {
  block: Block;
  onChange: (updatedBlock: Block) => void;
}

const BlockEditor: React.FC<BlockEditorProps> = ({ block, onChange }) => {
  switch (block.type) {
    case 'text':
      return <TextBlockEditor block={block} onChange={onChange} />;
    case 'template':
      return <TemplateBlockEditor block={block} onChange={onChange} />;
    case 'files':
      return <FileBlockEditor block={block} onChange={onChange} />;
    case 'promptResponse':
      return <PromptResponseBlockEditor block={block} onChange={onChange} />;
    default:
      return (
        <div className="p-2 border border-red-300 bg-red-50">
          <p className="text-red-600">Unknown block type: {(block as any).type}</p>
        </div>
      );
  }
};

export default BlockEditor;
