/**
 * @file Block.ts
 * @description
 * Defines the TypeScript interfaces for different kinds of prompt blocks:
 * TextBlock, TemplateBlock, and FilesBlock. Each block includes a type,
 * label, and other properties. This file also exports a union type "Block"
 * that can represent any of these three block types. 
 *
 * Key Interfaces:
 *  - BaseBlock: Common fields for all blocks
 *  - TextBlock: Simple text block
 *  - TemplateBlock: Text content with variable placeholders
 *  - FilesBlock: Embeds multiple files
 *  - Block: Union type of all block variants
 *
 * @notes
 *  - Additional fields or block types can be added in the future as needed.
 *  - Make sure to keep the block "type" property strictly typed so we can
 *    switch over it in the UI.
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
}

/**
 * Represents a freeform text block with multiline content.
 */
export interface TextBlock extends BaseBlock {
  type: 'text';

  /**
   * The textual content entered by the user.
   */
  content: string;
}

/**
 * Represents a block containing a text template with placeholder variables.
 */
export interface TemplateBlock extends BaseBlock {
  type: 'template';

  /**
   * The template content, possibly containing placeholders like {{variableName}}.
   */
  content: string;

  /**
   * Variables used in this template block, each with a default value.
   */
  variables: Array<{
    name: string;
    default: string;
  }>;
}

/**
 * Represents a block that includes one or more files, embedding their content.
 */
export interface FilesBlock extends BaseBlock {
  type: 'files';

  files: Array<{
    /**
     * The path to the file on disk.
     */
    path: string;

    /**
     * The contents of the file (loaded from disk).
     */
    content: string;

    /**
     * The file's language or format (e.g., 'python', 'javascript').
     * Mainly for syntax highlighting or referencing in the final output.
     */
    language: string;
  }>;
}

/**
 * Union type covering all possible block variants in the system.
 */
export type Block = TextBlock | TemplateBlock | FilesBlock;
