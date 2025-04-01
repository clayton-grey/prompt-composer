/**
 * @file templateBlockParserAsync.ts
 * @description
 * Parses the template string for {{FILE_BLOCK}}, {{TEXT_BLOCK=...}}, {{PROMPT_RESPONSE=...}}, etc.
 * Optionally flattens nested templates using `flattenTemplate` if `flatten=true`.
 *
 * Step 7 (Refine Type Declarations):
 *  - Added additional doc comments describing the typed signature for parseTemplateBlocksAsync.
 *  - Confirmed no usage of `any`.
 *  - Provided clarifications for parsePlaceholder and its typed return of Block[].
 */

import { v4 as uuidv4 } from 'uuid';
import { Block, TextBlock, TemplateBlock, FilesBlock, PromptResponseBlock } from '../types/Block';
import { flattenTemplate } from './flattenTemplate';

// Fix TypeScript error with window.electronAPI
declare global {
  interface Window {
    electronAPI?: {
      readPromptComposerFile: (fileName: string, subDirectory?: string) => Promise<string | null>;
      readGlobalPromptComposerFile: (
        fileName: string,
        subDirectory?: string
      ) => Promise<string | null>;
    };
  }
}

type ErrorCallback = (message: string) => void;

/**
 * parseTemplateBlocksAsync
 *
 * Parses a single template text and returns an array of blocks. For instance:
 *    - Plain text segments become TemplateBlock objects with `type='template'`
 *    - {{TEXT_BLOCK=Some text}} => a TextBlock
 *    - {{FILE_BLOCK}} => a FilesBlock
 *    - {{PROMPT_RESPONSE=filename.txt}} => a PromptResponseBlock
 *
 * If `flatten=true`, we first call flattenTemplate() to inline any nested templates
 * (i.e. placeholders like {{SOME_OTHER_TEMPLATE}} referencing separate files).
 *
 * @param sourceText    The raw template text
 * @param forceGroupId  Optionally enforce all returned blocks to share this group ID
 * @param forceLeadBlockId  Optionally force the first block's ID to match this and treat as group lead
 * @param onError       Optional callback for parse errors
 * @param flatten       Whether to flatten nested templates prior to placeholder parsing
 * @returns Promise<Block[]> a typed array of blocks (TextBlock, TemplateBlock, FilesBlock, etc.)
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

  // Regex capturing placeholders of the form {{PLACEHOLDER}} or {{PLACEHOLDER=value}}
  const placeholderRegex = /(\{\{([A-Za-z0-9_\-]+)(?:=([^}]*))?\}\})/g;

  /**
   * Utility to quickly build a 'template' segment block for plain text
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

  // Loop over all placeholders
  while ((match = placeholderRegex.exec(finalText)) !== null) {
    const fullPlaceholder = match[1]; // e.g. '{{TEXT_BLOCK=Some text}}'
    const placeholderName = match[2]; // e.g. 'TEXT_BLOCK'
    const placeholderValue = match[3]; // e.g. 'Some text'
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

  // If we ended up with no blocks at all, add a single empty template block
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

  // Attempt to load initial content for any promptResponse blocks
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
 *
 * Given a placeholderName (e.g. 'TEXT_BLOCK', 'FILE_BLOCK', 'PROMPT_RESPONSE') and optional value,
 * returns one or more Blocks representing that placeholder. If unknown, returns an empty array.
 *
 * @param placeholderName  The text after '{{' and before '=' or '}}'
 * @param placeholderValue The optional value after '=' and before '}}'
 * @param groupId          The group ID to assign to these blocks
 * @param makeLeadBlockId  (string | false) If truthy, we set the first block's ID, isGroupLead, locked = false
 * @param onError          Optional callback to report parse errors
 * @returns An array of zero or more typed Blocks
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
    // Check if placeholderValue looks like template content rather than a filename
    // This happens when the template content is mistakenly used as a filename
    let filename = 'untitled.txt';
    if (placeholderValue) {
      if (placeholderValue.length > 100 || placeholderValue.includes('\n')) {
        console.warn(
          'Detected template content passed as filename. Using default filename instead.'
        );
        // Continue with default filename
      } else {
        filename = placeholderValue.trim();
      }
    }

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

  // If unknown, return an empty array. We'll let the caller handle it.
  onError?.(
    `Unknown placeholder: {{${placeholderName}${placeholderValue ? '=' + placeholderValue : ''}}}`
  );
  return [];
}
