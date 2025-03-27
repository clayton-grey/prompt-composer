
/**
 * @file templateBlockParser.ts
 * @description
 * Implements a parsing function for multi-block template expansions. Previously this was
 * "prefabParser.ts" and used "prefab" terminology. Now we unify everything under "template."
 *
 * Key Responsibilities:
 *  - Parse a single multiline text (sourceText) that may contain placeholders like {{TEXT_BLOCK}},
 *    {{FILE_BLOCK}}, or {{TEMPLATE_BLOCK}}. We split the text around these placeholders,
 *    creating locked blocks that share a groupId.
 *  - The first block in that group is the "group lead" (isGroupLead = true), allowing reorder or delete
 *    of the entire group. All others are locked to that group.
 *
 * Placeholder patterns:
 *    {{TEXT_BLOCK}}    -> Creates a new text block
 *    {{FILE_BLOCK}}    -> Creates a new file block
 *    {{TEMPLATE_BLOCK}}-> Creates a new template block
 *
 * Implementation Details:
 *  - We assign a unique groupId to all blocks created from this source text.
 *  - For any plain text between placeholders, we create a locked TemplateBlock to hold that text.
 *  - The placeholders themselves produce a text, file, or nested template block, each locked as well.
 *  - The user cannot reorder or delete these blocks individually outside the group.
 *
 * @notes
 *  - This is an in-memory expansion only; a future "Flip" editing may let users alter the text post-hoc.
 */

import { v4 as uuidv4 } from 'uuid';
import { Block, TemplateBlock, TextBlock, FilesBlock } from '../types/Block';

/**
 * parseTemplateBlocks
 * @param sourceText - A multiline string with placeholders like {{TEXT_BLOCK}} or {{FILE_BLOCK}}
 * @returns an array of Block objects, each locked and sharing a groupId.
 *          The first block has isGroupLead = true.
 */
export function parseTemplateBlocks(sourceText: string): Block[] {
  // Regex to match placeholders like {{TEXT_BLOCK}}, {{FILE_BLOCK}}, or {{TEMPLATE_BLOCK}}
  const placeholderRegex = /(\{\{(TEXT_BLOCK|FILE_BLOCK|TEMPLATE_BLOCK)\}\})/g;

  const blocks: Block[] = [];
  let currentIndex = 0;
  let match: RegExpExecArray | null;

  // Unique group ID for all blocks in this template expansion
  const groupId = uuidv4();
  let hasLead = false; // tracks if we've assigned a "group lead" block

  // Helper: generate new IDs
  const newId = () => uuidv4();

  /**
   * Creates a locked TemplateBlock for any plain text segment
   */
  function createTextBlockSegment(textSegment: string): TemplateBlock {
    return {
      id: newId(),
      type: 'template',
      label: 'Template Segment',
      content: textSegment,
      variables: [],
      locked: true,
      groupId,
      isGroupLead: false
    };
  }

  while ((match = placeholderRegex.exec(sourceText)) !== null) {
    const placeholderFull = match[1]; // e.g. "{{TEXT_BLOCK}}"
    const placeholderType = match[2]; // e.g. "TEXT_BLOCK"
    const matchIndex = match.index;

    // 1) Capture the text leading up to this placeholder
    const textSegment = sourceText.slice(currentIndex, matchIndex);
    if (textSegment.trim().length > 0) {
      const textBlock = createTextBlockSegment(textSegment);
      if (!hasLead) {
        textBlock.isGroupLead = true;
        hasLead = true;
      }
      blocks.push(textBlock);
    }

    // 2) Create a block for the placeholder
    let placeholderBlock: Block;
    switch (placeholderType) {
      case 'TEXT_BLOCK': {
        const newBlock: TextBlock = {
          id: newId(),
          type: 'text',
          label: 'User Text Block',
          content: '',
          locked: true,
          groupId,
          isGroupLead: false
        };
        placeholderBlock = newBlock;
        break;
      }
      case 'FILE_BLOCK': {
        const newBlock: FilesBlock = {
          id: newId(),
          type: 'files',
          label: 'File Block',
          files: [],
          locked: true,
          groupId,
          isGroupLead: false
        };
        placeholderBlock = newBlock;
        break;
      }
      case 'TEMPLATE_BLOCK': {
        const newBlock: TemplateBlock = {
          id: newId(),
          type: 'template',
          label: 'Nested Template Block',
          content: '',
          variables: [],
          locked: true,
          groupId,
          isGroupLead: false
        };
        placeholderBlock = newBlock;
        break;
      }
      default:
        // Fallback (shouldn't happen given our regex)
        const fallbackBlock: TemplateBlock = {
          id: newId(),
          type: 'template',
          label: 'Unknown Template Placeholder',
          content: placeholderFull,
          variables: [],
          locked: true,
          groupId,
          isGroupLead: false
        };
        placeholderBlock = fallbackBlock;
        break;
    }

    // If we haven't assigned a lead yet, do it now
    if (!hasLead) {
      placeholderBlock.isGroupLead = true;
      hasLead = true;
    }

    blocks.push(placeholderBlock);
    currentIndex = matchIndex + placeholderFull.length;
  }

  // 3) Handle any trailing text after the last placeholder
  if (currentIndex < sourceText.length) {
    const trailingText = sourceText.slice(currentIndex);
    if (trailingText.trim().length > 0) {
      const trailingBlock = createTextBlockSegment(trailingText);
      if (!hasLead) {
        trailingBlock.isGroupLead = true;
        hasLead = true;
      }
      blocks.push(trailingBlock);
    }
  }

  return blocks;
}
