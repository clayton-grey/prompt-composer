
/**
 * @file Block.ts
 * @description
 * Defines the TypeScript interfaces for different kinds of prompt blocks:
 * TextBlock, TemplateBlock, and FilesBlock. Each block includes a type,
 * label, and other properties. This file also exports a union type "Block"
 * that can represent any of these block types.
 *
 * New additions (to support grouping as a single immutable unit):
 *  - groupId?: string  => An identifier that all blocks in a "group" share.
 *  - isGroupLead?: boolean => True if this block is the "lead" of its group,
 *    i.e., the one with reorder/delete controls.
 *
 * The idea: a set of blocks can belong to the same groupId, but only the "lead"
 * block shows reorder/delete UI. The entire set moves or deletes as one chunk.
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
