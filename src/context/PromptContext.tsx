/**
 * @file PromptContext.tsx
 * @description
 * Defines a React context and provider that manage the global application state:
 *  - An array of blocks representing the user's prompt composition
 *  - Global settings (e.g., maxTokens, model)
 *  - Methods to add, update, or remove blocks
 * 
 * This context can be consumed by any component in the app to access or modify
 * the prompt composition.
 *
 * Key Exports:
 *  - PromptProvider: Wraps the app and provides state
 *  - usePrompt: Hook to consume the prompt context
 * 
 * Usage:
 *  import { usePrompt } from '../context/PromptContext';
 *  const { blocks, addBlock, removeBlock } = usePrompt();
 *
 * @notes
 *  - The initial state is minimal. In future steps, we may expand the settings
 *    to include token limits, model selection, etc.
 *  - We'll rely on the consumer components to trigger re-renders.
 */

import React, { createContext, useContext, useState, useCallback } from 'react';
import type { Block } from '../types/Block';

//------------------------------------
// Types & Interfaces
//------------------------------------

/**
 * Global settings for the prompt builder, e.g. token limits or model info.
 */
interface PromptSettings {
  /**
   * The maximum token limit the user wants to respect.
   */
  maxTokens: number;

  /**
   * The name/identifier of the model the user intends to use, e.g. "gpt-4".
   */
  model: string;
}

/**
 * Defines the shape of our global context.
 */
interface PromptContextType {
  /**
   * The array of blocks in the current prompt composition.
   */
  blocks: Block[];

  /**
   * Global settings for the prompt (maxTokens, model, etc.).
   */
  settings: PromptSettings;

  /**
   * Adds a new block to the composition.
   * @param block The block object to add.
   */
  addBlock: (block: Block) => void;

  /**
   * Removes a block by its unique ID.
   * @param blockId The ID of the block to remove.
   */
  removeBlock: (blockId: string) => void;

  /**
   * Updates a block's data in the composition.
   * @param updatedBlock The block object with updated data.
   */
  updateBlock: (updatedBlock: Block) => void;

  /**
   * Sets the global settings for token limit, model, etc.
   * @param newSettings The updated settings object.
   */
  setSettings: (newSettings: PromptSettings) => void;
}

//------------------------------------
// Initial Values
//------------------------------------

/**
 * Default global settings for demonstration.
 */
const defaultSettings: PromptSettings = {
  maxTokens: 8000,
  model: 'gpt-4'
};

/**
 * The default context value to ensure type safety and
 * avoid undefined checks in child components.
 */
const PromptContext = createContext<PromptContextType>({
  blocks: [],
  settings: defaultSettings,
  addBlock: () => {},
  removeBlock: () => {},
  updateBlock: () => {},
  setSettings: () => {}
});

//------------------------------------
// Provider Implementation
//------------------------------------

/**
 * Wraps the React app and provides the global prompt state via context.
 */
export const PromptProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [settings, setSettingsState] = useState<PromptSettings>(defaultSettings);

  /**
   * Adds a new block at the end of the current blocks array.
   */
  const addBlock = useCallback((block: Block) => {
    setBlocks(prev => [...prev, block]);
  }, []);

  /**
   * Removes a block by ID from the blocks array.
   */
  const removeBlock = useCallback((blockId: string) => {
    setBlocks(prev => prev.filter(b => b.id !== blockId));
  }, []);

  /**
   * Updates an existing block in the blocks array by matching IDs.
   */
  const updateBlock = useCallback((updatedBlock: Block) => {
    setBlocks(prev => {
      return prev.map(block => (block.id === updatedBlock.id ? updatedBlock : block));
    });
  }, []);

  /**
   * Updates global settings for the prompt composition.
   */
  const setSettings = useCallback((newSettings: PromptSettings) => {
    setSettingsState(newSettings);
  }, []);

  const contextValue: PromptContextType = {
    blocks,
    settings,
    addBlock,
    removeBlock,
    updateBlock,
    setSettings
  };

  return (
    <PromptContext.Provider value={contextValue}>
      {children}
    </PromptContext.Provider>
  );
};

//------------------------------------
// Hook to consume the context
//------------------------------------

/**
 * Provides a convenient hook for child components
 * to access the prompt context data and methods.
 */
export const usePrompt = (): PromptContextType => {
  return useContext(PromptContext);
};
