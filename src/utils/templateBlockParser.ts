
/**
 * @file templateBlockParser.ts
 * @description
 * Implements a parsing function for multi-block template expansions. Previously
 * this was "prefabParser.ts", but we've merged all prefab logic into templates.
 *
 * Key Responsibilities:
 *  - Parse a single multiline text (sourceText) that may contain placeholders like:
 *      {{TEXT_BLOCK}}, {{FILE_BLOCK}}, or {{TEMPLATE_BLOCK}}.
 *  - We split the text around these placeholders, creating blocks that share a groupId.
 *  - The FIRST block in the returned array acts as the "lead" block of the group:
 *      - isGroupLead = true
 *      - locked = false (so the user can reorder or delete the entire group)
 *    All subsequent blocks in that group:
 *      - isGroupLead = false
 *      - locked = true
 *
 * This step adds support for an optional groupId and leadBlockId, so we can re-use an
 * existing group for "flip" editing flows. If they are passed in, we apply them to
 * the resulting blocks:
 *  - groupId: Forces all blocks to share this ID
 *  - leadBlockId: The first block in the array will have this ID instead of a newly-generated one
 *
 * Placeholder patterns recognized:
 *    {{TEXT_BLOCK}}    -> Creates a new text block
 *    {{FILE_BLOCK}}    -> Creates a new files block
 *    {{TEMPLATE_BLOCK}}-> Creates a new template block
 *
 * Implementation:
 *  1) We do a regex pass to find placeholders, splitting the source text.
 *  2) We build locked "sub-blocks" for placeholders, plus locked "template" sub-blocks
 *     for text segments.
 *  3) The FIRST block is not locked, isGroupLead=true. Others are locked, isGroupLead=false.
 */

import { v4 as uuidv4 } from 'uuid';
import { Block, TemplateBlock, TextBlock, FilesBlock } from '../types/Block';

/**
 * parseTemplateBlocks
 * @param sourceText - The multiline template text that may contain placeholders
 * @param forceGroupId - Optional existing groupId for re-parsing an existing group
 * @param forceLeadBlockId - Optional existing blockId for the lead block (to keep the same ID)
 * @returns An array of blocks. The first is the "lead" (unlocked), the rest are locked sub-blocks.
 */
export function parseTemplateBlocks(
  sourceText: string,
  forceGroupId?: string,
  forceLeadBlockId?: string
): Block[] {
  // Regex to match placeholders like {{TEXT_BLOCK}}, {{FILE_BLOCK}}, {{TEMPLATE_BLOCK}}
  const placeholderRegex = /(\{\{(TEXT_BLOCK|FILE_BLOCK|TEMPLATE_BLOCK)\}\})/g;

  const blocks: Block[] = [];
  let currentIndex = 0;
  let match: RegExpExecArray | null;

  // A unique group ID for all blocks in this template expansion,
  // unless we are forcibly reusing an existing groupId
  const groupId = forceGroupId || uuidv4();

  // We'll need to track if we've assigned a lead block yet
  let leadAssigned = false;

  // Helper to generate a fresh block ID (unless we want a forced lead block ID)
  const newId = (): string => uuidv4();

  /**
   * createTemplateSegmentBlock
   * Creates a locked TemplateBlock for plain text segments between placeholders
   */
  function createTemplateSegmentBlock(textSegment: string): TemplateBlock {
    return {
      id: newId(),
      type: 'template',
      label: 'Template Segment',
      content: textSegment,
      variables: [],
      locked: true,        // will unlock the first block we encounter if lead not assigned
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
    if (textSegment.length > 0) {
      // Create a template segment block
      const textBlock = createTemplateSegmentBlock(textSegment);

      // If we haven't assigned a lead block yet, do it here
      if (!leadAssigned) {
        textBlock.isGroupLead = true;
        textBlock.locked = false;
        if (forceLeadBlockId) {
          textBlock.id = forceLeadBlockId;
        }
        leadAssigned = true;
      }
      blocks.push(textBlock);
    }

    // 2) Create a block for the placeholder
    let placeholderBlock: Block;

    switch (placeholderType) {
      case 'TEXT_BLOCK': {
        const newTextBlock: TextBlock = {
          id: newId(),
          type: 'text',
          label: 'User Text Block',
          content: '',
          locked: true,
          groupId,
          isGroupLead: false
        };
        placeholderBlock = newTextBlock;
        break;
      }
      case 'FILE_BLOCK': {
        const newFileBlock: FilesBlock = {
          id: newId(),
          type: 'files',
          label: 'File Block',
          files: [],
          locked: true,
          groupId,
          isGroupLead: false
        };
        placeholderBlock = newFileBlock;
        break;
      }
      case 'TEMPLATE_BLOCK': {
        const newTemplateBlock: TemplateBlock = {
          id: newId(),
          type: 'template',
          label: 'Nested Template Block',
          content: '',
          variables: [],
          locked: true,
          groupId,
          isGroupLead: false
        };
        placeholderBlock = newTemplateBlock;
        break;
      }
      default: {
        // Fallback (shouldn't happen with this regex)
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
    }

    // If no lead assigned yet, make this block the lead
    if (!leadAssigned) {
      placeholderBlock.isGroupLead = true;
      placeholderBlock.locked = false;
      if (forceLeadBlockId) {
        placeholderBlock.id = forceLeadBlockId;
      }
      leadAssigned = true;
    }

    blocks.push(placeholderBlock);

    currentIndex = matchIndex + placeholderFull.length;
  }

  // 3) Handle any trailing text after the last placeholder
  if (currentIndex < sourceText.length) {
    const trailingText = sourceText.slice(currentIndex);
    if (trailingText.length > 0) {
      const trailingBlock = createTemplateSegmentBlock(trailingText);
      if (!leadAssigned) {
        trailingBlock.isGroupLead = true;
        trailingBlock.locked = false;
        if (forceLeadBlockId) {
          trailingBlock.id = forceLeadBlockId;
        }
        leadAssigned = true;
      }
      blocks.push(trailingBlock);
    }
  }

  // Edge case: If we ended up with no blocks at all, create a single (lead) block with empty content
  if (blocks.length === 0) {
    const emptyBlock: TemplateBlock = {
      id: forceLeadBlockId || newId(),
      type: 'template',
      label: 'Empty Template',
      content: '',
      variables: [],
      locked: false,
      groupId,
      isGroupLead: true
    };
    blocks.push(emptyBlock);
  }

  return blocks;
}
