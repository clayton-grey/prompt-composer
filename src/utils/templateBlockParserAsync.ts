/**
 * @file templateBlockParserAsync.ts
 * @description
 * Parses a (possibly flattened) template string into blocks for TEXT_BLOCK, FILE_BLOCK,
 * PROMPT_RESPONSE, or leftover placeholders. We now revert to an approach
 * that does NOT skip or remove newlines automatically, preserving user-typed
 * spacing and line breaks in the raw text.
 *
 * If you want to hide a purely blank line after a placeholder for visual reasons,
 * do that in the UI (e.g., TemplateBlockEditor).
 */

import { v4 as uuidv4 } from 'uuid';
import { Block, TextBlock, TemplateBlock, FilesBlock, PromptResponseBlock } from '../types/Block';
import { flattenTemplate } from './flattenTemplate';

type ErrorCallback = (message: string) => void;

/**
 * parseTemplateBlocksAsync
 * @param sourceText - The raw template text to parse
 * @param forceGroupId - If provided, all resulting blocks share this groupId
 * @param forceLeadBlockId - If provided, the first block in that group is the lead with this ID
 * @param onError - Optional callback for parse errors or unknown placeholders
 * @param flatten - If true (default), we run flattenTemplate, referencing disk. If false, skip flatten.
 *
 * @returns An array of blocks (Text, Template, Files, or PromptResponse).
 */
export async function parseTemplateBlocksAsync(
  sourceText: string,
  forceGroupId?: string,
  forceLeadBlockId?: string,
  onError?: ErrorCallback,
  flatten: boolean = true
): Promise<Block[]> {
  let finalText = sourceText;
  if (flatten) {
    finalText = await flattenTemplate(sourceText);
  }

  const groupId = forceGroupId || uuidv4();
  let blocks: Block[] = [];
  let currentIndex = 0;
  let match: RegExpExecArray | null;
  let leadAssigned = false;

  // Regex capturing {{SOMETHING=maybeValue}}
  const placeholderRegex = /(\{\{([A-Za-z0-9_\-]+)(?:=([^}]*))?\}\})/g;

  /**
   * Creates a new TemplateBlock segment from a chunk of text.
   * By default locked=true, isGroupLead=false, unless it's the first block in the group.
   */
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

  while ((match = placeholderRegex.exec(finalText)) !== null) {
    const fullPlaceholder = match[1]; // e.g. "{{FILE_BLOCK}}"
    const placeholderName = match[2]; // e.g. "FILE_BLOCK"
    const placeholderValue = match[3]; // e.g. undefined or "some text"
    const matchIndex = match.index;

    // text up to this placeholder => create a template segment block
    const textSegment = finalText.slice(currentIndex, matchIndex);
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

    // parse the placeholder => might be a known special block or unknown
    const placeholderBlocks = parsePlaceholder(
      placeholderName,
      placeholderValue,
      groupId,
      !leadAssigned && forceLeadBlockId,
      onError
    );

    if (placeholderBlocks.length === 0) {
      // fallback => unknown placeholder
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

    // Advance past the placeholder
    currentIndex = matchIndex + fullPlaceholder.length;
  }

  // trailing text after the last placeholder
  if (currentIndex < finalText.length) {
    const trailing = finalText.slice(currentIndex);
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

  // If we ended up with no blocks, create an empty block
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
 * Converts a recognized placeholder into the correct block(s).
 * @param placeholderName - e.g. "TEXT_BLOCK", "FILE_BLOCK", "PROMPT_RESPONSE"
 * @param placeholderValue - the optional string after the '='
 * @param groupId - group id to apply to resulting blocks
 * @param makeLeadBlockId - if truthy, apply isGroupLead & locked=false & use that as ID
 * @param onError - callback for parse errors
 *
 * @returns An array of blocks for that placeholder
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
      content: '',
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

  // Otherwise => unknown placeholder
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
