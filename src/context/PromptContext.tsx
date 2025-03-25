
/**
 * @file PromptContext.tsx
 * @description
 * Provides global state management for the Prompt Composer application, including:
 * - An array of Blocks (text, template, files)
 * - Global Prompt settings (maxTokens, model)
 * - Utility methods for adding, removing, and updating blocks
 * - Real-time token usage calculation for blocks
 * - Single file block enforcement
 * - Tracking user-selected files from the file tree
 * - getFlattenedPrompt() for final prompt generation
 * - importComposition() to replace the current composition with imported data
 *
 * Changes for Step 17B:
 *  - When creating or updating a new FilesBlock in addFileBlock() or setSingleFileBlock(),
 *    we set `includeProjectMap: true` by default, so the user can uncheck it in the UI.
 *
 * Notes:
 *  - We do not remove the actual file references or content. The user won't see them
 *    in the FileBlockEditor, but they're still embedded in the final prompt.
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
  getFlattenedPrompt: () => string;
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
  getFlattenedPrompt: () => '',
  importComposition: () => {}
});

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
   * addFileBlock: Creates a single file block if none exist, or logs a message if
   * one already exists. (MVP approach from earlier steps.)
   *
   * For Step 17B, we default `includeProjectMap: true`.
   */
  const addFileBlock = useCallback(
    (filePath: string, fileContent: string, language: string) => {
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
        label: 'File Block',
        files: [
          {
            path: filePath,
            content: fileContent,
            language
          }
        ],
        projectAsciiMap: '',
        includeProjectMap: true
      };

      setBlocks((prev) => [...prev, newBlock]);

      generateProjectAsciiMap('.')
        .then((mapStr) => {
          setBlocks((prevBlocks) => {
            return prevBlocks.map((b) => {
              if (b.id === newBlock.id && b.type === 'files') {
                const fb = b as FilesBlock;
                return {
                  ...fb,
                  projectAsciiMap: mapStr
                };
              }
              return b;
            });
          });
        })
        .catch((err) => {
          console.error('[PromptContext] Failed to generate project ASCII map:', err);
        });
    },
    [blocks]
  );

  /**
   * setSingleFileBlock: Overwrites or creates a file block that includes all given file entries.
   * For Step 17B, we also default `includeProjectMap: true`.
   */
  const setSingleFileBlock = useCallback(
    (fileEntries: { path: string; content: string; language: string }[]) => {
      setBlocks((prev) => {
        const existingBlockIndex = prev.findIndex((b) => b.type === 'files');
        if (existingBlockIndex === -1) {
          // no file block found, create one
          const newBlock: FilesBlock = {
            id: uuidv4(),
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

          generateProjectAsciiMap('.')
            .then((mapStr) => {
              setBlocks((prevBlocks) => {
                return prevBlocks.map((b) => {
                  if (b.id === newBlock.id && b.type === 'files') {
                    const fb = b as FilesBlock;
                    return {
                      ...fb,
                      projectAsciiMap: mapStr
                    };
                  }
                  return b;
                });
              });
            })
            .catch((err) => {
              console.error('[PromptContext] Failed to generate project ASCII map:', err);
            });

          return [...prev, newBlock];
        } else {
          // update existing
          const existingBlock = prev[existingBlockIndex] as FilesBlock;
          const updatedBlock: FilesBlock = {
            ...existingBlock,
            label: 'File Block',
            files: fileEntries.map((f) => ({
              path: f.path,
              content: f.content,
              language: f.language
            })),
            projectAsciiMap: '',
            includeProjectMap: true
          };

          generateProjectAsciiMap('.')
            .then((mapStr) => {
              setBlocks((prevBlocks) => {
                return prevBlocks.map((b) => {
                  if (b.id === updatedBlock.id && b.type === 'files') {
                    return {
                      ...updatedBlock,
                      projectAsciiMap: mapStr
                    };
                  }
                  return b;
                });
              });
            })
            .catch((err) => {
              console.error('[PromptContext] Failed to generate project ASCII map:', err);
            });

          // Remove old file blocks, add updated one
          const filteredBlocks = prev.filter((b) => b.type !== 'files');
          return [...filteredBlocks, updatedBlock];
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
          // If a file map is stored and we're including it, add that text to the count
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
   * Update selectedFiles for manual token counting from the Sidebar tri-state logic.
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
   * Convert the selectedFiles map into an array of file entries for potential block usage.
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
   * Returns the final flattened prompt string.
   */
  const getFlattenedPrompt = useCallback((): string => {
    return flattenBlocks(blocks);
  }, [blocks]);

  /**
   * importComposition: Replaces our current blocks/settings with the ones from the imported XML.
   */
  const importComposition = useCallback((newBlocks: Block[], newSettings: PromptSettings) => {
    setBlocks(newBlocks);
    setSettingsState(newSettings);
  }, []);

  /**
   * Handle "add-file-block" messages from the main process
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
