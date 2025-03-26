
/**
 * @file PromptContext.tsx
 * @description
 * Provides global state management for the Prompt Composer's prompt blocks and settings.
 * 
 * After Step 3, we remove any references to tri-state file selection or selected files 
 * because that now lives in ProjectContext as part of the "Project Manager" logic. 
 * 
 * Key functionalities that remain:
 *  - Managing array of blocks (text, template, files)
 *  - Global prompt settings (maxTokens, model)
 *  - Utility methods for adding, removing, updating blocks
 *  - Real-time token usage for each block's content
 *  - Flatten final prompt 
 *  - Import compositions from XML
 * 
 * We still do "file blocks," but if the user wants to incorporate selected files, 
 * they must retrieve them from ProjectContext (getSelectedFileEntries) in the UI 
 * (e.g., PromptBuilder) and pass them to updateFileBlock(...) here.
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect
} from 'react';
import { v4 as uuidv4 } from 'uuid';

import type { Block, FilesBlock } from '../types/Block';
import { initEncoder, estimateTokens } from '../utils/tokenizer';
import { flattenBlocks } from '../utils/flattenPrompt';

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

  /**
   * Overwrites or creates the single FilesBlock with the given file entries 
   * (the user typically obtains these from ProjectContext's getSelectedFileEntries).
   */
  updateFileBlock: (
    fileEntries: {
      path: string;
      content: string;
      language: string;
    }[]
  ) => void;

  tokenUsage: TokenUsage;
  getFlattenedPrompt: () => string;

  /**
   * Replaces the entire composition with new blocks/settings from an imported XML.
   */
  importComposition: (newBlocks: Block[], newSettings: PromptSettings) => void;
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
  updateFileBlock: () => {},
  tokenUsage: { blockTokenUsage: {}, totalTokens: 0 },
  getFlattenedPrompt: () => '',
  importComposition: () => {}
});

export const PromptProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [settings, setSettingsState] = useState<PromptSettings>(defaultSettings);

  const [tokenUsage, setTokenUsage] = useState<TokenUsage>({
    blockTokenUsage: {},
    totalTokens: 0
  });

  /**
   * On mount, init the simple token estimator.
   */
  useEffect(() => {
    initEncoder(settings.model);
  }, [settings.model]);

  /**
   * Recalculate token usage whenever blocks or the model changes.
   */
  useEffect(() => {
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
          const filesConcatenated = fb.files.map((f) => f.content).join('\n');
          blockText = mapText + '\n' + filesConcatenated;
          break;
        }
        default:
          blockText = '';
      }

      const count = estimateTokens(blockText);
      blockTokenUsage[block.id] = count;
      totalTokens += count;
    });

    setTokenUsage({ blockTokenUsage, totalTokens });
  }, [blocks, settings.model]);

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

  /**
   * updateFileBlock: Overwrite or create the single file block with the given file entries.
   */
  const updateFileBlock = useCallback(
    (fileEntries: { path: string; content: string; language: string }[]) => {
      setBlocks((prev) => {
        const existingIndex = prev.findIndex((b) => b.type === 'files');
        const newId = uuidv4();
        const candidate: FilesBlock = {
          id: newId,
          type: 'files',
          label: 'File Block',
          files: fileEntries.map((f) => ({
            path: f.path,
            content: f.content,
            language: f.language
          })),
          projectAsciiMap: '',
          includeProjectMap: true
        };

        // We do not automatically generate the ASCII map here. 
        // It's typically assigned externally or we can do it asynchronously if desired.

        if (existingIndex === -1) {
          return [...prev, candidate];
        } else {
          const newBlocks = [...prev];
          newBlocks[existingIndex] = candidate;
          // Remove any other file blocks if they exist
          return newBlocks.filter(
            (b, idx) => b.type !== 'files' || idx === existingIndex
          );
        }
      });
    },
    []
  );

  /**
   * Flatten the blocks into a single prompt string.
   */
  const getFlattenedPrompt = useCallback((): string => {
    return flattenBlocks(blocks);
  }, [blocks]);

  /**
   * Import a new composition from XML. Replace blocks & settings entirely.
   */
  const importComposition = useCallback((newBlocks: Block[], newSettings: PromptSettings) => {
    setBlocks(newBlocks);
    setSettingsState(newSettings);
  }, []);

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
