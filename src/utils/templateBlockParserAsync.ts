/**
 * @file templateBlockParserAsync.ts
 * @description
 * Provides an async function to parse a multiline template text into multiple blocks,
 * possibly expanding nested references by reading the actual template files.
 *
 * Step 4 Changes (Error Feedback):
 *  - We add an optional `onError` callback so we can report issues (e.g., unknown template,
 *    cyclic reference) to the user interface. For example, if a template is missing, we can
 *    call onError(`Missing template: ...`).
 *  - This function is used by TemplateSelectorModal and others. We pass the onError callback
 *    from there, which typically calls showToast().
 */

import { v4 as uuidv4 } from 'uuid';
import { Block, TemplateBlock, TextBlock, FilesBlock } from '../types/Block';
import { tryReadTemplateFile } from './readTemplateFile';

/**
 * Regex capturing placeholders like {{XYZ=abc}} or {{XYZ}}
 * Group 1 => The entire placeholder string
 * Group 2 => The placeholder name (XYZ)
 * Group 3 => The optional "=abc" content
 */
const placeholderRegex = /(\{\{([A-Za-z0-9_\-]+)(?:=([^}]*))?\}\})/g;

/**
 * An optional callback for error reporting. If provided, 
 * the parser will call onError(message) when it encounters an issue.
 */
type ErrorCallback = (message: string) => void;

interface ParseOptions {
  forceGroupId ? : string;
  forceLeadBlockId ? : string;
  visitedTemplates ? : Set < string > ;
  onError ? : ErrorCallback;
}

/**
 * parseTemplateBlocksAsync
 * @param sourceText - The multiline template text containing placeholders
 * @param forceGroupId - optional groupId to force
 * @param forceLeadBlockId - optional ID to assign to the first block
 * @param onError - optional callback for parse errors or warnings
 * @returns A promise that resolves to an array of blocks (the first block is lead)
 *
 * Implementation details:
 *  - We maintain visitedTemplates to avoid infinite recursion.
 *  - We call onError in cases such as unknown template references or cyclic references.
 */
export async function parseTemplateBlocksAsync(
  sourceText: string,
  forceGroupId ? : string,
  forceLeadBlockId ? : string,
  onError ? : ErrorCallback
): Promise < Block[] > {
  const options: ParseOptions = {
    forceGroupId,
    forceLeadBlockId,
    visitedTemplates: new Set < string > (),
    onError
  };
  return parseTemplateBlocksInternalAsync(sourceText, options);
}

async function parseTemplateBlocksInternalAsync(
  sourceText: string,
  options: ParseOptions
): Promise < Block[] > {
  const {
    forceGroupId,
    forceLeadBlockId,
    visitedTemplates = new Set < string > (),
    onError
  } = options;

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
      isGroupLead: false
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
      // fallback block if unrecognized
      const fallback: TemplateBlock = {
        id: newBlockId(),
        type: 'template',
        label: 'Unknown Template Placeholder',
        content: fullPlaceholder,
        variables: [],
        locked: true,
        groupId,
        isGroupLead: false
      };
      if (!leadAssigned) {
        fallback.isGroupLead = true;
        fallback.locked = false;
        if (forceLeadBlockId) fallback.id = forceLeadBlockId;
        leadAssigned = true;
      }
      // Also notify onError if provided
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
    // empty template
    const emptyBlock: TemplateBlock = {
      id: forceLeadBlockId || newBlockId(),
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

/**
 * parsePlaceholderAsync
 * Creates the appropriate blocks for recognized placeholders:
 *  - TEXT_BLOCK => text block
 *  - FILE_BLOCK => files block
 *  - TEMPLATE_BLOCK => minimal template block
 * Or, if unrecognized => treat as a reference to another template file 
 * using tryReadTemplateFile from readTemplateFile.ts.
 *
 * @param placeholderName - e.g. TEXT_BLOCK, FILE_BLOCK, or templateRef
 * @param placeholderValue - e.g. "some text" after '='
 * @param groupId - The groupId for the blocks
 * @param visitedTemplates - A set of placeholders we've seen to detect cycles
 * @param makeLeadBlockId - If not falsy, we set isGroupLead for the first returned block
 * @param onError - optional callback for parse errors or warnings
 * @returns A promise that resolves to an array of blocks, possibly empty
 */
async function parsePlaceholderAsync(
  placeholderName: string,
  placeholderValue: string | undefined,
  groupId: string,
  visitedTemplates: Set < string > ,
  makeLeadBlockId: string | false | undefined,
  onError ? : ErrorCallback
): Promise < Block[] > {
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
      isGroupLead: false
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
      isGroupLead: false
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
      isGroupLead: false
    };
    if (makeLeadBlockId) {
      tb.isGroupLead = true;
      tb.locked = false;
      tb.id = makeLeadBlockId;
    }
    return [tb];
  }

  // Otherwise, treat as a reference to another template
  const templateRef = placeholderName.trim();
  if (visitedTemplates.has(templateRef)) {
    // produce a locked "Cyclic Template Ref" block
    const cyc: TemplateBlock = {
      id: newBlockId(),
      type: 'template',
      label: `Cyclic Template Ref: ${templateRef}`,
      content: `{{${templateRef}}}`,
      variables: [],
      locked: true,
      groupId,
      isGroupLead: false
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

  // Attempt to read the file content
  let fileContent: string | null = null;
  try {
    fileContent = await tryReadTemplateFile(templateRef);
  } catch (err) {
    onError?.(`Error reading template file "${templateRef}": ${String(err)}`);
  }

  if (!fileContent) {
    // produce a locked "Unknown template" block
    const unknown: TemplateBlock = {
      id: newBlockId(),
      type: 'template',
      label: 'Unknown Template',
      content: `{{${templateRef}}}`,
      variables: [],
      locked: true,
      groupId,
      isGroupLead: false
    };
    if (makeLeadBlockId) {
      unknown.isGroupLead = true;
      unknown.locked = false;
      unknown.id = makeLeadBlockId;
    }
    onError?.(`Missing or unreadable template: "${templateRef}"`);
    return [unknown];
  }

  // If found, parse it recursively. We keep the same groupId.
  // We force them locked except possibly the first if makeLeadBlockId is set.
  const subBlocks = await parseTemplateBlocksInternalAsync(fileContent, {
    forceGroupId: groupId,
    visitedTemplates,
    onError
  });

  if (subBlocks.length > 0 && makeLeadBlockId) {
    subBlocks[0].isGroupLead = true;
    subBlocks[0].locked = false;
    subBlocks[0].id = makeLeadBlockId;
  }

  return subBlocks;
}
