/**
 * @file BlockEditor.tsx
 * @description
 * This component serves as a wrapper that selects the correct editor subcomponent
 * (TextBlockEditor, TemplateBlockEditor, FileBlockEditor) based on the block's type.
 *
 * Key Responsibilities:
 *  - Accept a Block object and dispatch the correct child editor
 *  - Provide a common interface for updating the block
 *
 * @notes
 *  - The onChange callback is triggered whenever the child editor modifies the block.
 *  - This is minimal scaffolding for Step 6; more advanced features (like reorder/delete)
 *    will come in Step 7.
 */

import React from 'react';
import { Block } from '../../types/Block';
import TextBlockEditor from './TextBlockEditor';
import TemplateBlockEditor from './TemplateBlockEditor';
import FileBlockEditor from './FileBlockEditor';

interface BlockEditorProps {
  /**
   * The block to be displayed and edited.
   */
  block: Block;

  /**
   * Callback invoked when the block data changes.
   * The updated block is passed back to the parent.
   */
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
    default:
      return (
        <div className="p-2 border border-red-300 bg-red-50">
          <p className="text-red-600">Unknown block type: {block.type}</p>
        </div>
      );
  }
};

export default BlockEditor;
