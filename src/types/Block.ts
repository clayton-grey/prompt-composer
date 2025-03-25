
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
 *  - FilesBlock: Embeds multiple files + optional project ASCII map
 *  - Block: Union type of all block variants
 *
 * @notes
 *  - We've added an optional `projectAsciiMap` to FilesBlock so we can
 *    include the entire project file map at the start of the block
 *    when flattening the prompt.
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
 * We also optionally store a "projectAsciiMap" string so we can include an
 * ASCII representation of the entire project file structure at the start
 * of this block when flattening.
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

  /**
   * Optional ASCII file map to be included at the start of this files block
   * when the user copies or exports the final prompt.
   *
   * e.g.,
   * <file_map>
   * /Users/youruser/project
   * ├── src
   * │   └── index.js
   * └── package.json
   * </file_map>
   */
  projectAsciiMap?: string;
}

/**
 * Union type covering all possible block variants in the system.
 */
export type Block = TextBlock | TemplateBlock | FilesBlock;
