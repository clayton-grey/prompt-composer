
/**
 * @file PromptContext.tsx
 * @description
 * Provides global state management for the Prompt Composer's prompt blocks and settings.
 * We now switch from a synchronous flatten to an async flatten so we can handle nested placeholders
 * from .prompt-composer.
 *
 * Key changes for Step 5 (Nested Template Support):
 *  - Replaced getFlattenedPrompt() with an async method that calls flattenBlocksAsync(...) 
 *  - The rest of the context (blocks, token usage) remains mostly the same, though token usage
 *    still calculates without waiting for placeholders from the filesystem. The user will see 
 *    an approximate token count; if the inserted template is large, it will adjust after the 
 *    final flatten is produced (depending on future steps).
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

  updateFileBlock: (
    fileEntries: {
      path: string;
      content: string;
      language: string;
    }[],
    asciiMap?: string
  ) => void;

  tokenUsage: TokenUsage;

  /**
   * Returns a Promise that resolves to a single flattened prompt string by 
   * concatenating all blocks AND substituting any nested placeholders.
   */
  getFlattenedPrompt: () => Promise<string>;

  /**
   * Imports new blocks & settings from an XML file (replaces current).
   */
  importComposition: (newBlocks: Block[], newSettings: PromptSettings) => void;
}

const defaultSettings: PromptSettings = {
  maxTokens: 100000,
  model: 'gpt-4o'
};

const PromptContext = createContext<PromptContextType>({
  blocks: [],
  settings: defaultSettings,
  addBlock: () => {},
  removeBlock: () => {},
  updateBlock: () => {},
  setSettings: () => {},
  moveBlock: () => {},
  updateFileBlock: () => {},
  tokenUsage: { blockTokenUsage: {}, totalTokens: 0 },
  getFlattenedPrompt: async () => '',
  importComposition: () => {}
});

export const PromptProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [settings, setSettingsState] = useState<PromptSettings>(defaultSettings);

  const [tokenUsage, setTokenUsage] = useState<TokenUsage>({
    blockTokenUsage: {},
    totalTokens: 0
  });

  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize the token estimator for the specified model
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
          includeProjectMap: true
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
   * Returns a Promise that resolves to the fully flattened prompt (including nested template expansions).
   */
  const getFlattenedPrompt = useCallback(async (): Promise<string> => {
    const flattened = await flattenBlocksAsync(blocks);
    return flattened;
  }, [blocks]);

  const importComposition = useCallback(
    (newBlocks: Block[], newSettings: PromptSettings) => {
      setBlocks(newBlocks);
      setSettingsState(newSettings);
    },
    []
  );

  const contextValue: PromptContextType = {
    blocks,
    settings,
    addBlock,
    removeBlock,
    updateBlock,
    setSettings,
    moveBlock,
    updateFileBlock,
    tokenUsage,
    getFlattenedPrompt,
    importComposition
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
