
/**
 * @file PromptContext.tsx
 * @description
 * Provides global state management for the Prompt Composer's prompt blocks and settings.
 *
 * Newly added in Step 4 (Flip Editing):
 * - A method replaceTemplateGroup(leadBlockId, groupId, newText) that:
 *    1) Removes existing blocks with matching groupId,
 *    2) Calls parseTemplateBlocks() on the new text, forcing groupId & leadBlockId,
 *    3) Appends the newly parsed blocks to the composition.
 *
 * This allows "in-memory editing" or "flip" for a template block, letting the user see
 * the entire raw text, modify it, and re-initialize the group from that new text. The
 * original file on disk is not overwritten.
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

// Import the parseTemplateBlocks so we can re-parse updated text if user flips a template
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

  /**
   * Creates or updates a single file block containing the selected file entries
   */
  updateFileBlock: (
    fileEntries: { path: string; content: string; language: string }[],
    asciiMap?: string
  ) => void;

  tokenUsage: TokenUsage;
  getFlattenedPrompt: () => Promise<string>;
  importComposition: (newBlocks: Block[], newSettings: PromptSettings) => void;

  /**
   * Step 4: replaceTemplateGroup
   * Given a leadBlockId, groupId, and new raw text, remove all old blocks with that groupId,
   * parse the new text (forcing the same groupId), then ensure the first block has leadBlockId.
   */
  replaceTemplateGroup: (leadBlockId: string, groupId: string, newText: string) => void;
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
   * Returns a single multiline string that merges all blocks with nested template expansions
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
   * Step 4: replaceTemplateGroup
   * Removes existing blocks with the specified groupId, re-parses new text, ensures that
   * the first block's ID matches leadBlockId, and appends them to the composition.
   * This is the core logic behind the "flip" or "edit" in-memory template editing.
   */
  const replaceTemplateGroup = useCallback((leadBlockId: string, groupId: string, newText: string) => {
    setBlocks((prevBlocks) => {
      // 1) remove all blocks with that groupId
      const filtered = prevBlocks.filter((b) => b.groupId !== groupId);

      // 2) parse new text, forcing the same groupId
      const newParsed = parseTemplateBlocks(newText, groupId);

      // 3) if we have any parsed blocks, set the first block's ID to leadBlockId
      if (newParsed.length > 0) {
        newParsed[0].id = leadBlockId;
      }

      // 4) combine
      return [...filtered, ...newParsed];
    });
  }, []);

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
