/**
 * @file Block.ts
 * @description
 * Defines the TypeScript interfaces for different kinds of prompt blocks: TextBlock,
 * TemplateBlock, FilesBlock, and now PromptResponseBlock. Each block includes a type,
 * label, and other properties. This file also exports a union type "Block" that can
 * represent any of these block types.
 *
 * Step 4 Changes:
 *  - Added `PromptResponseBlock` interface to handle the {{PROMPT_RESPONSE=filename.txt}} tag.
 *  - This block type is loaded from and saved to a .prompt-composer file.
 *  - It remains locked during the main template raw edit, but has its own inline editor.
 */

export interface BaseBlock {
  /**
   * A unique identifier for this block within the composition.
   */
  id: string;

  /**
   * The type of block (text, template, files, or promptResponse).
   */
  type: 'text' | 'template' | 'files' | 'promptResponse';

  /**
   * A short label for the block to display in the UI.
   */
  label: string;

  /**
   * Indicates whether this block is locked (cannot be edited in the main raw template).
   */
  locked?: boolean;

  /**
   * If multiple blocks are meant to move together, they share a groupId.
   */
  groupId?: string;

  /**
   * Indicates that this block is the "lead" block in its group. Only the lead block
   * can do raw edit or major group operations.
   */
  isGroupLead?: boolean;

  /**
   * If true, this block is currently "raw editing" the entire template group.
   * Only relevant for the lead block in a group of type 'template'.
   */
  editingRaw?: boolean;
}

/**
 * Represents a freeform text block with multiline content.
 */
export interface TextBlock extends BaseBlock {
  type: 'text';
  content: string;
}

/**
 * Represents a block containing a text template with variable placeholders.
 */
export interface TemplateBlock extends BaseBlock {
  type: 'template';
  content: string;
  variables: Array<{
    name: string;
    default: string;
  }>;
}

/**
 * Represents a block that includes one or more files, embedding their content.
 * Also optionally includes a project ASCII map if `includeProjectMap` is true.
 */
export interface FilesBlock extends BaseBlock {
  type: 'files';
  files: Array<{
    path: string;
    content: string;
    language: string;
  }>;
  projectAsciiMap?: string;
  includeProjectMap?: boolean;
}

/**
 * Represents a prompt response block that is loaded from and saved to a specific file
 * in the project's .prompt-composer folder. The content is locked from main raw editing,
 * but the user can edit it directly in its own text area.
 */
export interface PromptResponseBlock extends BaseBlock {
  type: 'promptResponse';
  /**
   * The file name in .prompt-composer. e.g. "myPromptResponse.txt"
   */
  sourceFile: string;

  /**
   * The current content loaded from that file.
   * This is updated as the user types, and we persist changes back to that file.
   */
  content: string;
}

/**
 * A union type covering all possible block variants in the system.
 */
export type Block = TextBlock | TemplateBlock | FilesBlock | PromptResponseBlock;
