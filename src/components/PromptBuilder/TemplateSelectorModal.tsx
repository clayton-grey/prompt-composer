/**
 * @file TemplateSelectorModal.tsx
 * @description
 * A modal component that displays a consolidated list of template files
 * from global + project .prompt-composer directories. Upon user selection,
 * it reads the file content and uses our parser to generate blocks.
 *
 * Accessibility Improvements (Step 5):
 *  - Added a keyDown handler on the overlay. If user presses 'Escape', we close the modal.
 *  - Ensured the outer overlay has tabIndex={-1} to catch keyboard events,
 *    while we still shift focus to the modal content.
 *  - This improves user experience for quick keyboard-based closing of the modal.
 *
 * Implementation details:
 *  - The modal can be closed by clicking the overlay background or pressing ESC.
 *  - We keep track of a reference to the modalContentRef for focusing.
 *  - Users can tab from the content to the Cancel button.
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

  // We use the toast for error feedback
  const { showToast } = useToast();

  // Accessibility references
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

      onInsertBlocks(parsedBlocks);

      onClose();
    } catch (err) {
      console.error('[TemplateSelectorModal] handleSelectTemplate error:', err);
      showToast(`Failed to load template: ${String(err)}`, 'error');
    }
  }

  /**
   * handleOverlayKeyDown
   * If the user presses Escape, close the modal. We do not trap other keys.
   */
  function handleOverlayKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={handleOverlayKeyDown}
      tabIndex={-1}
      aria-modal="true"
      role="dialog"
      aria-labelledby="templateSelectorModalTitle"
    >
      <div
        className="bg-white dark:bg-gray-800 w-full max-w-md p-4 rounded shadow-lg"
        onClick={e => e.stopPropagation()}
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
