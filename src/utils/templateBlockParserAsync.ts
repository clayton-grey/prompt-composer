/**
 * @file templateBlockParserAsync.ts
 * @description
 * Parses a (now-flattened) template string into blocks for TEXT_BLOCK, FILE_BLOCK,
 * PROMPT_RESPONSE, or leftover placeholders.
 *
 * Major change: we no longer handle recursion or references to other templates here.
 * That is delegated to flattenTemplate.ts.
 * This parser simply does one pass:
 *   - If it's {{TEXT_BLOCK=...}}, we create a text block
 *   - If it's {{FILE_BLOCK}}, we create a file block
 *   - If it's {{PROMPT_RESPONSE=filename.txt}}, we create a promptResponse block
 *   - Otherwise, if there's a leftover placeholder, we create a minimal "Unknown Placeholder" block
 *     or "template" block with that text.
 *
 * The final result is a single-level array of blocks.
 */

import { v4 as uuidv4 } from 'uuid';
import { Block, TextBlock, TemplateBlock, FilesBlock, PromptResponseBlock } from '../types/Block';
import { tryReadTemplateFile } from './readTemplateFile';
import { flattenTemplate } from './flattenTemplate';

const placeholderRegex = /(\{\{([A-Za-z0-9_\-]+)(?:=([^}]*))?\}\})/g;

type ErrorCallback = (message: string) => void;

/**
 * parseTemplateBlocksAsync
 * 1) Flatten the template to remove nested references
 * 2) Parse the final text for placeholders that are special blocks (TEXT_BLOCK, FILE_BLOCK, PROMPT_RESPONSE)
 *    or unknown placeholders we treat as "template" style blocks
 */
export async function parseTemplateBlocksAsync(
  sourceText: string,
  forceGroupId?: string,
  forceLeadBlockId?: string,
  onError?: ErrorCallback
): Promise<Block[]> {
  // 1) Flatten the template first
  let flattenedText = await flattenTemplate(sourceText);

  // 2) Now parse placeholders in flattenedText for known tags
  const groupId = forceGroupId || uuidv4();
  let blocks: Block[] = [];
  let currentIndex = 0;
  let match: RegExpExecArray | null;
  let leadAssigned = false;

  function newTemplateSegmentBlock(textSegment: string): TemplateBlock {
    return {
      id: uuidv4(),
      type: 'template',
      label: 'Template Segment',
      content: textSegment,
      variables: [],
      locked: true,
      groupId,
      isGroupLead: false,
    };
  }

  while ((match = placeholderRegex.exec(flattenedText)) !== null) {
    const fullPlaceholder = match[1];
    const placeholderName = match[2];
    const placeholderValue = match[3];
    const matchIndex = match.index;

    // text up to this placeholder => create template segment block
    const textSegment = flattenedText.slice(currentIndex, matchIndex);
    if (textSegment.length > 0) {
      const segBlock = newTemplateSegmentBlock(textSegment);
      if (!leadAssigned) {
        segBlock.isGroupLead = true;
        segBlock.locked = false;
        if (forceLeadBlockId) segBlock.id = forceLeadBlockId;
        leadAssigned = true;
      }
      blocks.push(segBlock);
    }

    // parse the placeholder
    const placeholderBlocks = parsePlaceholder(
      placeholderName,
      placeholderValue,
      groupId,
      !leadAssigned && forceLeadBlockId,
      onError
    );
    if (placeholderBlocks.length === 0) {
      // fallback
      const unknown: TemplateBlock = {
        id: uuidv4(),
        type: 'template',
        label: 'Unknown Placeholder',
        content: fullPlaceholder,
        variables: [],
        locked: true,
        groupId,
        isGroupLead: false,
      };
      if (!leadAssigned) {
        unknown.isGroupLead = true;
        unknown.locked = false;
        if (forceLeadBlockId) unknown.id = forceLeadBlockId;
        leadAssigned = true;
      }
      onError?.(`Unrecognized placeholder: ${fullPlaceholder}`);
      blocks.push(unknown);
    } else {
      if (!leadAssigned && placeholderBlocks.length > 0) {
        placeholderBlocks[0].isGroupLead = true;
        placeholderBlocks[0].locked = false;
        if (forceLeadBlockId) placeholderBlocks[0].id = forceLeadBlockId;
        leadAssigned = true;
      }
      blocks = blocks.concat(placeholderBlocks);
    }

    currentIndex = matchIndex + fullPlaceholder.length;
  }

  // trailing text
  if (currentIndex < flattenedText.length) {
    const trailing = flattenedText.slice(currentIndex);
    if (trailing.length > 0) {
      const trailingBlock = newTemplateSegmentBlock(trailing);
      if (!leadAssigned) {
        trailingBlock.isGroupLead = true;
        trailingBlock.locked = false;
        if (forceLeadBlockId) trailingBlock.id = forceLeadBlockId;
        leadAssigned = true;
      }
      blocks.push(trailingBlock);
    }
  }

  // If no blocks, create an empty one
  if (blocks.length === 0) {
    const emptyBlock: TemplateBlock = {
      id: forceLeadBlockId || uuidv4(),
      type: 'template',
      label: 'Empty Template',
      content: '',
      variables: [],
      locked: false,
      groupId,
      isGroupLead: true,
    };
    blocks.push(emptyBlock);
  }

  return blocks;
}

/**
 * parsePlaceholder
 * Given something like placeholderName= "TEXT_BLOCK" + placeholderValue="some text",
 * we return the corresponding block(s).
 */
function parsePlaceholder(
  placeholderName: string,
  placeholderValue: string | undefined,
  groupId: string,
  makeLeadBlockId: string | false | undefined,
  onError?: ErrorCallback
): Block[] {
  const newId = () => uuidv4();

  // TEXT_BLOCK
  if (placeholderName === 'TEXT_BLOCK') {
    const textContent = placeholderValue ?? '';
    const tb: TextBlock = {
      id: newId(),
      type: 'text',
      label: 'User Text Block',
      content: textContent,
      locked: true,
      groupId,
      isGroupLead: false,
    };
    if (makeLeadBlockId) {
      tb.isGroupLead = true;
      tb.locked = false;
      tb.id = makeLeadBlockId;
    }
    return [tb];
  }

  // FILE_BLOCK
  if (placeholderName === 'FILE_BLOCK') {
    const fb: FilesBlock = {
      id: newId(),
      type: 'files',
      label: 'File Block',
      files: [],
      locked: true,
      groupId,
      isGroupLead: false,
    };
    if (makeLeadBlockId) {
      fb.isGroupLead = true;
      fb.locked = false;
      fb.id = makeLeadBlockId;
    }
    return [fb];
  }

  // PROMPT_RESPONSE
  if (placeholderName === 'PROMPT_RESPONSE') {
    const filename = (placeholderValue ?? 'untitled.txt').trim();
    const prb: PromptResponseBlock = {
      id: newId(),
      type: 'promptResponse',
      label: 'Prompt Response',
      sourceFile: filename,
      content: '', // We'll fill it from file if needed later, or leave blank
      locked: true,
      groupId,
      isGroupLead: false,
    };
    if (makeLeadBlockId) {
      prb.isGroupLead = true;
      prb.locked = false;
      prb.id = makeLeadBlockId;
    }
    return [prb];
  }

  // Otherwise -> unknown placeholder
  // Possibly leftover from something we couldn't expand or a custom user tag
  const unknown: TemplateBlock = {
    id: newId(),
    type: 'template',
    label: 'Unknown Placeholder',
    content: `{{${placeholderName}${placeholderValue ? '=' + placeholderValue : ''}}}`,
    variables: [],
    locked: true,
    groupId,
    isGroupLead: false,
  };
  onError?.(
    `Unknown placeholder: {{${placeholderName}${placeholderValue ? '=' + placeholderValue : ''}}}`
  );
  return [unknown];
}
