
/**
 * @file TemplateSelectorModal.tsx
 * @description
 * A modal component that displays a consolidated list of template files from
 * global + project .prompt-composer directories. Step 3 changes:
 *  - We now retrieve the active project folders from ProjectContext and pass them
 *    to electronAPI.listAllTemplateFiles({ projectFolders }).
 *  - This ensures that if a folder is removed from the context, its templates
 *    won't appear.
 */

import React, { useEffect, useState } from 'react';
import { parseTemplateBlocks } from '../../utils/templateBlockParser';
import { Block } from '../../types/Block';
import { useProject } from '../../context/ProjectContext';

interface TemplateSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertBlocks: (blocks: Block[]) => void;
}

interface TemplateFileEntry {
  fileName: string;
  source: 'global' | 'project';
}

const TemplateSelectorModal: React.FC<TemplateSelectorModalProps> = ({
  isOpen,
  onClose,
  onInsertBlocks
}) => {
  const [templateFiles, setTemplateFiles] = useState<TemplateFileEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Step 3: we get projectFolders from context
  const { projectFolders } = useProject();

  useEffect(() => {
    if (isOpen) {
      // When modal opens, fetch the list of template files
      loadTemplates();
    } else {
      // If modal closes, reset
      setTemplateFiles([]);
      setLoading(true);
    }
  }, [isOpen]);

  async function loadTemplates() {
    try {
      setLoading(true);
      if (!window.electronAPI?.listAllTemplateFiles) {
        console.warn('[TemplateSelectorModal] electronAPI.listAllTemplateFiles not available');
        setTemplateFiles([]);
        setLoading(false);
        return;
      }

      // Pass current projectFolders
      const files = await window.electronAPI.listAllTemplateFiles({ projectFolders });
      // Sort them alphabetically
      const sorted = files.slice().sort((a, b) => a.fileName.localeCompare(b.fileName));
      setTemplateFiles(sorted);
    } catch (err) {
      console.error('[TemplateSelectorModal] Failed to list template files:', err);
      setTemplateFiles([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectTemplate(entry: TemplateFileEntry) {
    try {
      let content: string | null = null;
      if (entry.source === 'global') {
        content = await window.electronAPI.readGlobalPromptComposerFile(entry.fileName);
      } else {
        // 'project'
        // We read from "some" project .prompt-composer. Actually the electron side
        // tries each project folder. But there's no direct single path read here,
        // so we do the default "readPromptComposerFile" from process.cwd() if needed.
        // This is a known limitation. We keep the logic as is for now:
        content = await window.electronAPI.readPromptComposerFile(entry.fileName);
      }
      if (!content) {
        console.warn(`[TemplateSelectorModal] Could not read content from ${entry.source} file: ${entry.fileName}`);
        return;
      }

      const parsedBlocks = parseTemplateBlocks(content);
      onInsertBlocks(parsedBlocks);
      onClose();
    } catch (err) {
      console.error('[TemplateSelectorModal] handleSelectTemplate error:', err);
    }
  }

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="bg-white dark:bg-gray-800 w-full max-w-md p-4 rounded shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">
          Select a Template
        </h2>

        {loading && (
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Loading templates...
          </p>
        )}
        {!loading && templateFiles.length === 0 && (
          <p className="text-sm text-gray-600 dark:text-gray-300">
            No templates found.
          </p>
        )}
        {!loading && templateFiles.length > 0 && (
          <ul className="max-h-60 overflow-auto border border-gray-300 dark:border-gray-700 rounded p-2">
            {templateFiles.map((entry, idx) => (
              <li
                key={`${entry.source}-${entry.fileName}-${idx}`}
                className="cursor-pointer p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded flex justify-between items-center"
                onClick={() => handleSelectTemplate(entry)}
              >
                <span className="text-sm text-gray-800 dark:text-gray-100">
                  {entry.fileName}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                  {entry.source === 'global' ? 'Global' : 'Project'}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-400 text-white rounded hover:bg-gray-500"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default TemplateSelectorModal;

