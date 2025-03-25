
/**
 * @file PromptContext.tsx
 * @description
 * Manages the global state of the prompt (blocks array, settings, etc.).
 * Exports a PromptProvider that we now wrap around <App> in main.tsx.
 *
 * Key Exports:
 *  - PromptProvider: The context provider for blocks & settings
 *  - usePrompt: Hook to consume this context in child components
 *
 * @notes
 *  - We add a debug useEffect to log the blocks array whenever it changes,
 *    confirming it's updated after adding or removing blocks.
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect
} from 'react';
import type { Block } from '../types/Block';

interface PromptSettings {
  maxTokens: number;
  model: string;
}

interface PromptContextType {
  blocks: Block[];
  settings: PromptSettings;
  addBlock: (block: Block) => void;
  removeBlock: (blockId: string) => void;
  updateBlock: (updatedBlock: Block) => void;
  setSettings: (newSettings: PromptSettings) => void;
  moveBlock: (oldIndex: number, newIndex: number) => void;
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
  moveBlock: () => {}
});

export const PromptProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [settings, setSettingsState] = useState<PromptSettings>(defaultSettings);

  const addBlock = useCallback((block: Block) => {
    setBlocks((prev) => [...prev, block]);
  }, []);

  const removeBlock = useCallback((blockId: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== blockId));
  }, []);

  const updateBlock = useCallback((updatedBlock: Block) => {
    setBlocks((prev) => {
      return prev.map((block) => (block.id === updatedBlock.id ? updatedBlock : block));
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

  /**
   * Debug effect to confirm that 'blocks' changes after adding/deleting blocks.
   */
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
    moveBlock
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
