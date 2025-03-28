/**
 * @file templateBlockParserAsync.ts
 * @description
 * Parses the template string for {{FILE_BLOCK}}, {{TEXT_BLOCK=...}}, {{PROMPT_RESPONSE=...}}, etc.
 *
 * In this update, we ensure that FILE_BLOCK placeholders default to `includeProjectMap: true`,
 * so that the user can toggle it off later in the UI, and the flatten process respects that.
 */

import { v4 as uuidv4 } from 'uuid';
import { Block, TextBlock, TemplateBlock, FilesBlock, PromptResponseBlock } from '../types/Block';
import { flattenTemplate } from './flattenTemplate';

type ErrorCallback = (message: string) => void;

/**
 * parseTemplateBlocksAsync
 * ...
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
    const fullPlaceholder = match[1];
    const placeholderName = match[2];
    const placeholderValue = match[3];
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

    currentIndex = matchIndex + fullPlaceholder.length;
  }

  // trailing text
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

  // Try loading content for any promptResponse blocks
  for (const b of blocks) {
    if (b.type === 'promptResponse') {
      const prb = b as PromptResponseBlock;
      let fileContent: string | null = null;

      try {
        if (window.electronAPI?.readPromptComposerFile) {
          fileContent = await window.electronAPI.readPromptComposerFile(prb.sourceFile);
        }
        if (!fileContent && window.electronAPI?.readGlobalPromptComposerFile) {
          fileContent = await window.electronAPI.readGlobalPromptComposerFile(prb.sourceFile);
        }
      } catch (err) {
        console.warn('[parseTemplateBlocksAsync] Could not load promptResponse file:', err);
      }

      prb.content = fileContent || '';
    }
  }

  return blocks;
}

/**
 * parsePlaceholder
 * Creates appropriate block(s) for placeholders.
 */
function parsePlaceholder(
  placeholderName: string,
  placeholderValue: string | undefined,
  groupId: string,
  makeLeadBlockId: string | false | undefined,
  onError?: ErrorCallback
): Block[] {
  const newId = () => uuidv4();

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

  if (placeholderName === 'FILE_BLOCK') {
    const fb: FilesBlock = {
      id: newId(),
      type: 'files',
      label: 'File Block',
      files: [],
      locked: true,
      groupId,
      isGroupLead: false,
      includeProjectMap: true, // default to true
    };
    if (makeLeadBlockId) {
      fb.isGroupLead = true;
      fb.locked = false;
      fb.id = makeLeadBlockId;
    }
    return [fb];
  }

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

  onError?.(
    `Unknown placeholder: {{${placeholderName}${placeholderValue ? '=' + placeholderValue : ''}}}`
  );

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
  return [unknown];
}
