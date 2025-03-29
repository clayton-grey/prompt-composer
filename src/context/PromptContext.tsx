/**
 * @file PromptContext.tsx
 * @description
 * Manages the array of prompt blocks (in memory), React state for prompt settings,
 * and provides methods to insert/update blocks or import an entire composition.
 *
 * After Step 3 (Extract Prompt Parsing & Token Counting):
 *  - We have moved the flatten prompt logic and token usage logic to "promptActions.ts".
 *  - This keeps the context primarily for React state management, so the context is simpler.
 *
 * Exports:
 *  - PromptContext / PromptProvider
 *  - usePrompt() hook
 *
 * Key Capabilities:
 *  1) Holds blocks[] and settings in state
 *  2) Provides methods addBlock, addBlocks, removeBlock, updateBlock
 *  3) Provides importComposition() to replace the entire composition
 *  4) Re-computes token usage using calculateTokenUsage from promptActions
 *  5) Provides getFlattenedPrompt() that calls flattenPrompt from promptActions
 *
 * Implementation Details:
 *  - We rely on ProjectContext (via useProject) to get selected files for flattening or token usage.
 *  - We do an effect on [blocks, settings.model, selected file entries] to re-calc usage.
 *  - We store the usage in state as tokenUsage.
 *  - We store the final flattened prompt on demand (via getFlattenedPrompt).
 *
 * Edge Cases & Error Handling:
 *  - If the model is invalid or text is empty, we default usage to 0.
 *  - When reading or writing .prompt-composer files fails, we log warnings but keep the context stable.
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';

import type { Block, FilesBlock } from '../types/Block';
import { useProject } from './ProjectContext';
import { parseTemplateBlocksAsync } from '../utils/templateBlockParserAsync';
import { TokenUsage } from '../utils/promptActions';
import { flattenPrompt, calculateTokenUsage } from '../utils/promptActions';

interface PromptSettings {
  maxTokens: number;
  model: string;
}

interface PromptContextType {
  blocks: Block[];
  settings: PromptSettings;

  addBlock: (block: Block) => void;
  addBlocks: (newBlocks: Block[]) => void;
  removeBlock: (blockId: string) => void;
  updateBlock: (updatedBlock: Block) => void;
  setSettings: (newSettings: PromptSettings) => void;

  /**
   * Update or create the single "files" block with fresh file entries.
   * Provided for legacy usage from older code (in case still used).
   */
  updateFileBlock: (
    fileEntries: { path: string; content: string; language: string }[],
    asciiMap?: string
  ) => void;

  /**
   * Current token usage snapshot for the entire composition.
   * 'byBlock' indicates how many tokens each block contributes,
   * 'total' is the sum of all blocks.
   */
  tokenUsage: TokenUsage;

  /**
   * Called to produce the final flattened prompt string, including
   * ASCII map and selected file contents. This references the user's
   * tri-state selection from ProjectContext.
   */
  getFlattenedPrompt: () => Promise<string>;

  /**
   * Replaces the entire composition (blocks + settings) with new data,
   * e.g. after an import from XML or raw edit parse.
   */
  importComposition: (newBlocks: Block[], newSettings: PromptSettings) => void;

  /**
   * Replaces an entire group in place (for partial raw edits).
   */
  replaceTemplateGroup: (
    leadBlockId: string,
    groupId: string,
    newText: string,
    oldRawText: string
  ) => Promise<void>;
}

/**
 * Defaults for the prompt settings
 */
const defaultSettings: PromptSettings = {
  maxTokens: 100000,
  model: 'gpt-4',
};

/**
 * The actual PromptContext
 */
const PromptContext = createContext<PromptContextType>({
  blocks: [],
  settings: defaultSettings,
  addBlock: () => {},
  addBlocks: () => {},
  removeBlock: () => {},
  updateBlock: () => {},
  setSettings: () => {},
  updateFileBlock: () => {},
  tokenUsage: { total: 0, byBlock: [] },
  getFlattenedPrompt: async () => '',
  importComposition: () => {},
  replaceTemplateGroup: async () => {},
});

/**
 * PromptProvider
 * Wraps children with the prompt context.
 */
export const PromptProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [settings, setSettingsState] = useState<PromptSettings>(defaultSettings);
  const [tokenUsage, setTokenUsage] = useState<TokenUsage>({ total: 0, byBlock: [] });

  // We'll use the ProjectContext to find the selected files & projectFolders.
  // That data is needed to flatten the prompt or compute usage.
  const { getSelectedFileEntries, projectFolders } = useProject();

  // Debounce reference for token usage re-calc
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Add a single block
   */
  const addBlock = useCallback((block: Block) => {
    setBlocks(prev => [...prev, block]);
  }, []);

  /**
   * Add multiple blocks at once
   */
  const addBlocks = useCallback((newBlocks: Block[]) => {
    setBlocks(prev => [...prev, ...newBlocks]);
  }, []);

  /**
   * Remove a single block by ID
   */
  const removeBlock = useCallback((blockId: string) => {
    setBlocks(prev => prev.filter(b => b.id !== blockId));
  }, []);

  /**
   * Update an existing block
   */
  const updateBlock = useCallback((updatedBlock: Block) => {
    setBlocks(prev => prev.map(b => (b.id === updatedBlock.id ? updatedBlock : b)));
  }, []);

  /**
   * Set new prompt settings in state
   */
  const setSettings = useCallback((newSettings: PromptSettings) => {
    setSettingsState(newSettings);
  }, []);

  /**
   * Legacy method to update or create the single "files" block with fresh entries
   * from the user's tri-state selection or a direct call. Typically not used in
   * the new template-first approach, but retained for compatibility.
   */
  const updateFileBlock = useCallback(
    (fileEntries: { path: string; content: string; language: string }[], asciiMap?: string) => {
      setBlocks(prev => {
        const existingIndex = prev.findIndex(b => b.type === 'files');
        const newId = uuidv4();

        const candidate: FilesBlock = {
          id: newId,
          type: 'files',
          label: 'File Block',
          files: fileEntries,
          projectAsciiMap: asciiMap || '',
          includeProjectMap: true,
          locked: false,
        };

        if (existingIndex === -1) {
          return [...prev, candidate];
        } else {
          const newBlocks = [...prev];
          newBlocks[existingIndex] = candidate;
          // remove any other 'files' blocks if multiple
          return newBlocks.filter((b, idx) => b.type !== 'files' || idx === existingIndex);
        }
      });
    },
    []
  );

  /**
   * importComposition
   * Clears the current blocks and replaces them with newBlocks,
   * also sets the prompt settings to newSettings. Used for raw edit
   * or for importing from XML.
   */
  const importComposition = useCallback((newBlocks: Block[], newSettings: PromptSettings) => {
    setBlocks(newBlocks);
    setSettingsState(newSettings);
  }, []);

  /**
   * replaceTemplateGroup
   * Used by partial raw editing flows to parse updated text and replace
   * all blocks in that group with the newly parsed ones.
   */
  const replaceTemplateGroup = useCallback(
    async (leadBlockId: string, groupId: string, newText: string, oldRawText: string) => {
      if (newText === oldRawText) {
        // If nothing changed, just mark the lead block's editingRaw=false
        setBlocks(prev =>
          prev.map(b => {
            if (b.id === leadBlockId && b.editingRaw) {
              return { ...b, editingRaw: false };
            }
            return b;
          })
        );
        return;
      }

      // parse the updated text for new blocks
      const newParsed = await parseTemplateBlocksAsync(newText, groupId, leadBlockId);
      setBlocks(prev => {
        const groupIndices: number[] = [];
        for (let i = 0; i < prev.length; i++) {
          if (prev[i].groupId === groupId) {
            groupIndices.push(i);
          }
        }
        if (groupIndices.length === 0) {
          // no old group => just add the new parsed blocks
          return [...prev, ...newParsed];
        }
        const startIndex = Math.min(...groupIndices);
        const endIndex = Math.max(...groupIndices);
        const updated = [...prev];
        updated.splice(startIndex, endIndex - startIndex + 1, ...newParsed);
        return updated;
      });
    },
    []
  );

  /**
   * getFlattenedPrompt
   * Uses flattenPrompt (from promptActions) to produce the final string.
   */
  const getFlattenedPrompt = useCallback(async () => {
    const selectedEntries = getSelectedFileEntries();
    const flattened = await flattenPrompt(blocks, projectFolders, selectedEntries);
    return flattened;
  }, [blocks, projectFolders, getSelectedFileEntries]);

  /**
   * Recompute token usage whenever blocks, model, or selected file entries change.
   * We debounce for ~500ms to avoid excessive recalculation on rapid updates.
   */
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      try {
        const selectedEntries = getSelectedFileEntries();
        const usage = calculateTokenUsage(blocks, settings.model, selectedEntries);
        setTokenUsage(usage);
      } catch (error) {
        console.error('[PromptContext] Error calculating token usage:', error);
        setTokenUsage({ total: 0, byBlock: [] });
      }
    }, 500);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [blocks, settings.model, getSelectedFileEntries]);

  /**
   * The context value that other components can consume
   */
  const contextValue: PromptContextType = {
    blocks,
    settings,
    addBlock,
    addBlocks,
    removeBlock,
    updateBlock,
    setSettings,
    updateFileBlock,
    tokenUsage,
    getFlattenedPrompt,
    importComposition,
    replaceTemplateGroup,
  };

  return <PromptContext.Provider value={contextValue}>{children}</PromptContext.Provider>;
};

/**
 * usePrompt
 * A simple hook for consuming the PromptContext in function components.
 */
export function usePrompt(): PromptContextType {
  return useContext(PromptContext);
}
