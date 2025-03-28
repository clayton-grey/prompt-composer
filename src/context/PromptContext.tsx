/**
 * @file PromptContext.tsx
 * @description
 * Manages the array of prompt blocks.
 *
 * In this update, we fix the file map toggle by automatically generating
 * a projectAsciiMap for FileBlock if includeProjectMap===true but no projectAsciiMap
 * is set. This happens in getFlattenedPrompt() before calling flattenBlocksAsync.
 *
 * We combine ASCII for all project folders, if multiple exist.
 * If no folders exist, we skip.
 * Then we store it in block.projectAsciiMap for flattenBlocksAsync to embed.
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Block, FilesBlock } from '../types/Block';
import { flattenBlocksAsync } from '../utils/flattenPrompt';
import { parseTemplateBlocksAsync } from '../utils/templateBlockParserAsync';
import { initEncoder, estimateTokens } from '../utils/tokenEstimator';
import { useProject } from './ProjectContext';

// We'll import a function to generate ASCII map from multiple project folders
// We'll replicate or use the existing code from the "copy file block output" approach
async function generateCombinedAsciiMapsForFolders(folderPaths: string[]): Promise<string> {
  if (!window.electronAPI?.listDirectory) {
    console.warn(
      '[PromptContext] No electronAPI.listDirectory found. Skipping ASCII map generation.'
    );
    return '';
  }

  // We'll do a minimal approach: for each folder path, we call 'listDirectory' and build an ASCII map
  // We combine them with a <file_map> heading for each folder.
  let finalMap = '';
  for (const folder of folderPaths) {
    try {
      const listing = await window.electronAPI.listDirectory(folder);
      finalMap += '<file_map>\n';
      finalMap += listing.absolutePath + '\n';
      // We'll generate lines via a recursive function:
      function buildLines(node: any, prefix: string, isLast: boolean): string[] {
        const lines: string[] = [];
        const nodeMarker = isLast ? '└── ' : '├── ';
        let label = node.name;
        if (node.type === 'directory') {
          label = '[D] ' + node.name;
        }
        lines.push(prefix + nodeMarker + label);

        if (node.children && node.children.length > 0) {
          const childPrefix = prefix + (isLast ? '    ' : '│   ');
          node.children.forEach((child: any, idx: number) => {
            const childIsLast = idx === node.children.length - 1;
            lines.push(...buildLines(child, childPrefix, childIsLast));
          });
        }

        return lines;
      }

      // sort the children for consistent output
      listing.children.sort((a: any, b: any) => a.name.localeCompare(b.name));

      listing.children.forEach((child: any, idx: number) => {
        const isLast = idx === listing.children.length - 1;
        finalMap += buildLines(child, '', isLast).join('\n') + '\n';
      });
      finalMap += '</file_map>\n\n';
    } catch (err) {
      console.error(
        '[PromptContext] generateCombinedAsciiMapsForFolders error for folder:',
        folder,
        err
      );
    }
  }

  return finalMap.trim();
}

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
  model: 'gpt-4',
};

const PromptContext = createContext<PromptContextType>({
  blocks: [],
  settings: defaultSettings,
  addBlock: () => {},
  addBlocks: () => {},
  removeBlock: () => {},
  updateBlock: () => {},
  setSettings: () => {},
  updateFileBlock: () => {},
  tokenUsage: { total: 0, byBlock: [] },
  getFlattenedPrompt: async () => '',
  importComposition: () => {},
  replaceTemplateGroup: async () => {},
});

export const PromptProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [settings, setSettingsState] = useState<PromptSettings>(defaultSettings);
  const { getSelectedFileEntries, projectFolders } = useProject();

  const [tokenUsage, setTokenUsage] = useState<TokenUsage>({ total: 0, byBlock: [] });

  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Initialize encoder
    initEncoder(settings.model);
  }, [settings.model]);

  // Recompute token usage
  useEffect(() => {
    const calculateTokenUsage = async () => {
      if (!settings.model) {
        setTokenUsage({ total: 0, byBlock: [] });
        return;
      }

      try {
        const selectedFileEntries = getSelectedFileEntries();
        const newTokenUsage: TokenUsage = {
          total: 0,
          byBlock: [],
        };

        for (const block of blocks) {
          let content = '';

          if (block.type === 'text' || block.type === 'template') {
            content = block.content || '';
          } else if (block.type === 'files') {
            const fb = block as FilesBlock;
            const mapText = fb.includeProjectMap && fb.projectAsciiMap ? fb.projectAsciiMap : '';
            // combine
            let fileTexts = '';
            for (const entry of selectedFileEntries) {
              fileTexts += `<file_contents>\nFile: ${entry.path}\n\`\`\`${entry.language}\n${entry.content}\n\`\`\`\n</file_contents>\n`;
            }
            content = (mapText ? mapText + '\n' : '') + fileTexts;
          } else if (block.type === 'promptResponse') {
            content = block.content || '';
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

    calculateTokenUsage();

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
   * legacy method from older design
   */
  const updateFileBlock = useCallback(
    (fileEntries: { path: string; content: string; language: string }[], asciiMap?: string) => {
      setBlocks(prev => {
        const existingIndex = prev.findIndex(b => b.type === 'files');
        const newId = uuidv4();

        const candidate: FilesBlock = {
          id: newId,
          type: 'files',
          label: 'File Block',
          files: fileEntries,
          projectAsciiMap: asciiMap || '',
          includeProjectMap: true,
          locked: false,
        };

        if (existingIndex === -1) {
          return [...prev, candidate];
        } else {
          const newBlocks = [...prev];
          newBlocks[existingIndex] = candidate;
          return newBlocks.filter((b, idx) => b.type !== 'files' || idx === existingIndex);
        }
      });
    },
    []
  );

  /**
   * getFlattenedPrompt
   * Before we flatten, we see if there's any FILE_BLOCK with includeProjectMap===true
   * but no projectAsciiMap. We generate a combined ASCII from all project folders,
   * store it in block.projectAsciiMap, so flatten sees it.
   */
  const getFlattenedPrompt = useCallback(async (): Promise<string> => {
    // Potentially generate ASCII map if needed
    let updatedBlocks = [...blocks];

    // We'll do a quick pass to see if any FileBlock needs an ASCII map
    for (let i = 0; i < updatedBlocks.length; i++) {
      const b = updatedBlocks[i];
      if (b.type === 'files') {
        const fb = b as FilesBlock;
        if (fb.includeProjectMap && (!fb.projectAsciiMap || !fb.projectAsciiMap.trim())) {
          // Generate if we have project folders
          if (projectFolders.length > 0) {
            const combinedMap = await generateCombinedAsciiMapsForFolders(projectFolders);
            // store in the block so flatten sees it
            fb.projectAsciiMap = combinedMap;
            updatedBlocks[i] = fb;
          } else {
            // no project folders => can't generate
            fb.projectAsciiMap = '';
            updatedBlocks[i] = fb;
          }
        }
      }
    }

    const selectedEntries = getSelectedFileEntries();
    const flattened = await flattenBlocksAsync(updatedBlocks, selectedEntries);
    return flattened;
  }, [blocks, getSelectedFileEntries, projectFolders]);

  const importComposition = useCallback((newBlocks: Block[], newSettings: PromptSettings) => {
    setBlocks(newBlocks);
    setSettingsState(newSettings);
  }, []);

  const replaceTemplateGroup = useCallback(
    async (leadBlockId: string, groupId: string, newText: string, oldRawText: string) => {
      if (newText === oldRawText) {
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
      const newParsed = await parseTemplateBlocksAsync(newText, groupId, leadBlockId);
      setBlocks(prev => {
        const groupIndices: number[] = [];
        for (let i = 0; i < prev.length; i++) {
          if (prev[i].groupId === groupId) {
            groupIndices.push(i);
          }
        }
        if (groupIndices.length === 0) {
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
