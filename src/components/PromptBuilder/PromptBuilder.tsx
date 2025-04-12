/* eslint-disable @typescript-eslint/no-unused-vars */

import React, { useEffect, useState } from 'react';
import { usePrompt } from '../../context/PromptContext';
import BlockList from './BlockList';
import TemplateListView from './TemplateListView';
import { Block, TemplateBlock } from '../../types/Block';
import { parseTemplateBlocksAsync } from '../../utils/templateBlockParserAsync';
import { useMenuShortcuts } from '../../hooks/useMenuShortcuts';

/**
 * Utility to reconstruct the raw text from all blocks (if user is editing the entire composition).
 * If we only want to reconstruct one group, see older approach.
 */
function reconstructAllBlocksRaw(blocks: Block[]): string {
  let raw = '';
  for (const b of blocks) {
    switch (b.type) {
      case 'template':
        raw += b.content;
        break;
      case 'text':
        raw += `{{TEXT_BLOCK=${b.content}}}`;
        break;
      case 'files':
        raw += `{{FILE_BLOCK}}`;
        break;
      case 'promptResponse':
        raw += `{{PROMPT_RESPONSE=${b.sourceFile}}}`;
        break;
    }
  }
  return raw;
}

export const PromptBuilder: React.FC = () => {
  const { blocks, updateBlock, getFlattenedPrompt, importComposition } = usePrompt();
  const { copyPromptBtnRef } = useMenuShortcuts();

  const hasBlocks = blocks.length > 0;
  // For simplicity, we treat the entire set of blocks as a single "raw" editing scenario
  const [editingRaw, setEditingRaw] = useState<boolean>(false);
  const [rawContent, setRawContent] = useState<string>('');

  useEffect(() => {
    if (editingRaw) {
      // Reconstruct all blocks into raw text
      setRawContent(reconstructAllBlocksRaw(blocks));
    }
  }, [editingRaw, blocks]);

  const handleCopy = async () => {
    console.log('[PromptBuilder] handleCopy called directly from button click');
    try {
      const promptString = await getFlattenedPrompt();
      await navigator.clipboard.writeText(promptString);
      console.log('[PromptBuilder] Prompt copied to clipboard');
    } catch (err) {
      console.error('[PromptBuilder] Failed to copy prompt:', err);
    }
  };

  const handleToggleEditRaw = () => {
    setEditingRaw(!editingRaw);
  };

  const handleConfirmRaw = async () => {
    // Parse the entire new raw text with flatten=false => no disk re-references
    const newBlocks = await parseTemplateBlocksAsync(
      rawContent,
      undefined,
      undefined,
      msg => {
        console.warn('[PromptBuilder] parse error in raw edit:', msg);
      },
      false
    );

    // FULL REPLACEMENT of composition => no leftover blocks => no duplication
    importComposition(newBlocks, { maxTokens: 100000, model: 'gpt-4' });
    setEditingRaw(false);
  };

  const handleCancelRaw = () => {
    setEditingRaw(false);
  };

  const handleClose = () => {
    importComposition([], { maxTokens: 100000, model: 'gpt-4' });
  };

  return (
    <div className="flex flex-col h-full">
      {hasBlocks ? (
        <>
          {/* Header row */}
          <div className="flex items-center justify-between border-b dark:border-gray-600 px-4 py-2">
            {/* Copy Prompt Button (only if not in raw edit mode) */}
            {!editingRaw && (
              <button
                ref={copyPromptBtnRef}
                onClick={handleCopy}
                title="Copy Prompt"
                aria-label="Copy Prompt"
                className="w-8 h-8 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-700 rounded flex items-center justify-center"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-6 h-6"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect>
                  <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>
                </svg>
              </button>
            )}

            <div className="flex items-center gap-3">
              {/* Raw Edit Toggle */}
              {!editingRaw && (
                <button
                  onClick={handleToggleEditRaw}
                  title="Edit All as Raw"
                  aria-label="Edit All as Raw"
                  className="w-8 h-8 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-700 rounded flex items-center justify-center"
                >
                  {/* Pencil icon */}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-6 h-6"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"></path>
                  </svg>
                </button>
              )}

              {editingRaw && (
                <>
                  {/* Confirm */}
                  <button
                    onClick={handleConfirmRaw}
                    title="Confirm"
                    aria-label="Confirm"
                    className="w-8 h-8 bg-green-600 hover:bg-green-700 text-white rounded flex items-center justify-center"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="w-5 h-5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                      <path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"></path>
                    </svg>
                  </button>
                  {/* Cancel */}
                  <button
                    onClick={handleCancelRaw}
                    title="Cancel"
                    aria-label="Cancel"
                    className="w-8 h-8 bg-red-600 hover:bg-red-700 text-white rounded flex items-center justify-center"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="w-5 h-5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect width="18" height="18" x="3" y="3" rx="2"></rect>
                      <path d="m15 9-6 6"></path>
                      <path d="m9 9 6 6"></path>
                    </svg>
                  </button>
                </>
              )}

              {/* Close Template => clears blocks */}
              {!editingRaw && (
                <button
                  onClick={handleClose}
                  title="Close Template"
                  aria-label="Close Template"
                  className="w-8 h-8 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-700 rounded flex items-center justify-center"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-6 h-6"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect width="18" height="18" x="3" y="3" rx="2"></rect>
                    <path d="m15 9-6 6"></path>
                    <path d="m9 9 6 6"></path>
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Main content area */}
          <div className="flex-1 overflow-hidden bg-gray-100 dark:bg-gray-800 flex flex-col">
            <div className="flex-1 overflow-auto p-4">
              {editingRaw ? (
                <div className="flex flex-col h-full min-h-0">
                  <textarea
                    className="flex-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 p-2 resize-none"
                    value={rawContent}
                    onChange={e => setRawContent(e.target.value)}
                  />
                </div>
              ) : (
                <BlockList />
              )}
            </div>
          </div>
        </>
      ) : (
        <TemplateListView />
      )}
    </div>
  );
};

export default PromptBuilder;
