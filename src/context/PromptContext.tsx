/**
 * @file PromptContext.tsx
 * @description
 * Provides global state management for the Prompt Composer's prompt blocks and settings.
 *
 * Changes in Step 3:
 *  - Removed the 'moveBlock' method and any references to it since we have
 *    removed block reordering from the UI. The user now primarily relies on
 *    raw edit for major structural changes.
 *
 * Key functionalities retained:
 *  - Manage the array of blocks (text, template, files).
 *  - Provide synchronous or asynchronous updates, removal, updates, etc.
 *  - Estimate tokens for each block in real time (with a debounce).
 *  - Flatten the entire composition into a single string (getFlattenedPrompt).
 *
 * @author Prompt Composer
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Block, FilesBlock } from '../types/Block';
import { flattenBlocksAsync } from '../utils/flattenPrompt';
import { parseTemplateBlocksAsync } from '../utils/templateBlockParserAsync';
import { initEncoder, estimateTokens } from '../utils/tokenEstimator';
import { useProject } from './ProjectContext';

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

  /**
   * @deprecated Reordering is removed in Step 3. No longer used.
   * moveBlock: (oldIndex: number, newIndex: number) => void;
   */

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
  model: 'gpt-4o',
};

const PromptContext = createContext<PromptContextType>({
  blocks: [],
  settings: defaultSettings,
  addBlock: () => {},
  addBlocks: () => {},
  removeBlock: () => {},
  updateBlock: () => {},
  setSettings: () => {},
  // moveBlock is removed in the new design
  updateFileBlock: () => {},
  tokenUsage: { total: 0, byBlock: [] },
  getFlattenedPrompt: async () => '',
  importComposition: () => {},
  replaceTemplateGroup: async () => {},
});

export const PromptProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [settings, setSettingsState] = useState<PromptSettings>(defaultSettings);
  const { getSelectedFileEntries } = useProject();

  const [tokenUsage, setTokenUsage] = useState<TokenUsage>({ total: 0, byBlock: [] });

  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // We re-initialize the encoder whenever the model changes
    initEncoder(settings.model);
  }, [settings.model]);

  // Single effect for token calculation
  useEffect(() => {
    const calculateTokenUsage = async () => {
      if (!settings.model) {
        setTokenUsage({ total: 0, byBlock: [] });
        return;
      }

      try {
        // Wait for electronAPI to be available
        if (!window?.electronAPI) {
          return;
        }

        const selectedFileEntries = getSelectedFileEntries();
        const fileContents = await Promise.all(
          selectedFileEntries.map(async entry => {
            try {
              const content = await window.electronAPI.readFile(entry.path);
              return {
                path: entry.path,
                content,
                language: entry.language || 'text',
              };
            } catch (error) {
              console.error(`Error reading file ${entry.path}:`, error);
              return null;
            }
          })
        );

        const validFileContents = fileContents.filter(
          (entry): entry is NonNullable<typeof entry> => entry !== null
        );

        // Calculate tokens for all blocks
        const newTokenUsage: TokenUsage = {
          total: 0,
          byBlock: [],
        };

        for (const block of blocks) {
          let content = '';

          switch (block.type) {
            case 'text':
            case 'template':
              content = block.content || '';
              break;
            case 'files': {
              const fb = block as FilesBlock;
              const shouldIncludeMap = fb.includeProjectMap ?? true;
              const mapText = shouldIncludeMap && fb.projectAsciiMap ? fb.projectAsciiMap : '';
              const fileTexts = validFileContents.map(f => {
                return `<file_contents>
File: ${f.path}
\`\`\`${f.language}
${f.content}
\`\`\`
</file_contents>`;
              });
              const filesConcatenated = fileTexts.join('\n\n');
              content = shouldIncludeMap ? mapText + '\n' + filesConcatenated : filesConcatenated;
              break;
            }
            case 'promptResponse':
              content = block.content;
              break;
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

    // Run calculation immediately
    calculateTokenUsage();

    // Also set up debounced calculation for subsequent updates
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
   * The single "files" block is updated or created.
   * If it does not exist, we add one; if it does, we overwrite it.
   * Only one file block is stored at a time in new design.
   */
  const updateFileBlock = useCallback(
    (fileEntries: { path: string; content: string; language: string }[], asciiMap?: string) => {
      setBlocks(prev => {
        const existingIndex = prev.findIndex(b => b.type === 'files');
        const newId = uuidv4();

        const files = fileEntries.map(f => ({
          path: f.path,
          content: f.content,
          language: f.language,
        }));

        const candidate: FilesBlock = {
          id: newId,
          type: 'files',
          label: 'File Block',
          files,
          projectAsciiMap: asciiMap || '',
          includeProjectMap: true,
          locked: false,
        };

        if (existingIndex === -1) {
          return [...prev, candidate];
        } else {
          const newBlocks = [...prev];
          newBlocks[existingIndex] = candidate;
          // remove any additional "files" blocks if they somehow exist
          return newBlocks.filter((b, idx) => b.type !== 'files' || idx === existingIndex);
        }
      });
    },
    []
  );

  /**
   * getFlattenedPrompt
   * Assembles a final multiline prompt string from the blocks array.
   */
  const getFlattenedPrompt = useCallback(async (): Promise<string> => {
    const flattened = await flattenBlocksAsync(blocks);
    return flattened;
  }, [blocks]);

  /**
   * importComposition
   * Replaces the current block set and settings with imported data.
   */
  const importComposition = useCallback((newBlocks: Block[], newSettings: PromptSettings) => {
    setBlocks(newBlocks);
    setSettingsState(newSettings);
  }, []);

  /**
   * replaceTemplateGroup
   * Used when the user confirms a raw edit on a template group. We parse the new text
   * into blocks, remove the old group, and splice in the new blocks.
   */
  const replaceTemplateGroup = useCallback(
    async (leadBlockId: string, groupId: string, newText: string, oldRawText: string) => {
      if (newText === oldRawText) {
        // skip
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

      // parse new text
      const newParsed = await parseTemplateBlocksAsync(newText, groupId, leadBlockId);

      // remove old group blocks, splice new
      setBlocks(prev => {
        const groupIndices: number[] = [];
        for (let i = 0; i < prev.length; i++) {
          if (prev[i].groupId === groupId) {
            groupIndices.push(i);
          }
        }
        if (groupIndices.length === 0) {
          // if no old group found, just append
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
