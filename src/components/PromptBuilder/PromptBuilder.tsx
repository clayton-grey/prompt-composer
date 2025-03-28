import React, { useEffect, useState } from 'react';
import { usePrompt } from '../../context/PromptContext';
import BlockList from './BlockList';
import TemplateListView from './TemplateListView';
import { Block, TemplateBlock } from '../../types/Block';

/**
 * Utility to reconstruct the raw text from the group for raw editing.
 */
function reconstructRawTemplateFromGroup(
  groupId: string,
  leadBlockId: string,
  allBlocks: Block[]
): string {
  const groupBlocks = allBlocks
    .map((b, idx) => ({ block: b, idx }))
    .filter(item => item.block.groupId === groupId);
  groupBlocks.sort((a, b) => a.idx - b.idx);

  let raw = '';
  for (const { block } of groupBlocks) {
    switch (block.type) {
      case 'template':
        raw += block.content;
        break;
      case 'text':
        raw += `{{TEXT_BLOCK=${block.content}}}`;
        break;
      case 'files':
        raw += `{{FILE_BLOCK}}`;
        break;
      case 'promptResponse':
        raw += `{{PROMPT_RESPONSE=${block.sourceFile}}}`;
        break;
    }
  }
  return raw;
}

export const PromptBuilder: React.FC = () => {
  const { blocks, updateBlock, getFlattenedPrompt, importComposition, replaceTemplateGroup } =
    usePrompt();

  const hasBlocks = blocks.length > 0;
  const leadTemplates = blocks.filter(
    b => b.isGroupLead && b.type === 'template'
  ) as TemplateBlock[];

  // Identify if any lead template is currently editing raw
  const editingTemplate = leadTemplates.find(t => t.editingRaw);

  // For storing and editing the raw content
  const [rawContent, setRawContent] = useState<string>('');
  const [originalRawContent, setOriginalRawContent] = useState<string>('');

  useEffect(() => {
    // If we just switched to an editing raw template, reconstruct the text
    if (editingTemplate) {
      const reconstructed = reconstructRawTemplateFromGroup(
        editingTemplate.groupId!,
        editingTemplate.id,
        blocks
      );
      setRawContent(reconstructed);
      setOriginalRawContent(reconstructed);
    }
  }, [editingTemplate, blocks]);

  /**
   * handleCopy
   * Copies the flattened prompt to clipboard
   */
  const handleCopy = async () => {
    try {
      const promptString = await getFlattenedPrompt();
      await navigator.clipboard.writeText(promptString);
      console.log('[PromptBuilder] Prompt copied to clipboard');
    } catch (err) {
      console.error('[PromptBuilder] Failed to copy prompt:', err);
    }
  };

  /**
   * handleEditTemplate
   * sets editingRaw = true for a lead template block
   */
  const handleEditTemplate = (block: TemplateBlock) => {
    updateBlock({ ...block, editingRaw: true });
  };

  /**
   * handleClose
   * clears all blocks => returns to template list
   */
  const handleClose = () => {
    importComposition([], { maxTokens: 100000, model: 'gpt-4' });
  };

  /**
   * handleConfirmRaw
   * For finalizing raw edits
   */
  const handleConfirmRaw = async () => {
    if (!editingTemplate) return;
    if (!editingTemplate.groupId) {
      // No group? just set editingRaw false
      updateBlock({ ...editingTemplate, editingRaw: false });
      return;
    }
    await replaceTemplateGroup(
      editingTemplate.id,
      editingTemplate.groupId,
      rawContent,
      originalRawContent
    );
    updateBlock({ ...editingTemplate, editingRaw: false });
  };

  /**
   * handleCancelRaw
   * Revert
   */
  const handleCancelRaw = () => {
    if (!editingTemplate) return;
    updateBlock({ ...editingTemplate, editingRaw: false });
  };

  return (
    <div className="flex flex-col h-full">
      {hasBlocks ? (
        <>
          {/* Header row for icons */}
          <div className="flex items-center justify-between border-b dark:border-gray-600 px-4 py-2">
            {/* Left side: copy prompt icon (only if not editing raw) */}
            {!editingTemplate && (
              <button
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
                  <path
                    d="M4 16c-1.1 0-2-.9-2-2V4
                           c0-1.1.9-2 2-2h10
                           c1.1 0 2 .9 2 2"
                  ></path>
                </svg>
              </button>
            )}

            {/* Right side: if editing raw => show Confirm/Cancel, else show Edit Template + Close */}
            <div className="flex items-center gap-3">
              {editingTemplate ? (
                <>
                  {/* Confirm button (green) */}
                  <button
                    onClick={handleConfirmRaw}
                    title="Confirm"
                    aria-label="Confirm"
                    className="w-8 h-8 bg-green-600 hover:bg-green-700 text-white rounded flex items-center justify-center"
                  >
                    {/* reusing pen icon for confirm, or could use a check icon */}
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
                      <path
                        d="M12 3H5
                               a2 2 0 0 0-2 2v14
                               a2 2 0 0 0 2 2h14
                               a2 2 0 0 0 2-2v-7"
                      />
                      <path
                        d="M18.375 2.625
                               a1 1 0 0 1 3 3
                               l-9.013 9.014
                               a2 2 0 0 1-.853.505
                               l-2.873.84
                               a.5.5 0 0 1-.62-.62
                               l.84-2.873
                               a2 2 0 0 1 .506-.852z"
                      />
                    </svg>
                  </button>
                  {/* Cancel button (red) */}
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
                      <rect width="18" height="18" x="3" y="3" rx="2" />
                      <path d="m15 9-6 6" />
                      <path d="m9 9 6 6" />
                    </svg>
                  </button>
                </>
              ) : (
                <>
                  {/* For each lead template, "Edit Template" */}
                  {leadTemplates.map(lt => (
                    <button
                      key={lt.id}
                      onClick={() => handleEditTemplate(lt)}
                      title="Edit Template"
                      aria-label="Edit Template"
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
                        <path
                          d="M12 3H5
                                 a2 2 0 0 0-2 2v14
                                 a2 2 0 0 0 2 2h14
                                 a2 2 0 0 0 2-2v-7"
                        />
                        <path
                          d="M18.375 2.625
                                 a1 1 0 0 1 3 3
                                 l-9.013 9.014
                                 a2 2 0 0 1-.853.505
                                 l-2.873.84
                                 a.5.5 0 0 1-.62-.62
                                 l.84-2.873
                                 a2 2 0 0 1 .506-.852z"
                        />
                      </svg>
                    </button>
                  ))}

                  {/* Normal "Close Template" => clears blocks */}
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
                      <path d="m15 9-6 6" />
                      <path d="m9 9 6 6" />
                    </svg>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Main content area below the buttons */}
          <div className="flex-1 overflow-hidden bg-gray-100 dark:bg-gray-800 flex flex-col">
            <div className="flex-1 overflow-auto p-4">
              {editingTemplate ? (
                // If raw editing, show a big textarea.
                // We'll remove "h-full" in favor of "flex-1" approach to avoid scrollbars.
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
        /* No blocks => show template list */
        <TemplateListView />
      )}
    </div>
  );
};

export default PromptBuilder;
