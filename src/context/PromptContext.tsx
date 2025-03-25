import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect
} from 'react';
import type { Block, FilesBlock } from '../types/Block';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { initEncoder, estimateTokens } from '../utils/tokenizer';

interface PromptSettings {
  maxTokens: number;
  model: string;
}

interface TokenUsage {
  blockTokenUsage: Record<string, number>;
  totalTokens: number;
}

interface PromptContextType {
  blocks: Block[];
  settings: PromptSettings;
  addBlock: (block: Block) => void;
  removeBlock: (blockId: string) => void;
  updateBlock: (updatedBlock: Block) => void;
  setSettings: (newSettings: PromptSettings) => void;
  moveBlock: (oldIndex: number, newIndex: number) => void;
  addFileBlock: (filePath: string, fileContent: string, language: string) => void;
  tokenUsage: TokenUsage;
}

const defaultSettings: PromptSettings = {
  maxTokens: 8000,
  model: 'gpt-4'
};

const PromptContext = createContext<PromptContextType>({
  blocks: [],
  settings: defaultSettings,
  addBlock: () => {},
  removeBlock: () => {},
  updateBlock: () => {},
  setSettings: () => {},
  moveBlock: () => {},
  addFileBlock: () => {},
  tokenUsage: {
    blockTokenUsage: {},
    totalTokens: 0
  }
});

export const PromptProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [settings, setSettingsState] = useState<PromptSettings>(defaultSettings);
  const [tokenUsage, setTokenUsage] = useState<TokenUsage>({
    blockTokenUsage: {},
    totalTokens: 0
  });

  const addBlock = useCallback((block: Block) => {
    setBlocks((prev) => [...prev, block]);
  }, []);

  const removeBlock = useCallback((blockId: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== blockId));
  }, []);

  const updateBlock = useCallback((updatedBlock: Block) => {
    setBlocks((prev) => {
      return prev.map((b) => (b.id === updatedBlock.id ? updatedBlock : b));
    });
  }, []);

  const setSettings = useCallback((newSettings: PromptSettings) => {
    setSettingsState(newSettings);
  }, []);

  const moveBlock = useCallback((oldIndex: number, newIndex: number) => {
    setBlocks((prev) => {
      if (oldIndex < 0 || oldIndex >= prev.length) return prev;
      if (newIndex < 0 || newIndex >= prev.length) return prev;

      const updated = [...prev];
      const [removed] = updated.splice(oldIndex, 1);
      updated.splice(newIndex, 0, removed);
      return updated;
    });
  }, []);

  const addFileBlock = useCallback((filePath: string, fileContent: string, language: string) => {
    const fileName = path.basename(filePath);
    const newBlock: FilesBlock = {
      id: uuidv4(),
      type: 'files',
      label: `File Block: ${fileName}`,
      files: [
        {
          path: filePath,
          content: fileContent,
          language
        }
      ]
    };
    setBlocks((prev) => [...prev, newBlock]);
  }, []);

  // Recalculate token usage
  useEffect(() => {
    initEncoder(settings.model);

    let blockTokenUsage: Record<string, number> = {};
    let totalTokens = 0;

    console.log('[PromptContext] Estimating tokens for blocks:', blocks);

    blocks.forEach((block) => {
      let blockText = '';

      switch (block.type) {
        case 'text':
          blockText = block.content;
          console.log('[PromptContext] Text block content length:', blockText.length);
          break;
        case 'template':
          blockText = block.content;
          console.log('[PromptContext] Template block content length:', blockText.length);
          break;
        case 'files': {
          // Concat all file contents
          const filesConcatenated = block.files.map((f) => f.content).join('\n');
          blockText = filesConcatenated;
          console.log('[PromptContext] Files block:', {
            numFiles: block.files.length,
            totalContentLength: blockText.length,
            filePaths: block.files.map(f => f.path)
          });
          break;
        }
      }

      const count = estimateTokens(blockText);
      console.log('[PromptContext] Token count for block', block.id, ':', count);
      blockTokenUsage[block.id] = count;
      totalTokens += count;
    });

    console.log('[PromptContext] Total token usage:', {
      blockTokenUsage,
      totalTokens
    });

    setTokenUsage({
      blockTokenUsage,
      totalTokens
    });
  }, [blocks, settings.model]);

  // Listen for "add-file-block" from the main process
  useEffect(() => {
    function handleAddFileBlock(_event: any, data: { path: string; content: string; language: string }) {
      console.log('[PromptContext] Received add-file-block message:', data);
      addFileBlock(data.path, data.content, data.language);
    }

    window.electronAPI.onMessage('add-file-block', handleAddFileBlock);

    // Cleanup: unsubscribe on unmount.
    return () => {
      // Let's add a check so we don't crash if the function doesn't exist yet
      if (typeof window.electronAPI.removeChannelListener === 'function') {
        window.electronAPI.removeChannelListener('add-file-block', handleAddFileBlock);
      } else {
        console.warn('[PromptContext] removeChannelListener is not available on electronAPI. Using older preload?');
      }
    };
  }, [addFileBlock]);

  useEffect(() => {
    console.log('[PromptContext] blocks updated:', blocks);
  }, [blocks]);

  const contextValue: PromptContextType = {
    blocks,
    settings,
    addBlock,
    removeBlock,
    updateBlock,
    setSettings,
    moveBlock,
    addFileBlock,
    tokenUsage
  };

  return (
    <PromptContext.Provider value={contextValue}>
      {children}
    </PromptContext.Provider>
  );
};

export const usePrompt = (): PromptContextType => {
  return useContext(PromptContext);
};
