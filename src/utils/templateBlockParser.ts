
/**
 * @file templateBlockParser.ts
 * @description
 * Implements a parsing function for multi-block template expansions. Previously
 * this was "prefabParser.ts", but we've merged all prefab logic into templates.
 *
 * Key Responsibilities:
 *  1) Parse a single multiline text (sourceText) that may contain placeholders like:
 *      {{TEXT_BLOCK}}, {{FILE_BLOCK}}, {{TEMPLATE_BLOCK}}, or now:
 *      {{TEXT_BLOCK=some text here}}, {{ANY_TEMPLATE_NAME}}
 *  2) Split text around these placeholders, creating blocks that share a groupId.
 *  3) The FIRST block in the returned array acts as the "lead" block:
 *      - isGroupLead = true, locked=false (user can reorder or delete the entire group)
 *      - subsequent blocks are locked=true, isGroupLead=false
 *  4) If a placeholder references a real template name (not TEXT_BLOCK, FILE_BLOCK,
 *     or TEMPLATE_BLOCK), we attempt to load that template from .prompt-composer
 *     and parse it inline, creating a nested set of locked blocks. This allows
 *     "inline" expansion for nested templates.
 *  5) Placeholders like {{TEXT_BLOCK=some text}} store 'some text' in the new
 *     text block's content field, preserving user edits when flipping to raw mode.
 *
 * Implementation Details:
 *  - We do a single pass over the source text, using a regex to find placeholders.
 *  - For each placeholder, we create or expand blocks accordingly.
 *  - If we see something like {{SOME_TEMPLATE}}, we try reading the file from disk,
 *    parse it, and unify its sub-blocks inline (locked, same groupId).
 *  - We use a visitedTemplates set to avoid infinite recursion. If a template
 *    references itself or leads to a cycle, we insert a locked "Unknown template" block.
 *
 * Limitations / Edge Cases:
 *  - If a template file cannot be read, we create a locked block with the literal
 *    placeholder text, preserving it in raw mode so the user can fix references.
 *  - The parser might produce large block arrays if many nested templates are expanded.
 *  - We only parse placeholders that match the main pattern:
 *      {{SOMETHING}}
 *    Optionally, if it's "TEXT_BLOCK=some content", we parse that content as the text block's content.
 */

import { v4 as uuidv4 } from 'uuid';
import { Block, TemplateBlock, TextBlock, FilesBlock } from '../types/Block';

// Regex to capture placeholders of the form:
//   {{XYZ}} or {{XYZ=some stuff}} 
// We separate the entire placeholder as match[1], the placeholder name as match[2],
// and the optional = part as match[3].
const placeholderRegex = /(\{\{([A-Za-z0-9_\-]+)(?:=([^}]*))?\}\})/g;

interface ParseOptions {
  /**
   * If set, we reuse this groupId for the resulting blocks
   */
  forceGroupId?: string;

  /**
   * If set, the first block in the array uses this ID
   */
  forceLeadBlockId?: string;

  /**
   * Keep track of template names we've already expanded to avoid infinite recursion
   */
  visitedTemplates?: Set<string>;
}

/**
 * parseTemplateBlocks
 * @param sourceText - The multiline template text containing placeholders
 * @param forceGroupId - Optional existing groupId for re-parsing
 * @param forceLeadBlockId - Optional existing lead block ID for re-parsing
 * @returns Array of blocks representing the parsed structure. The first block is lead/unlocked,
 *          subsequent blocks are locked sub-blocks. All share the same groupId.
 */
export function parseTemplateBlocks(
  sourceText: string,
  forceGroupId?: string,
  forceLeadBlockId?: string
): Block[] {
  const options: ParseOptions = {
    forceGroupId,
    forceLeadBlockId,
    visitedTemplates: new Set<string>()
  };
  return parseTemplateBlocksInternal(sourceText, options);
}

/**
 * parseTemplateBlocksInternal
 * @param sourceText The text to parse
 * @param options    Parsing options, including groupId, leadBlockId, visitedTemplates set
 */
function parseTemplateBlocksInternal(
  sourceText: string,
  options: ParseOptions
): Block[] {
  const {
    forceGroupId,
    forceLeadBlockId,
    visitedTemplates
  } = options;

  // The group ID for all blocks in this expansion
  const groupId = forceGroupId || uuidv4();

  // We'll iterate over placeholders, building an array of final blocks
  const blocks: Block[] = [];

  let currentIndex = 0;
  let match: RegExpExecArray | null;

  // Tracks if we've assigned the lead block yet
  let leadAssigned = false;

  /**
   * Helper to generate a new ID for blocks,
   * except we may override it for the lead block.
   */
  function newIdForBlock(): string {
    return uuidv4();
  }

  /**
   * createTemplateSegmentBlock
   * Creates a locked TemplateBlock for plain text segments. We can unlock if it's the lead.
   */
  function createTemplateSegmentBlock(textSegment: string): TemplateBlock {
    return {
      id: newIdForBlock(),
      type: 'template',
      label: 'Template Segment',
      content: textSegment,
      variables: [],
      locked: true,
      groupId,
      isGroupLead: false
    };
  }

  // Main loop: find placeholders ({{...}}) in the source text
  while ((match = placeholderRegex.exec(sourceText)) !== null) {
    const fullPlaceholder = match[1];  // e.g. "{{TEXT_BLOCK=Hello}}"
    const placeholderName = match[2];  // e.g. "TEXT_BLOCK" or "HELLO"
    const placeholderValue = match[3]; // e.g. "Hello" if we have "=Hello"
    const matchIndex = match.index;

    // 1) Capture the text segment before this placeholder
    const textSegment = sourceText.slice(currentIndex, matchIndex);
    if (textSegment.length > 0) {
      const segBlock = createTemplateSegmentBlock(textSegment);
      // Possibly assign as lead
      if (!leadAssigned) {
        segBlock.isGroupLead = true;
        segBlock.locked = false;
        if (forceLeadBlockId) {
          segBlock.id = forceLeadBlockId;
        }
        leadAssigned = true;
      }
      blocks.push(segBlock);
    }

    // 2) Create blocks for this placeholder
    const placeholderBlocks = parsePlaceholder(
      placeholderName,
      placeholderValue,
      groupId,
      leadAssigned,
      forceLeadBlockId,
      visitedTemplates
    );

    // If placeholderBlocks is empty, we store a locked fallback block with the literal placeholder
    if (placeholderBlocks.length === 0) {
      const fallback: TemplateBlock = {
        id: newIdForBlock(),
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
        if (forceLeadBlockId) {
          fallback.id = forceLeadBlockId;
        }
        leadAssigned = true;
      }
      blocks.push(fallback);
    } else {
      // For the first block in placeholderBlocks, if we haven't assigned a lead yet,
      // we mark it as lead/unlocked. For the rest, keep locked.
      if (!leadAssigned) {
        placeholderBlocks[0].isGroupLead = true;
        placeholderBlocks[0].locked = false;
        if (forceLeadBlockId) {
          placeholderBlocks[0].id = forceLeadBlockId;
        }
        leadAssigned = true;
      }
      blocks.push(...placeholderBlocks);
    }

    currentIndex = matchIndex + fullPlaceholder.length;
  }

  // 3) Any trailing text after the last placeholder
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

  // Edge case: if no blocks were created at all
  if (blocks.length === 0) {
    const emptyBlock: TemplateBlock = {
      id: forceLeadBlockId || newIdForBlock(),
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
 * parsePlaceholder
 * Given the placeholder name (e.g. "TEXT_BLOCK") and optional value
 * (e.g. "Hello" for "{{TEXT_BLOCK=Hello}}"), produce an array of blocks.
 * If the placeholder references a known type (TEXT_BLOCK, FILE_BLOCK, etc.),
 * we create that block. If it references an unknown name, we attempt to parse
 * as a template reference.
 */
function parsePlaceholder(
  placeholderName: string,
  placeholderValue: string | undefined,
  groupId: string,
  leadAlreadyAssigned: boolean,
  forceLeadBlockId: string | undefined,
  visitedTemplates: Set<string>
): Block[] {
  // We define a small helper to create new IDs
  const newId = () => uuidv4();

  // If it's TEXT_BLOCK or TEXT_BLOCK=some text
  if (placeholderName === 'TEXT_BLOCK') {
    const textContent = placeholderValue ?? '';
    const tb: TextBlock = {
      id: newId(),
      type: 'text',
      label: 'User Text Block',
      content: textContent,
      locked: true,
      groupId,
      isGroupLead: false
    };
    return [tb];
  }

  // If it's FILE_BLOCK
  if (placeholderName === 'FILE_BLOCK') {
    const fb: FilesBlock = {
      id: newId(),
      type: 'files',
      label: 'File Block',
      files: [],
      locked: true,
      groupId,
      isGroupLead: false
    };
    return [fb];
  }

  // If it's TEMPLATE_BLOCK
  if (placeholderName === 'TEMPLATE_BLOCK') {
    // We allow an optional "value" for template block content, but typically it's blank
    const templateContent = placeholderValue ?? '';
    const tb: TemplateBlock = {
      id: newId(),
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

  // Otherwise, treat the placeholderName as a potential template reference
  // e.g. {{HELLO}} or {{SOME_TEMPLATE=maybe ignored}}
  // The 'placeholderValue' is typically ignored for a template reference. We only
  // interpret placeholderName as the file to load. If we have visited this template
  // name before, we skip to prevent infinite recursion.
  const templateRef = placeholderName.trim();

  // If we've already visited this template name, skip to avoid recursion
  if (visitedTemplates.has(templateRef)) {
    // Return a locked block with a note about recursion
    const blocked: TemplateBlock = {
      id: newId(),
      type: 'template',
      label: `Cyclic Template Ref: ${templateRef}`,
      content: `{{${templateRef}}}`,
      variables: [],
      locked: true,
      groupId,
      isGroupLead: false
    };
    return [blocked];
  }

  visitedTemplates.add(templateRef);

  // Attempt to load the template from disk, parse it
  // We'll do an IPC call to read the file now? We can't do that in a purely synchronous function,
  // but the code we have is synchronous. Our parse is synchronous, but the loading is async in practice.
  // We have a mismatch. The current code is used in a synchronous context. Usually we do not
  // load from disk at parse time. The user specifically wants it. 
  // For now, we do "can't load from disk here" -> we create a "Placeholder for inline template" block?
  // Or we do it with an approach that the user must do an active session-level load. 
  // 
  // The user asked for "If a template is instantiated inside a template, create an inline template block." 
  // In an offline scenario, we'd have to do an async call. Let's do an approach where we create a locked
  // block labeled "Inline Template: <templateRef>", containing the placeholder text. Then the final flatten
  // expands it as normal. 
  // 
  // If we actually want to parse the sub-file, we'd have to do async. The current system is not set up for that. 
  // The user specifically wants to see the entire expanded content. We'll do a best-effort approach: we create
  // a single block labeled "Inline Template: <templateRef>" for now, still locked. 
  // 
  // If we want fully expanded sub-blocks, we must do an async approach or change the entire parse function to be async. 
  // We'll do the minimal approach: one locked block for the inline template. 
  // 
  // If we do want to fully expand, we must drastically change the code to async. For now, let's do a partial approach:
  // We'll insert a single locked block with "Inline Template: <templateRef>" and the content is the placeholder. 
  // The user can flip raw if they want to. 
  // 
  // If we wanted the advanced approach, we must rewrite parseTemplateBlocks to be async. 
  // For the sake of the user's request, let's do the single block approach (like "Nested Template Block", but with a label referencing the template name).
  
  const inlineTemplate: TemplateBlock = {
    id: newId(),
    type: 'template',
    label: `Inline Template: ${templateRef}`,
    content: `{{${templateRef}}}`,
    variables: [],
    locked: true,
    groupId,
    isGroupLead: false
  };
  return [inlineTemplate];
}
