/**
 * @file PromptBuilder.tsx
 * @description
 * Provides the UI for adding text blocks, updating file blocks, etc. 
 * 
 * After Step 3, we fetch the selected file entries from ProjectContext 
 * (useProject().getSelectedFileEntries) instead of PromptContext, 
 * then pass them to updateFileBlock(...) in PromptContext.
 */

import React, { useState, useEffect } from 'react';
import { Block } from '../../types/Block';
import BlockList from './BlockList';
import { usePrompt } from '../../context/PromptContext';
import PromptPreview from './PromptPreview';
import { useProject } from '../../context/ProjectContext';
import { nanoid } from 'nanoid';

export const PromptBuilder: React.FC = () => {
  const { addBlock, updateFileBlock, tokenUsage } = usePrompt();
  const { getSelectedFileEntries, generateAsciiTree, directoryCache } = useProject();
  const [showPreview, setShowPreview] = useState(false);
  const [rootFolders, setRootFolders] = useState<string[]>([]);

  // Get root folders by checking directoryCache keys
  useEffect(() => {
    const folderPaths = Object.keys(directoryCache);
    if (folderPaths.length > 0) {
      setRootFolders(folderPaths);
    }
  }, [directoryCache]);

  const handleAddTextBlock = () => {
    addBlock({
      id: nanoid(),
      type: 'text',
      label: 'Text Block',
      content: '',
    });
  };

  const handleAddFileBlock = async () => {
    const fileEntries = getSelectedFileEntries();
    
    if (fileEntries.length === 0) {
      console.log('[PromptBuilder] No files currently selected in the sidebar. Nothing to add.');
      return;
    }
    
    // Log the selected files we're about to add
    console.log(`[PromptBuilder] Adding ${fileEntries.length} files to prompt:`);
    fileEntries.forEach(file => {
      console.log(`- ${file.path} (${file.content.length} chars)`);
    });
    
    console.log(`[PromptBuilder] PromptContext total tokens before update: ${tokenUsage.totalTokens}`);
    
    // Find the root folder that contains the selected files
    const rootFolder = findRootFolderForFiles(fileEntries, rootFolders);
    
    if (rootFolder) {
      console.log(`[PromptBuilder] Generating ASCII map for root folder: ${rootFolder}`);
      try {
        // Use the root folder to generate a complete file hierarchy
        const completeMap = await generateAsciiTree(rootFolder);
        if (completeMap) {
          console.log(`[PromptBuilder] Generated complete ASCII map (${completeMap.length} chars)`);
          updateFileBlock(fileEntries, completeMap);
          
          // We need to wait for the next render cycle to see the updated token count
          setTimeout(() => {
            console.log(`[PromptBuilder] PromptContext total tokens after update: ${tokenUsage.totalTokens}`);
          }, 500);
          return;
        }
      } catch (error) {
        console.error('[PromptBuilder] Error generating ASCII tree:', error);
      }
    }
    
    // Fallback: Use simple file list if we couldn't generate a proper tree
    console.log('[PromptBuilder] Using fallback simple file list');
    const simpleMap = generateSimpleFileList(fileEntries);
    updateFileBlock(fileEntries, simpleMap);
    
    // We need to wait for the next render cycle to see the updated token count
    setTimeout(() => {
      console.log(`[PromptBuilder] PromptContext total tokens after update: ${tokenUsage.totalTokens}`);
    }, 500);
  };
  
  // Helper function to find the root folder that contains the selected files
  function findRootFolderForFiles(files: Array<{path: string}>, rootFolders: string[]): string | null {
    if (files.length === 0 || rootFolders.length === 0) return null;
    
    // Sort root folders by length (descending) to get the most specific one first
    const sortedRoots = [...rootFolders].sort((a, b) => b.length - a.length);
    
    // Find the root folder that is a prefix of all selected files
    for (const root of sortedRoots) {
      const allFilesInRoot = files.every(file => file.path.startsWith(root));
      if (allFilesInRoot) {
        return root;
      }
    }
    
    // If no specific root folder contains all files, use the first file's root folder
    const firstFilePath = files[0].path;
    for (const root of sortedRoots) {
      if (firstFilePath.startsWith(root)) {
        return root;
      }
    }
    
    return null;
  }
  
  // Generate a simple file list when we can't create a proper tree
  function generateSimpleFileList(files: { path: string; content: string; language: string }[]): string {
    let map = '<file_map>\n';
    
    if (files.length > 0) {
      // Try to find a common parent directory
      const paths = files.map(f => f.path);
      const firstPath = paths[0];
      const parts = firstPath.split('/');
      
      // Start with the whole path and remove segments from the end until we find a common prefix
      for (let i = parts.length; i > 0; i--) {
        const prefix = parts.slice(0, i).join('/');
        if (paths.every(p => p.startsWith(prefix))) {
          map += prefix + '\n';
          break;
        }
      }
      
      // Add each file with appropriate prefix
      files.forEach((file, idx) => {
        const isLast = idx === files.length - 1;
        const prefix = isLast ? '└── ' : '├── ';
        const relativePath = file.path.substring(map.split('\n')[1].length + 1);
        map += prefix + relativePath + '\n';
      });
    } else {
      map += 'No files selected\n';
    }
    
    map += '</file_map>';
    return map;
  }

  const togglePreview = () => {
    setShowPreview((prev) => !prev);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center p-4 border-b dark:border-gray-600">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
          Prompt Builder
        </h2>
        <div className="flex gap-2">
          <button
            onClick={handleAddTextBlock}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Add Text Block
          </button>
          <button
            onClick={handleAddFileBlock}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
          >
            Add File Block
          </button>
          <button
            onClick={togglePreview}
            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
          >
            {showPreview ? 'Hide Plain Text View' : 'Show Plain Text View'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <BlockList />
        {showPreview && <PromptPreview />}
      </div>
    </div>
  );
};
