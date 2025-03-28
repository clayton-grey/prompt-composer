/**
 * @file templateBlockParserAsync.ts
 * @description
 * Provides an async function to parse a multiline template text into multiple blocks.
 * We handle placeholders like {{TEXT_BLOCK=...}}, {{FILE_BLOCK}}, {{PROMPT_RESPONSE=...}},
 * or references to other template files.
 *
 * Step 4 Changes:
 *  - Added support for {{PROMPT_RESPONSE=filename.txt}} placeholders to produce a PromptResponseBlock.
 *    We read the file content from .prompt-composer if it exists. If not found, content = ''.
 */

import { v4 as uuidv4 } from 'uuid';
import { Block, TemplateBlock, TextBlock, FilesBlock, PromptResponseBlock } from '../types/Block';
import { tryReadTemplateFile } from './readTemplateFile';

const placeholderRegex = /(\{\{([A-Za-z0-9_\-]+)(?:=([^}]*))?\}\})/g;

type ErrorCallback = (message: string) => void;

interface ParseOptions {
  forceGroupId?: string;
  forceLeadBlockId?: string;
  visitedTemplates?: Set<string>;
  onError?: ErrorCallback;
}

/**
 * parseTemplateBlocksAsync
 * The entry point for parsing a template string into an array of blocks.
 */
export async function parseTemplateBlocksAsync(
  sourceText: string,
  forceGroupId?: string,
  forceLeadBlockId?: string,
  onError?: ErrorCallback
): Promise<Block[]> {
  const options: ParseOptions = {
    forceGroupId,
    forceLeadBlockId,
    visitedTemplates: new Set<string>(),
    onError,
  };
  return parseTemplateBlocksInternalAsync(sourceText, options);
}

async function parseTemplateBlocksInternalAsync(
  sourceText: string,
  options: ParseOptions
): Promise<Block[]> {
  const { forceGroupId, forceLeadBlockId, visitedTemplates = new Set<string>(), onError } = options;

  const groupId = forceGroupId || uuidv4();
  let blocks: Block[] = [];
  let currentIndex = 0;
  let match: RegExpExecArray | null;
  let leadAssigned = false;

  function newBlockId(): string {
    return uuidv4();
  }

  function createTemplateSegmentBlock(textSegment: string): TemplateBlock {
    return {
      id: newBlockId(),
      type: 'template',
      label: 'Template Segment',
      content: textSegment,
      variables: [],
      locked: true,
      groupId,
      isGroupLead: false,
    };
  }

  while ((match = placeholderRegex.exec(sourceText)) !== null) {
    const fullPlaceholder = match[1];
    const placeholderName = match[2];
    const placeholderValue = match[3];
    const matchIndex = match.index;

    // text up to the placeholder
    const textSegment = sourceText.slice(currentIndex, matchIndex);
    if (textSegment.length > 0) {
      const segBlock = createTemplateSegmentBlock(textSegment);
      if (!leadAssigned) {
        segBlock.isGroupLead = true;
        segBlock.locked = false;
        if (forceLeadBlockId) segBlock.id = forceLeadBlockId;
        leadAssigned = true;
      }
      blocks.push(segBlock);
    }

    // parse the placeholder
    const placeholderBlocks = await parsePlaceholderAsync(
      placeholderName,
      placeholderValue,
      groupId,
      visitedTemplates,
      !leadAssigned && forceLeadBlockId,
      onError
    );

    if (placeholderBlocks.length === 0) {
      // fallback
      const fallback: TemplateBlock = {
        id: newBlockId(),
        type: 'template',
        label: 'Unknown Template Placeholder',
        content: fullPlaceholder,
        variables: [],
        locked: true,
        groupId,
        isGroupLead: false,
      };
      if (!leadAssigned) {
        fallback.isGroupLead = true;
        fallback.locked = false;
        if (forceLeadBlockId) fallback.id = forceLeadBlockId;
        leadAssigned = true;
      }
      onError?.(`Unrecognized placeholder: ${fullPlaceholder}`);
      blocks.push(fallback);
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
  if (currentIndex < sourceText.length) {
    const trailing = sourceText.slice(currentIndex);
    if (trailing.length > 0) {
      const trailingBlock = createTemplateSegmentBlock(trailing);
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
    // empty
    const emptyBlock: TemplateBlock = {
      id: forceLeadBlockId || newBlockId(),
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

async function parsePlaceholderAsync(
  placeholderName: string,
  placeholderValue: string | undefined,
  groupId: string,
  visitedTemplates: Set<string>,
  makeLeadBlockId: string | false | undefined,
  onError?: ErrorCallback
): Promise<Block[]> {
  const newBlockId = () => uuidv4();

  // TEXT_BLOCK
  if (placeholderName === 'TEXT_BLOCK') {
    const textContent = placeholderValue ?? '';
    const tb: TextBlock = {
      id: newBlockId(),
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
      id: newBlockId(),
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

  // TEMPLATE_BLOCK
  if (placeholderName === 'TEMPLATE_BLOCK') {
    const templateContent = placeholderValue ?? '';
    const tb: TemplateBlock = {
      id: newBlockId(),
      type: 'template',
      label: 'Nested Template Block',
      content: templateContent,
      variables: [],
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

  // PROMPT_RESPONSE
  if (placeholderName === 'PROMPT_RESPONSE') {
    const filename = placeholderValue?.trim() || 'untitled.txt';
    let fileContent = '';
    try {
      const loaded = await tryReadTemplateFile(filename);
      if (loaded !== null) {
        fileContent = loaded;
      }
    } catch (err) {
      onError?.(`Error reading prompt response file "${filename}": ${String(err)}`);
    }

    const prb: PromptResponseBlock = {
      id: newBlockId(),
      type: 'promptResponse',
      label: 'Prompt Response',
      sourceFile: filename,
      content: fileContent,
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

  // Otherwise, treat as a reference to another template file
  const templateRef = placeholderName.trim();
  if (visitedTemplates.has(templateRef)) {
    const cyc: TemplateBlock = {
      id: newBlockId(),
      type: 'template',
      label: `Cyclic Template Ref: ${templateRef}`,
      content: `{{${templateRef}}}`,
      variables: [],
      locked: true,
      groupId,
      isGroupLead: false,
    };
    if (makeLeadBlockId) {
      cyc.isGroupLead = true;
      cyc.locked = false;
      cyc.id = makeLeadBlockId;
    }
    onError?.(`Cyclic reference detected: "${templateRef}"`);
    return [cyc];
  }
  visitedTemplates.add(templateRef);

  let fileContent: string | null = null;
  try {
    fileContent = await tryReadTemplateFile(templateRef);
  } catch (err) {
    onError?.(`Error reading template file "${templateRef}": ${String(err)}`);
  }

  if (!fileContent) {
    const unknown: TemplateBlock = {
      id: newBlockId(),
      type: 'template',
      label: 'Unknown Template',
      content: `{{${templateRef}}}`,
      variables: [],
      locked: true,
      groupId,
      isGroupLead: false,
    };
    if (makeLeadBlockId) {
      unknown.isGroupLead = true;
      unknown.locked = false;
      unknown.id = makeLeadBlockId;
    }
    onError?.(`Missing or unreadable template: "${templateRef}"`);
    return [unknown];
  }

  const subBlocks = await parseTemplateBlocksInternalAsync(fileContent, {
    forceGroupId: groupId,
    visitedTemplates,
    onError,
  });

  if (subBlocks.length > 0 && makeLeadBlockId) {
    subBlocks[0].isGroupLead = true;
    subBlocks[0].locked = false;
    subBlocks[0].id = makeLeadBlockId;
  }

  return subBlocks;
}
