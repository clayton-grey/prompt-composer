/**
 * @file TemplateListView.tsx
 * @description
 * A fallback view shown when no blocks are loaded in the PromptBuilder. This component
 * displays a list of available template files (both global and from all projectFolders),
 * letting the user pick one to parse and load into the composition.
 *
 * In this update:
 *  - We have moved the Refresh button BELOW the scrollable list, aligned to the bottom-right corner.
 *    This better aligns with the user's request for layout changes.
 *
 * Steps to accomplish:
 *  1) Maintain the container for the template list with a fixed height (h-80).
 *  2) Place the Refresh button in a separate container below the list container.
 *     We style it with flex justify-end so that it appears at the bottom-right.
 *  3) Keep the same refresh icon, 'title' = "Refresh templates", and aria-label = "Refresh templates".
 *
 * Edge Cases:
 *  - If no templates are found, we display "No templates found." above the list container.
 *  - The button is always available, even if the list is empty or loading, so the user can attempt a refresh.
 */

import React, { useEffect, useState } from 'react';
import { parseTemplateBlocksAsync } from '../../utils/templateBlockParserAsync';
import { useProject } from '../../context/ProjectContext';
import { usePrompt } from '../../context/PromptContext';
import { Block } from '../../types/Block';

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectFolders]);

  const fetchTemplates = async () => {
    if (!window.electronAPI?.listAllTemplateFiles) {
      console.warn('[TemplateListView] electronAPI.listAllTemplateFiles is not available.');
      setLoading(false);
      setTemplateFiles([]);
      return;
    }
    setLoading(true);
    try {
      const result = await window.electronAPI.listAllTemplateFiles({ projectFolders });
      // Sort them by fileName
      const sorted = result.slice().sort((a, b) => a.fileName.localeCompare(b.fileName));
      setTemplateFiles(sorted);
    } catch (err) {
      console.error('[TemplateListView] fetchTemplates error:', err);
      setTemplateFiles([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectTemplate = async (entry: TemplateFileEntry) => {
    const { fileName, source } = entry;
    try {
      let content: string | null = null;
      if (source === 'global') {
        content = await window.electronAPI.readGlobalPromptComposerFile(fileName);
      } else {
        // project
        content = await window.electronAPI.readPromptComposerFile(fileName);
      }
      if (!content) {
        console.warn(`[TemplateListView] Could not read content from: ${source}/${fileName}`);
        return;
      }
      // parse the template
      const parsedBlocks = await parseTemplateBlocksAsync(content);
      // add them to the composition
      addBlocks(parsedBlocks as Block[]);
    } catch (err) {
      console.error('[TemplateListView] handleSelectTemplate error:', err);
    }
  };

  const handleRefreshClick = () => {
    fetchTemplates();
  };

  // If no templates found
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

      {/* Bottom-right-aligned refresh button, but below the list container */}
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
