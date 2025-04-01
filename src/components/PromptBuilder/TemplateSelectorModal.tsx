/**
 * @file TemplateSelectorModal.tsx
 * @description
 * A modal component that displays a consolidated list of template files
 * from global + project .prompt-composer directories. Upon user selection,
 * it reads the file content and uses our parser to generate blocks.
 *
 * Accessibility Improvements (Step 7):
 * 1) Added a focus trap to keep the user's tab navigation within the modal.
 * 2) Marked non-interactive icons as aria-hidden="true" if applicable.
 * 3) Already had role="dialog" and aria-modal="true" usage. Retained keyDown logic on overlay
 *    for closing with Escape, and introduced handleModalKeyDown for focus trapping in the content.
 *
 * Implementation details:
 *  - We gather focusable elements when the modal opens. We use 'handleModalKeyDown' on the content
 *    to cycle focus between first and last interactive elements if the user tabs.
 *  - For the overlay, if the user clicks outside or hits Escape, we close the modal.
 */

import React, { useEffect, useState, useRef } from 'react';
import { parseTemplateBlocksAsync } from '../../utils/templateBlockParserAsync';
import { Block } from '../../types/Block';
import { useProject } from '../../context/ProjectContext';
import { useToast } from '../../context/ToastContext';
import { clearTemplateCaches } from '../../utils/readTemplateFile';

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

  const { projectFolders } = useProject();
  const { showToast } = useToast();

  // Accessibility references & focus trap
  const modalContentRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const focusableElementsRef = useRef<HTMLElement[]>([]);

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

  // Focus the modal content when open & gather focusable
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        if (modalContentRef.current) {
          modalContentRef.current.focus();
          gatherFocusableElements();
        }
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

      // Clear template caches before loading templates
      clearTemplateCaches();

      if (!window.electronAPI?.listAllTemplateFiles) {
        showToast('Could not load template list - electronAPI unavailable.', 'error');
        setTemplateFiles([]);
        setLoading(false);
        return;
      }
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

  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  /**
   * handleOverlayKeyDown
   * If the user presses Escape on the overlay, close the modal.
   */
  function handleOverlayKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  }

  /**
   * gatherFocusableElements
   * Looks for all focusable items within the modal to handle the focus trap.
   */
  function gatherFocusableElements() {
    if (!modalContentRef.current) return;
    const focusable = modalContentRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    focusableElementsRef.current = Array.from(focusable).filter(el => !el.hasAttribute('disabled'));
  }

  /**
   * handleModalKeyDown
   * Basic focus trap: If user presses TAB on last focusable element, wrap to first, and vice versa.
   */
  function handleModalKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Tab') return;

    if (focusableElementsRef.current.length === 0) {
      e.preventDefault();
      return;
    }

    const firstElement = focusableElementsRef.current[0];
    const lastElement = focusableElementsRef.current[focusableElementsRef.current.length - 1];

    const isShiftTab = e.shiftKey;

    // If user hits SHIFT+TAB on the first element, cycle to the last
    if (isShiftTab && document.activeElement === firstElement) {
      e.preventDefault();
      lastElement.focus();
    }
    // If user hits TAB on the last element, cycle to the first
    else if (!isShiftTab && document.activeElement === lastElement) {
      e.preventDefault();
      firstElement.focus();
    }
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4"
      onClick={handleOverlayClick}
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
        onKeyDown={handleModalKeyDown}
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
                tabIndex={0}
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
