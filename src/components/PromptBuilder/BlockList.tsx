import React, { useEffect } from 'react';
import { usePrompt } from '../../context/PromptContext';
import BlockEditor from './BlockEditor';

/**
 * @file BlockList.tsx
 * We fix the bug where text areas cannot be typed in because we never update the block content.
 * We'll pass an onChange callback that calls updateBlock(updatedBlock).
 */

const BlockList: React.FC = () => {
  const { blocks, updateBlock } = usePrompt();

  useEffect(() => {
    console.log('[BlockList] current blocks:', blocks);
  }, [blocks]);

  // We'll define a handleBlockChange that calls updateBlock from context
  const handleBlockChange = (updatedBlock: any) => {
    updateBlock(updatedBlock);
  };

  return (
    <div className="space-y-4">
      {blocks.map(block => (
        <div key={block.id} className="flex flex-col">
          <BlockEditor block={block} onChange={handleBlockChange} />
        </div>
      ))}

      {blocks.length === 0 && (
        <div className="text-sm text-gray-700 dark:text-gray-300">
          No blocks. Use or load a template to begin.
        </div>
      )}
    </div>
  );
};

export default BlockList;
