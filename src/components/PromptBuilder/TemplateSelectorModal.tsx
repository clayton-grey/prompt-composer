/**
 * @file TemplateSelectorModal.tsx
 * @description
 * A modal component that displays a consolidated list of template files found in:
 *  (a) Global (~/.prompt-composer)
 *  (b) Project (<cwd>/.prompt-composer)
 * When the user selects one, we load its contents (via readGlobalPromptComposerFile or readPromptComposerFile),
 * parse them into multiple blocks with parseTemplateBlocks, then insert them into the composition.
 *
 * Key Responsibilities:
 *  - On mount, call window.electronAPI.listAllTemplateFiles() to get an array of available templates.
 *  - Display them in a list, grouped by source or sorted in alphabetical order. (Implementation is simple, alphabetical.)
 *  - On user click, read the file from the appropriate location, parse with parseTemplateBlocks, and then call onTemplateSelected(blocks).
 *  - Provide a Cancel button or background overlay to close the modal without insertion.
 *
 * Edge Cases:
 *  - If no template files are found, we show "No templates found."
 *  - If reading or parsing fails, we log a console error and remain in place.
 *
 * Usage:
 *  - <TemplateSelectorModal
 *      isOpen={showModal}
 *      onClose={() => setShowModal(false)}
 *      onInsertBlocks={(blocks) => addBlocks(blocks)}
 *    />
 *
 * Implementation:
 *  - We hold local state 'templateFiles' for the list of { fileName, source } items.
 *  - On mount, we fetch them. If loading fails, we set an error or show an empty list.
 *  - When the user picks one, we do readGlobalPromptComposerFile (if source=global) or readPromptComposerFile (if source=project).
 *    Then parse with parseTemplateBlocks(sourceText). Then pass result to onInsertBlocks.
 */

import React, { useEffect, useState } from 'react';
import { parseTemplateBlocks } from '../../utils/templateBlockParser';
import { Block } from '../../types/Block';

interface TemplateSelectorModalProps {
  /**
   * Whether the modal is currently visible
   */
  isOpen: boolean;

  /**
   * Callback to close the modal (user canceled or inserted a template)
   */
  onClose: () => void;

  /**
   * Callback invoked when user selects a template, producing multiple sub-blocks
   */
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
      const files = await window.electronAPI.listAllTemplateFiles();
      // Sort them alphabetically by fileName
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
        // source = 'project'
        content = await window.electronAPI.readPromptComposerFile(entry.fileName);
      }
      if (!content) {
        console.warn(`[TemplateSelectorModal] Could not read content from ${entry.source} file: ${entry.fileName}`);
        return;
      }

      const parsedBlocks = parseTemplateBlocks(content);

      // Insert them via the callback
      onInsertBlocks(parsedBlocks);

      // Then close the modal
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
        // close if user clicks the backdrop
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
          <p className="text-sm text-gray-600 dark:text-gray-300">Loading templates...</p>
        )}

        {!loading && templateFiles.length === 0 && (
          <p className="text-sm text-gray-600 dark:text-gray-300">No templates found.</p>
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
