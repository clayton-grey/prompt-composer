
/**
 * @file templateBlockParserAsync.ts
 * @description
 * Provides an async function to parse a multiline template text into multiple blocks,
 * expanding nested references (e.g. {{SOME_TEMPLATE}}) by reading and parsing 
 * the actual template files from the filesystem. This way, if a template references
 * another template, we inline those blocks instead of just a placeholder.
 *
 * Implementation:
 * - We run a regex to find placeholders of the form:
 *   {{TEXT_BLOCK=some text}}, {{FILE_BLOCK}}, {{TEMPLATE_BLOCK=some text}},
 *   or {{OTHER_NAME}} (treated as a template reference).
 * - For recognized placeholders (TEXT_BLOCK, FILE_BLOCK, TEMPLATE_BLOCK), we create 
 *   a corresponding block. For a template reference, we attempt to find the file in
 *   .prompt-composer using the shared `tryReadTemplateFile` function, parse that content
 *   recursively, and inline the resulting blocks.
 * - We preserve the "first block is lead" logic by tracking whether we've assigned a lead.
 * - We use a visitedTemplates set to avoid infinite recursion if templates reference 
 *   each other in a cycle. If we detect a repeated placeholderName, we produce 
 *   a locked "Cyclic Template Ref" block instead of recursing.
 *
 * Because we do file reads, this function is async. 
 * For expansions requiring multiple disk reads, we do it recursively,
 * returning a Promise<Block[]>.
 *
 * Edge Cases:
 * - If a template file is not found, we produce a locked "Unknown Template Placeholder" block.
 * - If the user references something like {{SOMETHING=some text}} for a template,
 *   we primarily ignore the "=some text" portion for the file-based template reference. 
 *   The name is all that matters. 
 *
 * Step 3 Changes:
 * - The local tryReadTemplateFile function has been removed in favor of 
 *   the shared function from './readTemplateFile'.
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

interface ParseOptions {
  forceGroupId?: string;
  forceLeadBlockId?: string;
  visitedTemplates: Set<string>;
}

/**
 * parseTemplateBlocksAsync
 * @param sourceText - The multiline template text containing placeholders
 * @param forceGroupId - optional groupId to force
 * @param forceLeadBlockId - optional ID to assign to the first block
 * @param visitedTemplates - optional set of placeholders visited so far
 * @returns A promise that resolves to an array of blocks (first block is lead, others locked)
 */
export async function parseTemplateBlocksAsync(
  sourceText: string,
  forceGroupId?: string,
  forceLeadBlockId?: string,
  visitedTemplates?: Set<string>
): Promise<Block[]> {
  const options: ParseOptions = {
    forceGroupId,
    forceLeadBlockId,
    visitedTemplates: visitedTemplates || new Set<string>()
  };
  return parseTemplateBlocksInternalAsync(sourceText, options);
}

async function parseTemplateBlocksInternalAsync(
  sourceText: string,
  options: ParseOptions
): Promise<Block[]> {
  const { forceGroupId, forceLeadBlockId, visitedTemplates } = options;
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
      forceLeadBlockId && !leadAssigned
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
 * @param visitedTemplates - A set of placeholders we've seen
 * @param makeLead - If true, the first block might become the lead block
 * @returns A promise that resolves to an array of blocks, possibly empty
 */
async function parsePlaceholderAsync(
  placeholderName: string,
  placeholderValue: string | undefined,
  groupId: string,
  visitedTemplates: Set<string>,
  makeLead: boolean
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
      isGroupLead: makeLead
    };
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
      isGroupLead: makeLead
    };
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
      isGroupLead: makeLead
    };
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
      isGroupLead: makeLead
    };
    return [cyc];
  }
  visitedTemplates.add(templateRef);

  // Attempt to read the file content via the new utility
  const fileContent = await tryReadTemplateFile(templateRef);
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
      isGroupLead: makeLead
    };
    return [unknown];
  }

  // If found, parse it recursively
  // We keep the same groupId
  const subBlocks = await parseTemplateBlocksInternalAsync(fileContent, {
    forceGroupId: groupId,
    visitedTemplates
  });
  // Force them all locked except possibly the first if makeLead is set
  if (subBlocks.length > 0 && makeLead) {
    subBlocks[0].isGroupLead = true;
    subBlocks[0].locked = false;
  }
  for (let i = 1; i < subBlocks.length; i++) {
    subBlocks[i].isGroupLead = false;
    subBlocks[i].locked = true;
  }

  return subBlocks;
}
