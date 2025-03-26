/**
 * @file PromptContext.tsx
 * @description
 * Provides global state management for the Prompt Composer's prompt blocks and settings.
 *
 * This context tracks:
 *   1) An array of blocks (text, template, files)
 *   2) Global prompt settings (maxTokens, model)
 *   3) Token usage calculations for each block and total
 *   4) Flattened prompt generation
 *   5) Composition import/export for XML
 *
 * PERFORMANCE & TOKEN ESTIMATION UPDATE (Step 1):
 *   - We introduce a 300ms debounce to our token usage recalculation to avoid excessive
 *     re-computation while the user is actively typing or editing blocks.
 *   - We increase the default maxTokens from 8000 to 100000.
 *
 * Key Functionalities:
 *   - addBlock, removeBlock, updateBlock, moveBlock: manage the block array
 *   - updateFileBlock: merges in file references from the ProjectContext
 *   - getFlattenedPrompt: builds the final prompt text
 *   - importComposition: replaces the entire state from an XML
 *   - Real-time token usage (debounced) shown in BottomBar
 *
 * @notes
 *   - We rely on a simple word-based token estimator in /utils/tokenizer for this MVP.
 *   - If further performance improvements are needed, we can refine the approach or
 *     switch to a worker thread for token counting.
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
import { flattenBlocks } from '../utils/flattenPrompt';

interface PromptSettings {
  /**
   * The maximum token limit for the entire prompt, used for warnings.
   */
  maxTokens: number;

  /**
   * The model identifier (e.g. 'gpt-4') we are using for encoding reference.
   */
  model: string;
}

interface TokenUsage {
  /**
   * Map of block ID -> token count for that block
   */
  blockTokenUsage: Record<string, number>;

  /**
   * The total token count for all blocks combined
   */
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
   * Overwrites or creates the single FilesBlock with the given file entries.
   * Typically invoked after the user selects files in ProjectContext.
   * @param fileEntries - Array of file entries with path, content, and language
   * @param asciiMap - Optional ASCII representation of the file structure
   */
  updateFileBlock: (
    fileEntries: {
      path: string;
      content: string;
      language: string;
    }[],
    asciiMap?: string
  ) => void;

  /**
   * Current token usage (block-by-block and total).
   */
  tokenUsage: TokenUsage;

  /**
   * Returns a single flattened prompt string by concatenating all blocks.
   */
  getFlattenedPrompt: () => string;

  /**
   * Imports new blocks & settings from an XML file (replaces current).
   */
  importComposition: (newBlocks: Block[], newSettings: PromptSettings) => void;
}

/**
 * Default prompt settings, now with maxTokens = 100000 (was previously 8000).
 */
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
   * We use a ref to store the debounce timer ID so we can clear it on cleanup or re-trigger.
   */
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * On mount or when the model changes, initialize the encoder.
   */
  useEffect(() => {
    initEncoder(settings.model);
  }, [settings.model]);

  /**
   * Debounced token usage recalculation every time blocks or model changes.
   */
  useEffect(() => {
    // Clear any existing timer
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Set a new 300ms debounce
    debounceRef.current = setTimeout(() => {
      // 1) Re-init (in case model changed)
      initEncoder(settings.model);

      // 2) Calculate token usage per block
      const blockTokenUsage: Record<string, number> = {};
      let totalTokens = 0;

      console.log(`[PromptContext] Recalculating tokens for ${blocks.length} blocks with model: ${settings.model}`);
      
      blocks.forEach((block) => {
        let blockText = '';

        switch (block.type) {
          case 'text':
          case 'template':
            blockText = block.content || '';
            console.log(`[PromptContext] ${block.type} block (${block.id}): ${blockText.length} chars`);
            break;
          case 'files': {
            const fb = block as FilesBlock;
            // Check if the file map should be included in token count
            const shouldIncludeMap = fb.includeProjectMap ?? true;
            // Only include the map text if shouldIncludeMap is true
            const mapText = shouldIncludeMap && fb.projectAsciiMap ? fb.projectAsciiMap : '';
            
            console.log(`[PromptContext] Files block (${block.id}): ${fb.files.length} files`);
            console.log(`[PromptContext] Map included: ${shouldIncludeMap}, map length: ${mapText.length}`);
            
            // Create a more detailed representation of each file for token counting
            const fileTexts = fb.files.map(f => {
              const formattedFile = `<file_contents>\nFile: ${f.path}\n\`\`\`${f.language}\n${f.content}\n\`\`\`\n</file_contents>`;
              const fileTokens = estimateTokens(formattedFile, settings.model);
              console.log(`[PromptContext] File ${f.path}: ${f.content.length} chars, estimated tokens: ${fileTokens}`);
              return formattedFile;
            });
            
            const filesConcatenated = fileTexts.join('\n\n');
            // Only include mapText if shouldIncludeMap is true
            blockText = shouldIncludeMap ? (mapText + '\n' + filesConcatenated) : filesConcatenated;
            console.log(`[PromptContext] Total files block length: ${blockText.length} chars`);
            console.log(`[PromptContext] File map included in token count: ${shouldIncludeMap}`);
            break;
          }
          default:
            blockText = '';
        }

        // Pass the model parameter to estimateTokens
        const count = estimateTokens(blockText, settings.model);
        console.log(`[PromptContext] Block ${block.id} token count: ${count}`);
        blockTokenUsage[block.id] = count;
        totalTokens += count;
      });

      console.log(`[PromptContext] Total token count: ${totalTokens}`);
      setTokenUsage({ blockTokenUsage, totalTokens });
    }, 300);

    // Cleanup on unmount or next effect
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [blocks, settings.model]);

  /**
   * Adds a new block to the composition.
   */
  const addBlock = useCallback((block: Block) => {
    setBlocks((prev) => [...prev, block]);
  }, []);

  /**
   * Removes a block by its unique ID.
   */
  const removeBlock = useCallback((blockId: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== blockId));
  }, []);

  /**
   * Updates an existing block by matching its ID.
   */
  const updateBlock = useCallback((updatedBlock: Block) => {
    setBlocks((prev) => {
      return prev.map((b) => (b.id === updatedBlock.id ? updatedBlock : b));
    });
  }, []);

  /**
   * Sets new global settings for the prompt.
   */
  const setSettings = useCallback((newSettings: PromptSettings) => {
    setSettingsState(newSettings);
  }, []);

  /**
   * Moves a block from oldIndex to newIndex in the array (for reorder).
   */
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
   * Overwrites or creates a single file block with the given file entries.
   */
  const updateFileBlock = useCallback(
    (fileEntries: { path: string; content: string; language: string }[], asciiMap?: string) => {
      console.log(`[PromptContext] updateFileBlock called with ${fileEntries.length} files`);
      if (asciiMap) {
        console.log(`[PromptContext] ASCII map provided (${asciiMap.length} chars)`);
      } else {
        console.log(`[PromptContext] No ASCII map provided`);
      }
      
      setBlocks((prev) => {
        const existingIndex = prev.findIndex((b) => b.type === 'files');
        const newId = uuidv4();
        
        // Build the files array with proper formatting
        const files = fileEntries.map(f => ({
          path: f.path,
          content: f.content,
          language: f.language
        }));
        
        console.log(`[PromptContext] Creating file block with ${files.length} files`);
        
        // For debugging, calculate estimated tokens for this block
        const dummyContent = files.map(f => 
          `<file_contents>\nFile: ${f.path}\n\`\`\`${f.language}\n${f.content}\n\`\`\`\n</file_contents>`
        ).join('\n\n');
        
        // Calculate tokens including the ASCII map if provided
        const mapContent = asciiMap || '';
        const fullContent = mapContent ? mapContent + '\n\n' + dummyContent : dummyContent;
        const estimatedTokens = estimateTokens(fullContent, settings.model);
        
        console.log(`[PromptContext] Estimated tokens for new file block: ${estimatedTokens}`);
        
        const candidate: FilesBlock = {
          id: newId,
          type: 'files',
          label: 'File Block',
          files: files,
          projectAsciiMap: asciiMap || '',
          includeProjectMap: true
        };

        if (existingIndex === -1) {
          console.log(`[PromptContext] No existing file block, adding new one`);
          return [...prev, candidate];
        } else {
          console.log(`[PromptContext] Replacing existing file block at index ${existingIndex}`);
          const newBlocks = [...prev];
          newBlocks[existingIndex] = candidate;
          // Remove any other file blocks if they exist
          return newBlocks.filter(
            (b, idx) => b.type !== 'files' || idx === existingIndex
          );
        }
      });
    },
    [settings.model]
  );

  /**
   * Builds the final flattened prompt string from all blocks in order.
   */
  const getFlattenedPrompt = useCallback((): string => {
    return flattenBlocks(blocks);
  }, [blocks]);

  /**
   * Imports an entire composition from an XML source. Replaces blocks & settings.
   */
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

/**
 * usePrompt
 * @returns The prompt context object
 */
export const usePrompt = (): PromptContextType => {
  return useContext(PromptContext);
};

