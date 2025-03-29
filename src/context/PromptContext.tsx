/**
 * @file PromptContext.tsx
 * @description
 * Manages the array of prompt blocks (in memory), React state for prompt settings,
 * and provides methods to insert/update blocks or import an entire composition.
 *
 * Step 4 (Improve TypeScript Definitions):
 *  - Replaced catch blocks with (err: unknown) and added error instance checks.
 *  - Ensured function signatures remain strongly typed.
 *
 * Key Capabilities:
 *  1) Holds blocks[] and settings in state
 *  2) Provides methods addBlock, addBlocks, removeBlock, updateBlock
 *  3) Provides importComposition() to replace the entire composition
 *  4) Re-computes token usage using calculateTokenUsage from promptActions
 *  5) Provides getFlattenedPrompt() that calls flattenPrompt from promptActions
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';

import type { Block, FilesBlock } from '../types/Block';
import { useProject } from './ProjectContext';
import { parseTemplateBlocksAsync } from '../utils/templateBlockParserAsync';
import { TokenUsage, flattenPrompt, calculateTokenUsage } from '../utils/promptActions';

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
   */
  updateFileBlock: (
    fileEntries: { path: string; content: string; language: string }[],
    asciiMap?: string
  ) => void;

  /**
   * Current token usage snapshot for the entire composition.
   */
  tokenUsage: TokenUsage;

  /**
   * Called to produce the final flattened prompt string, including
   * ASCII map and selected file contents.
   */
  getFlattenedPrompt: () => Promise<string>;

  /**
   * Replaces the entire composition (blocks + settings) with new data.
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

export const PromptProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [settings, setSettingsState] = useState<PromptSettings>(defaultSettings);
  const [tokenUsage, setTokenUsage] = useState<TokenUsage>({ total: 0, byBlock: [] });

  const { getSelectedFileEntries, projectFolders } = useProject();
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const addBlock = useCallback((block: Block) => {
    setBlocks(prev => [...prev, block]);
  }, []);

  const addBlocks = useCallback((newBlocks: Block[]) => {
    setBlocks(prev => [...prev, ...newBlocks]);
  }, []);

  const removeBlock = useCallback((blockId: string) => {
    setBlocks(prev => prev.filter(b => b.id !== blockId));
  }, []);

  const updateBlock = useCallback((updatedBlock: Block) => {
    setBlocks(prev => prev.map(b => (b.id === updatedBlock.id ? updatedBlock : b)));
  }, []);

  const setSettings = useCallback((newSettings: PromptSettings) => {
    setSettingsState(newSettings);
  }, []);

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
          return newBlocks.filter((b, idx) => b.type !== 'files' || idx === existingIndex);
        }
      });
    },
    []
  );

  const importComposition = useCallback((newBlocks: Block[], newSettings: PromptSettings) => {
    setBlocks(newBlocks);
    setSettingsState(newSettings);
  }, []);

  const replaceTemplateGroup = useCallback(
    async (leadBlockId: string, groupId: string, newText: string, oldRawText: string) => {
      if (newText === oldRawText) {
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

      try {
        const newParsed = await parseTemplateBlocksAsync(newText, groupId, leadBlockId);
        setBlocks(prev => {
          const groupIndices: number[] = [];
          for (let i = 0; i < prev.length; i++) {
            if (prev[i].groupId === groupId) {
              groupIndices.push(i);
            }
          }
          if (groupIndices.length === 0) {
            return [...prev, ...newParsed];
          }
          const startIndex = Math.min(...groupIndices);
          const endIndex = Math.max(...groupIndices);
          const updated = [...prev];
          updated.splice(startIndex, endIndex - startIndex + 1, ...newParsed);
          return updated;
        });
      } catch (err: unknown) {
        if (err instanceof Error) {
          console.warn('[PromptContext] Error parsing partial raw edit:', err.message);
        } else {
          console.warn('[PromptContext] Unknown error parsing partial raw edit:', err);
        }
      }
    },
    []
  );

  const getFlattenedPrompt = useCallback(async () => {
    try {
      const selectedEntries = getSelectedFileEntries();
      const flattened = await flattenPrompt(blocks, projectFolders, selectedEntries);
      return flattened;
    } catch (err: unknown) {
      if (err instanceof Error) {
        console.error('[PromptContext] Failed to flatten prompt:', err.message);
      } else {
        console.error('[PromptContext] Unknown error flattening prompt:', err);
      }
      return '';
    }
  }, [blocks, projectFolders, getSelectedFileEntries]);

  // Recompute token usage whenever blocks, model, or selected file entries change.
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      try {
        const selectedEntries = getSelectedFileEntries();
        const usage = calculateTokenUsage(blocks, settings.model, selectedEntries);
        setTokenUsage(usage);
      } catch (err: unknown) {
        if (err instanceof Error) {
          console.error('[PromptContext] Error calculating token usage:', err.message);
        } else {
          console.error('[PromptContext] Unknown error calculating token usage:', err);
        }
        setTokenUsage({ total: 0, byBlock: [] });
      }
    }, 500);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [blocks, settings.model, getSelectedFileEntries]);

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

export function usePrompt(): PromptContextType {
  return useContext(PromptContext);
}
