/**
 * @file PromptContext.tsx
 * @description
 * Manages the array of prompt blocks, raw editing, flattening logic, and token usage.
 *
 * In this update (Step 1: Unify ASCII Tree Generation):
 *  - We REMOVE the function generateCombinedAsciiMapsForFolders, which was used to
 *    generate ASCII for multiple folders. Instead, we import the new
 *    generateAsciiTree function from asciiTreeGenerator.ts.
 *  - Where we previously called generateCombinedAsciiMapsForFolders in getFlattenedPrompt,
 *    we now call generateAsciiTree([ ... ]) from asciiTreeGenerator.
 *
 * Key Responsibilities (unchanged):
 *  - Flatten blocks to produce final prompt string
 *  - Store Prompt Settings
 *  - Provide methods for raw template editing
 *  - Provide prompt response block logic
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Block, FilesBlock } from '../types/Block';
import { flattenBlocksAsync } from '../utils/flattenPrompt';
import { parseTemplateBlocksAsync } from '../utils/templateBlockParserAsync';
import { initEncoder, estimateTokens } from '../utils/tokenEstimator';
import { useProject } from './ProjectContext';
import { generateAsciiTree } from '../utils/asciiTreeGenerator';

interface PromptSettings {
  maxTokens: number;
  model: string;
}

interface TokenUsage {
  total: number;
  byBlock: Array<{
    blockId: string;
    tokens: number;
  }>;
}

interface PromptContextType {
  blocks: Block[];
  settings: PromptSettings;

  addBlock: (block: Block) => void;
  addBlocks: (newBlocks: Block[]) => void;
  removeBlock: (blockId: string) => void;
  updateBlock: (updatedBlock: Block) => void;
  setSettings: (newSettings: PromptSettings) => void;

  updateFileBlock: (
    fileEntries: { path: string; content: string; language: string }[],
    asciiMap?: string
  ) => void;

  tokenUsage: TokenUsage;
  getFlattenedPrompt: () => Promise<string>;
  importComposition: (newBlocks: Block[], newSettings: PromptSettings) => void;
  replaceTemplateGroup: (
    leadBlockId: string,
    groupId: string,
    newText: string,
    oldRawText: string
  ) => Promise<void>;
}

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
  const { getSelectedFileEntries, projectFolders } = useProject();

  const [tokenUsage, setTokenUsage] = useState<TokenUsage>({ total: 0, byBlock: [] });

  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Initialize encoder
    initEncoder(settings.model);
  }, [settings.model]);

  // Recompute token usage
  useEffect(() => {
    const calculateTokenUsage = async () => {
      if (!settings.model) {
        setTokenUsage({ total: 0, byBlock: [] });
        return;
      }

      try {
        const selectedFileEntries = getSelectedFileEntries();
        const newTokenUsage: TokenUsage = {
          total: 0,
          byBlock: [],
        };

        for (const block of blocks) {
          let content = '';

          if (block.type === 'text' || block.type === 'template') {
            content = block.content || '';
          } else if (block.type === 'files') {
            const fb = block as FilesBlock;
            const mapText = fb.includeProjectMap && fb.projectAsciiMap ? fb.projectAsciiMap : '';
            // combine
            let fileTexts = '';
            for (const entry of selectedFileEntries) {
              fileTexts += `<file_contents>\nFile: ${entry.path}\n\`\`\`${entry.language}\n${entry.content}\n\`\`\`\n</file_contents>\n`;
            }
            content = (mapText ? mapText + '\n' : '') + fileTexts;
          } else if (block.type === 'promptResponse') {
            content = block.content || '';
          }

          const tokens = estimateTokens(content, settings.model);
          newTokenUsage.total += tokens;
          newTokenUsage.byBlock.push({ blockId: block.id, tokens });
        }

        setTokenUsage(newTokenUsage);
      } catch (error) {
        console.error('Error calculating token usage:', error);
        setTokenUsage({ total: 0, byBlock: [] });
      }
    };

    calculateTokenUsage();

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(calculateTokenUsage, 500);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [blocks, settings.model, getSelectedFileEntries]);

  // Basic CRUD
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

  /**
   * updateFileBlock
   * legacy method from older design
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
          return newBlocks.filter((b, idx) => b.type !== 'files' || idx === existingIndex);
        }
      });
    },
    []
  );

  /**
   * getFlattenedPrompt
   * If a FileBlock has includeProjectMap===true but no projectAsciiMap, we generate ASCII
   * by calling generateAsciiTree(projectFolders).
   */
  const getFlattenedPrompt = useCallback(async (): Promise<string> => {
    // Potentially generate ASCII map if needed
    let updatedBlocks = [...blocks];

    for (let i = 0; i < updatedBlocks.length; i++) {
      const b = updatedBlocks[i];
      if (b.type === 'files') {
        const fb = b as FilesBlock;
        if (fb.includeProjectMap && (!fb.projectAsciiMap || !fb.projectAsciiMap.trim())) {
          if (projectFolders.length > 0) {
            // Use new asciiTreeGenerator
            const combinedMap = await generateAsciiTree(projectFolders);
            fb.projectAsciiMap = combinedMap;
          } else {
            fb.projectAsciiMap = '';
          }
          updatedBlocks[i] = fb;
        }
      }
    }

    const selectedEntries = getSelectedFileEntries();
    const flattened = await flattenBlocksAsync(updatedBlocks, selectedEntries);
    return flattened;
  }, [blocks, getSelectedFileEntries, projectFolders]);

  const importComposition = useCallback((newBlocks: Block[], newSettings: PromptSettings) => {
    setBlocks(newBlocks);
    setSettingsState(newSettings);
  }, []);

  /**
   * replaceTemplateGroup
   * We do a partial re-parse of a "group" if the user does raw editing.
   */
  const replaceTemplateGroup = useCallback(
    async (leadBlockId: string, groupId: string, newText: string, oldRawText: string) => {
      if (newText === oldRawText) {
        setBlocks(prev => {
          return prev.map(b => {
            if (b.id === leadBlockId && b.editingRaw) {
              return { ...b, editingRaw: false };
            }
            return b;
          });
        });
        return;
      }
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
    },
    []
  );

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

export const usePrompt = (): PromptContextType => {
  return useContext(PromptContext);
};
