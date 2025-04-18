/**
 * @file TemplateListView.tsx
 * @description
 * A fallback view shown when no blocks are loaded in the PromptBuilder. This component
 * displays a list of available template files (both global and from project .prompt-composer).
 * When the user picks one, we read from disk and parse it.
 *
 * Updated to explicitly call parseTemplateBlocksAsync with flatten=true,
 * ensuring we do read from disk references only during initial load.
 */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/ban-ts-comment */

import React, { useEffect, useState } from 'react';
import { parseTemplateBlocksAsync } from '../../utils/templateBlockParserAsync';
import { useProject } from '../../context/ProjectContext';
import { usePrompt } from '../../context/PromptContext';
import { Block } from '../../types/Block';
import { clearTemplateCaches } from '../../utils/readTemplateFile';

interface TemplateFileEntry {
  fileName: string;
  source: 'global' | 'project';
}

const TemplateListView: React.FC = () => {
  const { projectFolders } = useProject();
  const { addBlocks } = usePrompt();

  const [templateFiles, setTemplateFiles] = useState<TemplateFileEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Load templates on mount or whenever projectFolders changes
  useEffect(() => {
    fetchTemplates();
  }, [projectFolders]);

  const fetchTemplates = async () => {
    // @ts-ignore - Suppressing type checking for electronAPI access
    if (!window.electronAPI?.listAllTemplateFiles) {
      console.warn('[TemplateListView] electronAPI.listAllTemplateFiles is not available.');
      setLoading(false);
      setTemplateFiles([]);
      return;
    }
    setLoading(true);
    try {
      // @ts-ignore - Suppressing type checking for electronAPI methods
      const result = await window.electronAPI.listAllTemplateFiles({ projectFolders });
      // Sort them by fileName
      const sorted = result
        .slice()
        .sort((a: TemplateFileEntry, b: TemplateFileEntry) => a.fileName.localeCompare(b.fileName));
      setTemplateFiles(sorted);
    } catch (err) {
      console.error('[TemplateListView] fetchTemplates error:', err);
      setTemplateFiles([]);
    } finally {
      setLoading(false);
    }
  };

  /**
   * handleSelectTemplate
   * Reads the selected template file, then calls parseTemplateBlocksAsync
   * with flatten=true to do a full read of nested references from disk.
   */
  const handleSelectTemplate = async (entry: TemplateFileEntry) => {
    const { fileName, source } = entry;
    try {
      console.log(`[TemplateListView] Loading template: ${source}/${fileName}`);
      let content: string | null = null;
      // @ts-ignore - Suppressing type checking for electronAPI access
      if (source === 'global' && window.electronAPI?.readGlobalPromptComposerFile) {
        // @ts-ignore - Suppressing type checking for electronAPI methods
        content = await window.electronAPI.readGlobalPromptComposerFile(fileName);
      } else {
        // project
        // @ts-ignore - Suppressing type checking for electronAPI access
        if (window.electronAPI?.readPromptComposerFile) {
          // @ts-ignore - Suppressing type checking for electronAPI methods
          content = await window.electronAPI.readPromptComposerFile(fileName);
        }
      }
      if (!content) {
        console.warn(`[TemplateListView] Could not read content from: ${source}/${fileName}`);
        return;
      }

      console.log(
        `[TemplateListView] Successfully loaded template content, length: ${content.length}`
      );

      // Handle potential object format from IPC call
      if (typeof content === 'object' && content !== null) {
        // Extract content field from object format for backward compatibility
        const contentObj = content as unknown as { content: string; path: string };
        if (contentObj.content) {
          content = contentObj.content;
          console.log(
            `[TemplateListView] Extracted content from object format, length: ${content.length}`
          );
        }
      }

      // parse the template with flatten=true
      console.log(`[TemplateListView] Parsing template blocks with flatten=true`);
      const parsedBlocks = await parseTemplateBlocksAsync(
        content,
        undefined,
        undefined,
        msg => {
          console.error('[TemplateListView] parse error:', msg);
        },
        true /* flatten */
      );

      console.log(`[TemplateListView] Parsed ${parsedBlocks.length} blocks from template`);

      // add them to the composition
      addBlocks(parsedBlocks as Block[]);
      console.log(`[TemplateListView] Added blocks to composition`);
    } catch (err) {
      console.error('[TemplateListView] handleSelectTemplate error:', err);
    }
  };

  const handleRefreshClick = () => {
    // Clear template caches before refreshing the list
    clearTemplateCaches();
    fetchTemplates();
  };

  const noTemplates = !loading && templateFiles.length === 0;

  return (
    <div className="flex flex-col items-center justify-center h-full">
      <h3 className="text-xl font-semibold mb-3 text-gray-800 dark:text-gray-100">
        Available Templates
      </h3>

      {loading && (
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">Loading templates...</p>
      )}

      {!loading && noTemplates && (
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">No templates found.</p>
      )}

      {/* Scrollable container for the template files */}
      <div className="border border-gray-300 dark:border-gray-600 rounded w-full max-w-lg h-80 overflow-auto p-2">
        {templateFiles.map((entry, idx) => (
          <div
            key={`${entry.source}-${entry.fileName}-${idx}`}
            onClick={() => handleSelectTemplate(entry)}
            className="cursor-pointer p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded flex justify-between items-center mb-1"
          >
            <span className="text-sm text-gray-800 dark:text-gray-100">{entry.fileName}</span>
            <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
              {entry.source === 'global' ? 'Global' : 'Project'}
            </span>
          </div>
        ))}
      </div>

      <div className="w-full max-w-lg mt-2 flex justify-end">
        <button
          onClick={handleRefreshClick}
          type="button"
          title="Refresh templates"
          aria-label="Refresh templates"
          className="p-2 rounded bg-blue-500 hover:bg-blue-600 text-white flex items-center justify-center"
        >
          {/* Provided refresh icon */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="lucide lucide-refresh-cw-icon lucide-refresh-cw"
          >
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
            <path d="M8 16H3v5" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default TemplateListView;
