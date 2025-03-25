
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
 * - Now also fetches/attaches the project ASCII file map to the file block
 *   so that it's included at the start of the final prompt output.
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

  const addFileBlock = useCallback(
    (filePath: string, fileContent: string, language: string) => {
      // If a files block already exists, we skip (assuming we only want one).
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
        ],
        projectAsciiMap: '' // We'll fill it below
      };

      setBlocks((prev) => [...prev, newBlock]);

      // If we want the entire project map in this block, we can do so asynchronously:
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
   * setSingleFileBlock: Overwrites or creates a single file block that includes all given file entries.
   * Also fetches and attaches the ASCII file map to the block so that when
   * we flatten the prompt, the ASCII map is included at the top.
   */
  const setSingleFileBlock = useCallback(
    (fileEntries: { path: string; content: string; language: string }[]) => {
      // Build a new or updated file block
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
            projectAsciiMap: ''
          };

          // We'll do an async update for projectAsciiMap
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
            files: fileEntries.map((f) => ({
              path: f.path,
              content: f.content,
              language: f.language
            })),
            // We'll re-fetch the project map
            projectAsciiMap: ''
          };

          // Perform the async fetch
          generateProjectAsciiMap('.')
            .then((mapStr) => {
              setBlocks((prevBlocks) => {
                return prevBlocks.map((b) => {
                  if (b.id === updatedBlock.id && b.type === 'files') {
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

          // Rebuild the block array
          const filteredBlocks = prev.filter((b) => b.type !== 'files');
          return [...filteredBlocks, updatedBlock];
        }
      });
    },
    []
  );

  /**
   * Whenever blocks or model changes, recalc the token usage.
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
          // If a file map is stored, we want to count it too
          const mapText = fb.projectAsciiMap || '';
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
   * Flattened prompt is generated by flattenBlocks. We now have the "projectAsciiMap"
   * in any FilesBlock, which flattenBlocks will place at the start of the block.
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
