
/**
 * @file PromptContext.tsx
 * @description
 * Provides global state management for the Prompt Composer application, including:
 * - An array of Blocks (text, template, files)
 * - Global Prompt settings (maxTokens, model)
 * - Utility methods for adding, removing, and updating blocks
 * - Real-time token usage calculation for blocks
 * - Enforces only a single file block at a time
 * - Tracking user-selected files from the file tree
 * - getFlattenedPrompt() for final prompt generation
 * - importComposition() to replace the current composition with imported data
 *
 * Changes for "Architecture & State Management - Step 2: Clarify or Extend File Block Usage":
 *  - Remove addFileBlock method. Instead, keep a single method: updateFileBlock(fileEntries).
 *  - We only permit one file block. If no file block exists, we create one. If one exists, we overwrite it.
 *  - Rename references from "setSingleFileBlock" to "updateFileBlock" to clarify usage.
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
import { generateProjectAsciiMap } from '../utils/fileMapBuilder';

interface PromptSettings {
  /**
   * The maximum number of tokens for the current model context (e.g., 8000).
   */
  maxTokens: number;

  /**
   * The model name, e.g. "gpt-4".
   */
  model: string;
}

interface TokenUsage {
  /**
   * blockTokenUsage: A mapping of blockId -> token count for that block.
   */
  blockTokenUsage: Record<string, number>;

  /**
   * totalTokens: The total tokens used by all blocks.
   */
  totalTokens: number;
}

interface PromptContextType {
  /**
   * The complete array of blocks in the user's composition.
   */
  blocks: Block[];

  /**
   * Global prompt settings (maxTokens, model, etc.).
   */
  settings: PromptSettings;

  /**
   * Adds a block to the end of the blocks array. This can be text or template, etc.
   */
  addBlock: (block: Block) => void;

  /**
   * Removes a block by ID.
   */
  removeBlock: (blockId: string) => void;

  /**
   * Updates an existing block in place, matched by its id.
   */
  updateBlock: (updatedBlock: Block) => void;

  /**
   * Replaces the global settings with new values.
   */
  setSettings: (newSettings: PromptSettings) => void;

  /**
   * Moves a block from oldIndex to newIndex in the array (simple reorder).
   */
  moveBlock: (oldIndex: number, newIndex: number) => void;

  /**
   * Overwrites or creates a single FilesBlock containing the given file entries.
   * If a file block doesn't exist, it creates one. If it exists, it overwrites it.
   */
  updateFileBlock: (
    fileEntries: {
      path: string;
      content: string;
      language: string;
    }[]
  ) => void;

  /**
   * Contains the current token usage for each block plus a total.
   */
  tokenUsage: TokenUsage;

  /**
   * The tri-state-file-tree-selected files (from the Sidebar).
   * Key = absolute path, value = file contents.
   */
  selectedFiles: Record<string, string>;

  /**
   * The total tokens for the selected files from the tri-state selection in the sidebar.
   */
  selectedFilesTokenCount: number;

  /**
   * Called by the file tree to update the user-selected files in the tri-state selection.
   * This triggers a recalculation of selectedFilesTokenCount.
   */
  updateSelectedFiles: (fileMap: Record<string, string>) => void;

  /**
   * Returns an array of file objects from selectedFiles with extension-based guessed languages.
   */
  getSelectedFileEntries: () => Array<{ path: string; content: string; language: string }>;

  /**
   * Returns the final flattened prompt string from all blocks.
   */
  getFlattenedPrompt: () => string;

  /**
   * Replaces the current composition with the imported blocks & settings (from XML, etc.).
   */
  importComposition: (newBlocks: Block[], newSettings: PromptSettings) => void;
}

/**
 * Default prompt settings used at initialization if the user has not changed them.
 */
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
  tokenUsage: {
    blockTokenUsage: {},
    totalTokens: 0
  },
  selectedFiles: {},
  selectedFilesTokenCount: 0,
  updateSelectedFiles: () => {},
  getSelectedFileEntries: () => [],
  getFlattenedPrompt: () => '',
  importComposition: () => {}
});

/**
 * Attempts to guess a file's language from its extension.
 * This is used in getSelectedFileEntries for better code block highlighting.
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
   * Basic method to add a new block (usually text/template). 
   * For file blocks, see updateFileBlock() which enforces single-block usage.
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
   * Update an existing block, matched by ID. If not found, does nothing.
   */
  const updateBlock = useCallback((updatedBlock: Block) => {
    setBlocks((prev) => {
      return prev.map((b) => (b.id === updatedBlock.id ? updatedBlock : b));
    });
  }, []);

  /**
   * Update global prompt settings (maxTokens, model, etc.).
   */
  const setSettings = useCallback((newSettings: PromptSettings) => {
    setSettingsState(newSettings);
  }, []);

  /**
   * Reorder a block from oldIndex to newIndex in the array.
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
   * updateFileBlock:
   * Only one FilesBlock is allowed in the composition. If none exists, create one; if it exists, overwrite it.
   * - For convenience, we automatically set label = "File Block".
   * - We also generate the project ASCII map if possible, storing it in projectAsciiMap.
   * - includeProjectMap defaults to true (the user can toggle off in the UI).
   *
   * @param fileEntries array of { path, content, language }
   */
  const updateFileBlock = useCallback(
    (fileEntries: { path: string; content: string; language: string }[]) => {
      setBlocks((prev) => {
        // Find if we have an existing FilesBlock
        const existingBlockIndex = prev.findIndex((b) => b.type === 'files');
        const newId = uuidv4();

        // We'll create a "candidate" block
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

        // Async: we'll fill in projectAsciiMap after creation:
        generateProjectAsciiMap('.')
          .then((mapStr) => {
            setBlocks((prevBlocks) =>
              prevBlocks.map((b) => {
                // Replace the newly created or updated block with the one that has projectAsciiMap
                if (b.id === newId) {
                  return {
                    ...candidate,
                    id: newId,
                    projectAsciiMap: mapStr
                  };
                }
                return b;
              })
            );
          })
          .catch((err) => {
            console.error('[PromptContext] Failed to generate project ASCII map:', err);
          });

        // If no existing block, just add
        if (existingBlockIndex === -1) {
          return [...prev, candidate];
        } else {
          // Overwrite the existing block
          const newBlocks = [...prev];
          newBlocks[existingBlockIndex] = candidate;
          // Remove any other file blocks if they somehow exist
          return newBlocks.filter(
            (b, idx) => b.type !== 'files' || idx === existingBlockIndex
          );
        }
      });
    },
    []
  );

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
          blockText = block.content;
          break;
        case 'template':
          blockText = block.content;
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

    setTokenUsage({
      blockTokenUsage,
      totalTokens
    });
  }, [blocks, settings.model]);

  /**
   * updateSelectedFiles: invoked from the tri-state file tree. This sets an internal map 
   * of { filePath -> fileContent }, then we recalc total tokens for those selected files.
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
   * Convert the selectedFiles map into an array of file entries for potential block usage, 
   * guessing language from the file extension.
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
   * Returns a single flattened prompt string from all blocks in order.
   */
  const getFlattenedPrompt = useCallback((): string => {
    return flattenBlocks(blocks);
  }, [blocks]);

  /**
   * Replaces all blocks/settings with the newly imported composition from an XML file.
   */
  const importComposition = useCallback((newBlocks: Block[], newSettings: PromptSettings) => {
    setBlocks(newBlocks);
    setSettingsState(newSettings);
  }, []);

  /**
   * Listen for main process messages that want to update the file block
   * e.g. "add-file-block" => we rename to "update-file-block" concept
   */
  useEffect(() => {
    function handleFileBlockUpdate(
      _event: any,
      data: { path: string; content: string; language: string }
    ) {
      console.log('[PromptContext] Received "add-file-block" message (renamed to updateFileBlock):', data);
      updateFileBlock([{ path: data.path, content: data.content, language: data.language }]);
    }

    if (window.electronAPI && typeof window.electronAPI.onMessage === 'function') {
      window.electronAPI.onMessage('add-file-block', handleFileBlockUpdate);
    }

    return () => {
      if (
        window.electronAPI &&
        typeof window.electronAPI.removeChannelListener === 'function'
      ) {
        window.electronAPI.removeChannelListener('add-file-block', handleFileBlockUpdate);
      }
    };
  }, [updateFileBlock]);

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
    selectedFiles,
    selectedFilesTokenCount,
    updateSelectedFiles,
    getSelectedFileEntries,
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
 * usePrompt is a convenience hook for accessing the PromptContext.
 */
export const usePrompt = (): PromptContextType => {
  return useContext(PromptContext);
};
      