
/**
 * @file PromptContext.tsx
 * @description
 * Provides global state management for the Prompt Composer application, including:
 * - An array of Blocks (text, template, files)
 * - Global Prompt settings (maxTokens, model)
 * - Utility methods for adding, removing, and updating blocks
 * - Real-time token usage calculation for blocks
 * - Single file block enforcement
 * - Tracking user-selected files from the file tree (selectedFiles), plus a token usage preview
 * - A new getFlattenedPrompt() method that returns the final prompt string
 *
 * Step 3 changes:
 * - We introduced selectedFiles, selectedFilesTokenCount, and updateSelectedFiles() for FileTree selection.
 * Step 13 changes (Copy-to-Clipboard):
 * - We add getFlattenedPrompt(), calling flattenBlocks(blocks) from flattenPrompt.ts
 *
 * @notes
 *  - We keep template placeholders in the final prompt as-is in MVP.
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect
} from 'react';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

import type { Block, FilesBlock } from '../types/Block';
import { initEncoder, estimateTokens } from '../utils/tokenizer';
import { flattenBlocks } from '../utils/flattenPrompt';

/**
 * Defines prompt-wide settings such as the maximum token limit and the chosen model.
 */
interface PromptSettings {
  /**
   * The maximum number of tokens allowed for this prompt.
   * The bottom bar will display a warning if the total usage exceeds this value.
   */
  maxTokens: number;

  /**
   * The name of the model for which token estimation is intended (e.g., 'gpt-4').
   */
  model: string;
}

/**
 * Token usage structure, storing per-block usage and the total for the prompt blocks.
 */
interface TokenUsage {
  /**
   * A mapping of block ID -> token usage count for that block.
   */
  blockTokenUsage: Record<string, number>;

  /**
   * The total token count for all blocks combined.
   */
  totalTokens: number;
}

/**
 * PromptContextType describes everything we expose from this context:
 * - blocks: the array of prompt blocks
 * - settings: user-defined (or default) settings
 * - addBlock, removeBlock, updateBlock, moveBlock: CRUD/reorder for blocks
 * - setSettings: update global prompt settings
 * - tokenUsage: computed usage for all blocks
 * - selectedFiles, selectedFilesTokenCount: user selection from FileTree
 * - updateSelectedFiles: sets the user's selected files
 * - getSelectedFileEntries: returns an array of { path, content, language }
 * - setSingleFileBlock: ensures only one file block
 * - getFlattenedPrompt: returns a single string that merges all blocks in order
 */
interface PromptContextType {
  blocks: Block[];
  settings: PromptSettings;
  addBlock: (block: Block) => void;
  removeBlock: (blockId: string) => void;
  updateBlock: (updatedBlock: Block) => void;
  setSettings: (newSettings: PromptSettings) => void;
  moveBlock: (oldIndex: number, newIndex: number) => void;
  addFileBlock: (filePath: string, fileContent: string, language: string) => void;
  setSingleFileBlock: (
    fileEntries: {
      path: string;
      content: string;
      language: string;
    }[]
  ) => void;
  tokenUsage: TokenUsage;
  selectedFiles: Record<string, string>;
  selectedFilesTokenCount: number;
  updateSelectedFiles: (fileMap: Record<string, string>) => void;
  getSelectedFileEntries: () => Array<{ path: string; content: string; language: string }>;

  /**
   * Returns a flattened prompt string by concatenating all blocks in order,
   * formatting file blocks with <file_contents>, etc.
   */
  getFlattenedPrompt: () => string;
}

/**
 * Default settings for the prompt if the user doesn't provide any custom values.
 */
const defaultSettings: PromptSettings = {
  maxTokens: 8000,
  model: 'gpt-4'
};

/**
 * The initial context object, mostly placeholders.
 */
const PromptContext = createContext<PromptContextType>({
  blocks: [],
  settings: defaultSettings,
  addBlock: () => {},
  removeBlock: () => {},
  updateBlock: () => {},
  setSettings: () => {},
  moveBlock: () => {},
  addFileBlock: () => {},
  setSingleFileBlock: () => {},
  tokenUsage: {
    blockTokenUsage: {},
    totalTokens: 0
  },
  selectedFiles: {},
  selectedFilesTokenCount: 0,
  updateSelectedFiles: () => {},
  getSelectedFileEntries: () => [],
  getFlattenedPrompt: () => ''
});

/**
 * guessLanguageFromExtension:
 * Helper to guess a language for code fencing or labeling based on file extension.
 * This is reused when we convert selected file entries or create file blocks.
 */
function guessLanguageFromExtension(ext: string): string {
  switch (ext.toLowerCase()) {
    case 'js':
    case 'jsx':
      return 'javascript';
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'py':
      return 'python';
    case 'md':
      return 'markdown';
    case 'json':
      return 'json';
    case 'css':
      return 'css';
    case 'html':
      return 'html';
    default:
      return 'plaintext';
  }
}

/**
 * PromptProvider: The React Context provider component that holds and manages:
 * - The array of Blocks
 * - The prompt settings
 * - The total token usage
 * - All CRUD/management methods
 * - Single-file-block enforcement
 * - Tracking user-selected files from the file tree
 * - The getFlattenedPrompt() method for final prompt
 */
export const PromptProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [settings, setSettingsState] = useState<PromptSettings>(defaultSettings);
  const [tokenUsage, setTokenUsage] = useState<TokenUsage>({
    blockTokenUsage: {},
    totalTokens: 0
  });

  const [selectedFiles, setSelectedFiles] = useState<Record<string, string>>({});
  const [selectedFilesTokenCount, setSelectedFilesTokenCount] = useState<number>(0);

  /**
   * addBlock: Appends a new block to the blocks array.
   */
  const addBlock = useCallback((block: Block) => {
    setBlocks((prev) => [...prev, block]);
  }, []);

  /**
   * removeBlock: Removes a block from the array by ID.
   */
  const removeBlock = useCallback((blockId: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== blockId));
  }, []);

  /**
   * updateBlock: Replaces a block with the same ID in the array.
   */
  const updateBlock = useCallback((updatedBlock: Block) => {
    setBlocks((prev) => {
      return prev.map((b) => (b.id === updatedBlock.id ? updatedBlock : b));
    });
  }, []);

  /**
   * setSettings: Replaces the entire settings object (maxTokens, model).
   */
  const setSettings = useCallback((newSettings: PromptSettings) => {
    setSettingsState(newSettings);
  }, []);

  /**
   * moveBlock: Reorders blocks by removing the block at oldIndex and inserting at newIndex.
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
   * addFileBlock: Creates a new file block for a single file. 
   * If a file block already exists, we skip (only one file block allowed).
   */
  const addFileBlock = useCallback(
    (filePath: string, fileContent: string, language: string) => {
      // Check if there's already a file block
      const existingFileBlock = blocks.find((b) => b.type === 'files') as FilesBlock | undefined;
      if (existingFileBlock) {
        console.log(
          '[PromptContext] addFileBlock called, but a file block already exists. Ignoring.'
        );
        return;
      }

      const fileName = path.basename(filePath);
      const newBlock: FilesBlock = {
        id: uuidv4(),
        type: 'files',
        label: `File Block: ${fileName}`,
        files: [
          {
            path: filePath,
            content: fileContent,
            language
          }
        ]
      };

      setBlocks((prev) => [...prev, newBlock]);
    },
    [blocks]
  );

  /**
   * setSingleFileBlock: ensures there's only ONE file block in the entire prompt flow.
   * Overwrites the existing file block if present, or creates one if none exist.
   */
  const setSingleFileBlock = useCallback(
    (
      fileEntries: {
        path: string;
        content: string;
        language: string;
      }[]
    ) => {
      setBlocks((prev) => {
        // 1) Find if there's an existing file block
        const existingBlockIndex = prev.findIndex((b) => b.type === 'files');

        if (existingBlockIndex === -1) {
          // No file block found, create one
          const newBlock: FilesBlock = {
            id: uuidv4(),
            type: 'files',
            label: 'File Block',
            files: fileEntries.map((f) => ({
              path: f.path,
              content: f.content,
              language: f.language
            }))
          };
          return [...prev, newBlock];
        } else {
          // 2) Update the existing file block
          const existingBlock = prev[existingBlockIndex] as FilesBlock;
          const updatedBlock: FilesBlock = {
            ...existingBlock,
            files: fileEntries.map((f) => ({
              path: f.path,
              content: f.content,
              language: f.language
            }))
          };

          // 3) Remove duplicates if more than one file block
          const filteredBlocks = prev.filter((b) => b.type !== 'files');
          return [...filteredBlocks, updatedBlock];
        }
      });
    },
    []
  );

  /**
   * Recalculate token usage for blocks whenever blocks or the model changes.
   */
  useEffect(() => {
    initEncoder(settings.model);

    const blockTokenUsage: Record<string, number> = {};
    let totalTokens = 0;

    blocks.forEach((block) => {
      let blockText = '';

      switch (block.type) {
        case 'text':
          blockText = block.content;
          break;
        case 'template':
          blockText = block.content;
          break;
        case 'files': {
          // Concat all file contents
          const filesConcatenated = (block as FilesBlock).files.map((f) => f.content).join('\n');
          blockText = filesConcatenated;
          break;
        }
        default:
          blockText = '';
      }

      const count = estimateTokens(blockText);
      blockTokenUsage[block.id] = count;
      totalTokens += count;
    });

    setTokenUsage({
      blockTokenUsage,
      totalTokens
    });
  }, [blocks, settings.model]);

  /**
   * setSelectedFiles and compute usage for the selected files in the sidebar.
   * This is for user preview only; it doesn't automatically update the prompt flow.
   */
  const updateSelectedFiles = useCallback((fileMap: Record<string, string>) => {
    setSelectedFiles(fileMap);

    let total = 0;
    for (const [filePath, content] of Object.entries(fileMap)) {
      const ext = filePath.split('.').pop() || 'txt';
      const formatted = `<file_contents>\nFile: ${filePath}\n\`\`\`${ext}\n${content}\n\`\`\`\n</file_contents>`;
      const tokens = estimateTokens(formatted);
      total += tokens;
    }
    setSelectedFilesTokenCount(total);
  }, []);

  /**
   * Builds an array of { path, content, language } from the user's selectedFiles.
   */
  const getSelectedFileEntries = useCallback(() => {
    return Object.entries(selectedFiles).map(([filePath, content]) => {
      const ext = filePath.split('.').pop() || 'txt';
      return {
        path: filePath,
        content,
        language: guessLanguageFromExtension(ext)
      };
    });
  }, [selectedFiles]);

  /**
   * Step 13: Provide a function to flatten all blocks into a single string,
   * using flattenPrompt.ts. This is used for "Copy Prompt".
   */
  const getFlattenedPrompt = useCallback((): string => {
    return flattenBlocks(blocks);
  }, [blocks]);

  /**
   * For older code that might send "add-file-block" messages from main:
   */
  useEffect(() => {
    function handleAddFileBlock(
      _event: any,
      data: { path: string; content: string; language: string }
    ) {
      console.log('[PromptContext] Received add-file-block message:', data);
      addFileBlock(data.path, data.content, data.language);
    }

    if (window.electronAPI && typeof window.electronAPI.onMessage === 'function') {
      window.electronAPI.onMessage('add-file-block', handleAddFileBlock);
    }

    // Cleanup
    return () => {
      if (
        window.electronAPI &&
        typeof window.electronAPI.removeChannelListener === 'function'
      ) {
        window.electronAPI.removeChannelListener('add-file-block', handleAddFileBlock);
      }
    };
  }, [addFileBlock]);

  const contextValue: PromptContextType = {
    blocks,
    settings,
    addBlock,
    removeBlock,
    updateBlock,
    setSettings,
    moveBlock,
    addFileBlock,
    setSingleFileBlock,
    tokenUsage,
    selectedFiles,
    selectedFilesTokenCount,
    updateSelectedFiles,
    getSelectedFileEntries,
    getFlattenedPrompt
  };

  return (
    <PromptContext.Provider value={contextValue}>
      {children}
    </PromptContext.Provider>
  );
};

/**
 * Hook for consuming the PromptContext in React components.
 */
export const usePrompt = (): PromptContextType => {
  return useContext(PromptContext);
};
