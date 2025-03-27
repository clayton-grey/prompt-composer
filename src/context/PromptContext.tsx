
/**
 * @file PromptContext.tsx
 * @description
 * Provides global state management for the Prompt Composer's prompt blocks and settings.
 *
 * Updated to support:
 *  - replaceTemplateGroup with a splice-based approach to preserve block order exactly,
 *    so if a user flips a template (group) at index 2, we remove that group's blocks
 *    and reinsert the new blocks starting at index 2. This ensures other blocks remain
 *    below it or above it as is.
 *  - Skips re-parsing if the raw content is unchanged on confirm.
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Block, FilesBlock } from '../types/Block';
import { initEncoder, estimateTokens } from '../utils/tokenizer';
import { flattenBlocksAsync } from '../utils/flattenPrompt';
import { parseTemplateBlocks } from '../utils/templateBlockParser';

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
  addBlocks: (newBlocks: Block[]) => void;
  removeBlock: (blockId: string) => void;
  updateBlock: (updatedBlock: Block) => void;
  setSettings: (newSettings: PromptSettings) => void;
  moveBlock: (oldIndex: number, newIndex: number) => void;

  updateFileBlock: (
    fileEntries: { path: string; content: string; language: string }[],
    asciiMap?: string
  ) => void;

  tokenUsage: TokenUsage;
  getFlattenedPrompt: () => Promise<string>;
  importComposition: (newBlocks: Block[], newSettings: PromptSettings) => void;

  /**
   * replaceTemplateGroup
   * Removes existing blocks with that groupId, splices new blocks in at the lead block's position.
   * If the newText is unchanged from the old raw text, we skip re-parsing entirely.
   */
  replaceTemplateGroup: (leadBlockId: string, groupId: string, newText: string, oldRawText: string) => void;
}

const defaultSettings: PromptSettings = {
  maxTokens: 100000,
  model: 'gpt-4o'
};

const PromptContext = createContext<PromptContextType>({
  blocks: [],
  settings: defaultSettings,
  addBlock: () => {},
  addBlocks: () => {},
  removeBlock: () => {},
  updateBlock: () => {},
  setSettings: () => {},
  moveBlock: () => {},
  updateFileBlock: () => {},
  tokenUsage: { blockTokenUsage: {}, totalTokens: 0 },
  getFlattenedPrompt: async () => '',
  importComposition: () => {},
  replaceTemplateGroup: () => {}
});

export const PromptProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [settings, setSettingsState] = useState<PromptSettings>(defaultSettings);

  const [tokenUsage, setTokenUsage] = useState<TokenUsage>({
    blockTokenUsage: {},
    totalTokens: 0
  });

  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    initEncoder(settings.model);
  }, [settings.model]);

  // Debounced token usage recalculation
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      initEncoder(settings.model);

      const blockTokenUsage: Record<string, number> = {};
      let totalTokens = 0;

      blocks.forEach((block) => {
        let blockText = '';

        switch (block.type) {
          case 'text':
          case 'template':
            blockText = block.content || '';
            break;
          case 'files': {
            const fb = block as FilesBlock;
            const shouldIncludeMap = fb.includeProjectMap ?? true;
            const mapText = shouldIncludeMap && fb.projectAsciiMap ? fb.projectAsciiMap : '';
            const fileTexts = fb.files.map((f) => {
              return `<file_contents>
File: ${f.path}
\`\`\`${f.language}
${f.content}
\`\`\`
</file_contents>`;
            });
            const filesConcatenated = fileTexts.join('\n\n');
            blockText = shouldIncludeMap ? (mapText + '\n' + filesConcatenated) : filesConcatenated;
            break;
          }
        }

        const count = estimateTokens(blockText, settings.model);
        blockTokenUsage[block.id] = count;
        totalTokens += count;
      });

      setTokenUsage({ blockTokenUsage, totalTokens });
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [blocks, settings.model]);

  // CRUD actions for blocks
  const addBlock = useCallback((block: Block) => {
    setBlocks((prev) => [...prev, block]);
  }, []);

  const addBlocks = useCallback((newBlocks: Block[]) => {
    setBlocks((prev) => [...prev, ...newBlocks]);
  }, []);

  const removeBlock = useCallback((blockId: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== blockId));
  }, []);

  const updateBlock = useCallback((updatedBlock: Block) => {
    setBlocks((prev) => prev.map((b) => (b.id === updatedBlock.id ? updatedBlock : b)));
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
   * updateFileBlock
   * Creates or updates a single file block containing the selected file entries
   */
  const updateFileBlock = useCallback(
    (fileEntries: { path: string; content: string; language: string }[], asciiMap?: string) => {
      setBlocks((prev) => {
        const existingIndex = prev.findIndex((b) => b.type === 'files');
        const newId = uuidv4();

        const files = fileEntries.map((f) => ({
          path: f.path,
          content: f.content,
          language: f.language
        }));

        const candidate: FilesBlock = {
          id: newId,
          type: 'files',
          label: 'File Block',
          files,
          projectAsciiMap: asciiMap || '',
          includeProjectMap: true,
          locked: false
        };

        if (existingIndex === -1) {
          return [...prev, candidate];
        } else {
          const newBlocks = [...prev];
          newBlocks[existingIndex] = candidate;
          // remove any other file blocks
          return newBlocks.filter((b, idx) => (b.type !== 'files' || idx === existingIndex));
        }
      });
    },
    []
  );

  /**
   * getFlattenedPrompt
   * Returns a single multiline string that merges all blocks with nested expansions
   */
  const getFlattenedPrompt = useCallback(async (): Promise<string> => {
    const flattened = await flattenBlocksAsync(blocks);
    return flattened;
  }, [blocks]);

  /**
   * importComposition
   * Replaces existing blocks and settings with those from an imported composition
   */
  const importComposition = useCallback(
    (newBlocks: Block[], newSettings: PromptSettings) => {
      setBlocks(newBlocks);
      setSettingsState(newSettings);
    },
    []
  );

  /**
   * replaceTemplateGroup
   * If newText is identical to oldRawText, we do nothing, else we parse new text
   * removing the old group's blocks and splicing in the newly parsed blocks
   * at the same index the lead block was previously.
   */
  const replaceTemplateGroup = useCallback(
    (leadBlockId: string, groupId: string, newText: string, oldRawText: string) => {
      // 1) If the text is unchanged, skip
      if (newText === oldRawText) {
        // Simply find the lead block and set editingRaw=false if it's still set
        setBlocks((prev) => {
          return prev.map((b) => {
            if (b.id === leadBlockId && b.editingRaw) {
              return { ...b, editingRaw: false };
            }
            return b;
          });
        });
        return;
      }

      setBlocks((prev) => {
        // Find the index range of the group
        const groupIndices = [];
        for (let i = 0; i < prev.length; i++) {
          if (prev[i].groupId === groupId) {
            groupIndices.push(i);
          }
        }
        if (groupIndices.length === 0) {
          // No blocks in that group, do nothing
          return prev;
        }

        const startIndex = Math.min(...groupIndices);
        const endIndex = Math.max(...groupIndices);

        // Parse the new text
        const newBlocks = parseTemplateBlocks(newText, groupId, leadBlockId);

        // Remove [startIndex..endIndex], then splice in newBlocks at startIndex
        const updated = [...prev];
        updated.splice(startIndex, endIndex - startIndex + 1, ...newBlocks);

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
    moveBlock,
    updateFileBlock,
    tokenUsage,
    getFlattenedPrompt,
    importComposition,
    replaceTemplateGroup
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
