
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
 *   a corresponding block. For a template reference, we attempt to read from 
 *   .prompt-composer in project/global, parse that content recursively, and 
 *   inline the resulting blocks as locked sub-blocks in the *same group*.
 * - We preserve the "first block is lead" logic by tracking whether we've assigned 
 *   a lead. The rest of the blocks are locked. 
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
 */

import { v4 as uuidv4 } from 'uuid';
import { Block, TemplateBlock, TextBlock, FilesBlock } from '../types/Block';

// Attempt to read from project or global
// The user had a prior "tryReadTemplateFile" logic in templateResolver. Let's replicate a simpler approach here.
async function tryReadTemplateFile(baseName: string): Promise<string | null> {
  if (!window.electronAPI) {
    console.warn('[templateBlockParserAsync] electronAPI not available. Skipping read attempts.');
    return null;
  }

  // Attempt direct read from .prompt-composer in project
  let content = await window.electronAPI.readPromptComposerFile(baseName);
  if (content) {
    return content;
  }
  // Attempt direct read from .prompt-composer in global
  content = await window.electronAPI.readGlobalPromptComposerFile(baseName);
  if (content) {
    return content;
  }

  // If the baseName has an extension, stop
  if (baseName.includes('.')) {
    return null;
  }

  // Try .txt or .md
  const possibleExts = ['.txt', '.md'];
  for (const ext of possibleExts) {
    const fullName = baseName + ext;
    let c = await window.electronAPI.readPromptComposerFile(fullName);
    if (c) {
      return c;
    }
    c = await window.electronAPI.readGlobalPromptComposerFile(fullName);
    if (c) {
      return c;
    }
  }

  return null;
}

// Regex: captures placeholders like {{XYZ=abc}} or {{XYZ}}
const placeholderRegex = /(\{\{([A-Za-z0-9_\-]+)(?:=([^}]*))?\}\})/g;

interface ParseOptions {
  forceGroupId?: string;
  forceLeadBlockId?: string;
  visitedTemplates: Set<string>;
}

/**
 * parseTemplateBlocksAsync
 * @param sourceText - The multiline template text containing placeholders
 * @param forceGroupId - optional groupId
 * @param forceLeadBlockId - optional ID for the first block
 * @param visitedTemplates - pass in a visited set if doing nested expansions
 * @returns A promise that resolves to an array of blocks (first block is lead, others locked).
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
    const fullPlaceholder = match[1];   // e.g. {{TEXT_BLOCK=Hello}}
    const placeholderName = match[2];   // e.g. TEXT_BLOCK
    const placeholderValue = match[3];  // e.g. Hello
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
      visitedTemplates
    );

    if (placeholderBlocks.length === 0) {
      // create a fallback block
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
      if (!leadAssigned) {
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
 * For recognized placeholders:
 *   - TEXT_BLOCK => text block
 *   - FILE_BLOCK => files block
 *   - TEMPLATE_BLOCK => minimal template block
 * For unknown => treat as a reference to another template file. 
 * Try reading the file, parse its content. If found, inline those blocks (locked).
 */
async function parsePlaceholderAsync(
  placeholderName: string,
  placeholderValue: string | undefined,
  groupId: string,
  visitedTemplates: Set<string>
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
      isGroupLead: false
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
      isGroupLead: false
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
      isGroupLead: false
    };
    return [tb];
  }

  // Otherwise, treat as a reference to another template file
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
    return [cyc];
  }
  // Mark visited
  visitedTemplates.add(templateRef);

  // Attempt to read the file content
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
      isGroupLead: false
    };
    return [unknown];
  }

  // If found, parse it recursively
  const subBlocks = await parseTemplateBlocksInternalAsync(fileContent, {
    forceGroupId: groupId,
    visitedTemplates
  });
  // subBlocks are locked except possibly the first if they haven't assigned lead yet,
  // but we have a lead in this group already, so we'll forcibly lock them all:
  const lockedSub = subBlocks.map((b, idx) => {
    if (idx === 0 && b.isGroupLead) {
      // We keep the group lead as isGroupLead = false because the main template is the real lead
      return { ...b, isGroupLead: false, locked: true };
    }
    return { ...b, isGroupLead: false, locked: true };
  });
  return lockedSub;
}
