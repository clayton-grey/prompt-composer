
/**
 * @file prefabParser.ts
 * @description
 * Implements a parsing function for "prefab templates." A prefab template is
 * a single multiline string that may contain placeholders like {{TEXT_BLOCK}},
 * {{FILE_BLOCK}}, or {{TEMPLATE_BLOCK}}. We split the text around these placeholders,
 * creating a series of locked blocks. 
 *
 * In addition, we group them into a single "groupId" so that they move and delete
 * as a unit. The FIRST block is assigned isGroupLead=true, so only it can show
 * reorder/delete controls. The rest are isGroupLead=false, meaning they follow
 * the group lead's ordering.
 */

import { v4 as uuidv4 } from 'uuid';
import { Block, TemplateBlock, TextBlock, FilesBlock } from '../types/Block';

export function parsePrefab(prefabText: string): Block[] {
  // Regex to match placeholders like {{TEXT_BLOCK}}, etc.
  const placeholderRegex = /(\{\{(TEXT_BLOCK|FILE_BLOCK|TEMPLATE_BLOCK)\}\})/g;

  const blocks: Block[] = [];
  let currentIndex = 0;
  let match: RegExpExecArray | null;

  // We'll assign a unique group ID for all blocks in this prefab.
  const groupId = uuidv4();

  // We'll track whether we've assigned a group lead yet.
  let hasLead = false;

  // Helper to create new IDs for each block
  const newId = () => uuidv4();

  /**
   * Helper: createTextBlockSegment
   * Returns a TemplateBlock with the given text as content, locked, same groupId.
   */
  function createTextBlockSegment(textSegment: string): TemplateBlock {
    return {
      id: newId(),
      type: 'template',
      label: 'Prefab Template Block',
      content: textSegment,
      variables: [],
      locked: true,
      groupId,
      isGroupLead: false
    };
  }

  while ((match = placeholderRegex.exec(prefabText)) !== null) {
    const placeholderFull = match[1]; // e.g. "{{TEXT_BLOCK}}"
    const placeholderType = match[2]; // e.g. "TEXT_BLOCK"
    const matchIndex = match.index;

    // 1) Capture the text leading up to this placeholder
    const textSegment = prefabText.slice(currentIndex, matchIndex);
    if (textSegment.trim().length > 0) {
      const textBlock = createTextBlockSegment(textSegment);
      // If we haven't chosen a lead yet, make this block the lead
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
        // Fallback
        const fallbackBlock: TemplateBlock = {
          id: newId(),
          type: 'template',
          label: 'Unknown Prefab Placeholder',
          content: placeholderFull,
          variables: [],
          locked: true,
          groupId,
          isGroupLead: false
        };
        placeholderBlock = fallbackBlock;
        break;
    }

    // If we haven't chosen a lead yet, let's mark this placeholder block as lead
    if (!hasLead) {
      placeholderBlock.isGroupLead = true;
      hasLead = true;
    }

    blocks.push(placeholderBlock);
    currentIndex = matchIndex + placeholderFull.length;
  }

  // 3) Handle any trailing text after the last placeholder
  if (currentIndex < prefabText.length) {
    const trailingText = prefabText.slice(currentIndex);
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
