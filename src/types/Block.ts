
/**
 * @file Block.ts
 * @description
 * Defines the TypeScript interfaces for different kinds of prompt blocks:
 * TextBlock, TemplateBlock, and FilesBlock. Each block includes a type,
 * label, and other properties. This file also exports a union type "Block"
 * that can represent any of these block types.
 *
 * This update adds "editingRaw?: boolean" to handle the scenario where the
 * lead TemplateBlock is in "raw edit mode," so we can hide child blocks
 * while the user is editing raw template text.
 */

export interface BaseBlock {
  /**
   * A unique identifier for this block within the composition.
   */
  id: string;

  /**
   * The type of block (text, template, files).
   */
  type: 'text' | 'template' | 'files';

  /**
   * A short label for the block to display in the UI.
   */
  label: string;

  /**
   * Indicates whether this block is locked (cannot be individually
   * reordered or removed).
   */
  locked?: boolean;

  /**
   * If multiple blocks are meant to move together, they share a groupId.
   */
  groupId?: string;

  /**
   * Indicates that this block is the "lead" block in its group. The lead block
   * is the one that has reorder/delete buttons for the entire group.
   */
  isGroupLead?: boolean;

  /**
   * If true, this block is currently "raw editing" the entire template group.
   * Only makes sense on the lead block for a template group. Child blocks
   * should remain hidden if the lead is editingRaw. This is ephemeral/in-memory.
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
 * Union type covering all possible block variants in the system.
 */
export type Block = TextBlock | TemplateBlock | FilesBlock;
