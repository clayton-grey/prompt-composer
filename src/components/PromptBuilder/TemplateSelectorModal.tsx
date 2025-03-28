/**
 * @file TemplateSelectorModal.tsx
 * @description
 * A modal component that displays a consolidated list of template files
 * from global + project .prompt-composer directories. Upon user selection,
 * it reads the file content and uses our parser to generate blocks.
 *
 * Step 4 Changes (Error Feedback):
 *  - We now import and use the `useToast` hook from ToastContext to display error messages.
 *
 * Step 5 Changes (Accessibility):
 *  - Added role="dialog" aria-modal="true" to the inner modal.
 *  - Use a ref for focus management when the modal opens.
 *  - `aria-labelledby` referencing the title <h2> element.
 *  - Return focus to previously active element on close.
 */

import React, { useEffect, useState, useRef } from 'react';
import { parseTemplateBlocksAsync } from '../../utils/templateBlockParserAsync';
import { Block } from '../../types/Block';
import { useProject } from '../../context/ProjectContext';
import { useToast } from '../../context/ToastContext';

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
  onInsertBlocks,
}) => {
  const [templateFiles, setTemplateFiles] = useState<TemplateFileEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // We read from project context to get the currently tracked projectFolders
  const { projectFolders } = useProject();

  // Step 4: We use the toast for error feedback
  const { showToast } = useToast();

  // Step 5: Accessibility - track modal content ref and previously focused element
  const modalContentRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadTemplates();
      // Save previously focused element
      if (document.activeElement instanceof HTMLElement) {
        previouslyFocusedElementRef.current = document.activeElement;
      }
    } else {
      setTemplateFiles([]);
      setLoading(true);
    }
  }, [isOpen]);

  // Focus the modal content when open
  useEffect(() => {
    if (isOpen) {
      // Delay focusing to avoid potential race conditions
      setTimeout(() => {
        modalContentRef.current?.focus();
      }, 50);
    } else {
      // Return focus to previously focused element if possible
      if (previouslyFocusedElementRef.current) {
        previouslyFocusedElementRef.current.focus();
      }
    }
  }, [isOpen]);

  async function loadTemplates() {
    try {
      setLoading(true);
      if (!window.electronAPI?.listAllTemplateFiles) {
        showToast('Could not load template list - electronAPI unavailable.', 'error');
        setTemplateFiles([]);
        setLoading(false);
        return;
      }
      // pass current projectFolders
      const files = await window.electronAPI.listAllTemplateFiles({ projectFolders });
      const sorted = files.slice().sort((a, b) => a.fileName.localeCompare(b.fileName));
      setTemplateFiles(sorted);
    } catch (err) {
      console.error('[TemplateSelectorModal] Failed to list template files:', err);
      showToast(`Error loading templates: ${String(err)}`, 'error');
      setTemplateFiles([]);
    } finally {
      setLoading(false);
    }
  }

  /**
   * handleSelectTemplate
   * Reads the selected template file, then calls parseTemplateBlocksAsync.
   */
  async function handleSelectTemplate(entry: TemplateFileEntry) {
    try {
      let content: string | null = null;
      if (entry.source === 'global') {
        content = await window.electronAPI.readGlobalPromptComposerFile(entry.fileName);
      } else {
        content = await window.electronAPI.readPromptComposerFile(entry.fileName);
      }
      if (!content) {
        console.warn(
          `[TemplateSelectorModal] Could not read content from ${entry.source} file: ${entry.fileName}`
        );
        showToast(`Could not read template "${entry.fileName}". File not found?`, 'error');
        return;
      }

      const parsedBlocks = await parseTemplateBlocksAsync(content, undefined, undefined, msg => {
        showToast(msg, 'error');
      });

      // Insert the resulting blocks into the composition
      onInsertBlocks(parsedBlocks);

      // Close the modal
      onClose();
    } catch (err) {
      console.error('[TemplateSelectorModal] handleSelectTemplate error:', err);
      showToast(`Failed to load template: ${String(err)}`, 'error');
    }
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white dark:bg-gray-800 w-full max-w-md p-4 rounded shadow-lg"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="templateSelectorModalTitle"
        ref={modalContentRef}
        tabIndex={-1}
      >
        <h2
          className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4"
          id="templateSelectorModalTitle"
        >
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
                <span className="text-sm text-gray-800 dark:text-gray-100">{entry.fileName}</span>
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
