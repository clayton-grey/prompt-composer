/**
 * @file xmlParser.ts
 * @description
 * Provides functions to serialize and deserialize the Prompt Composer's data to/from XML.
 * Also includes new logic (importAndValidateFromXML) to handle missing or invalid file references
 * during XML import.
 *
 * Key Exports:
 *  - exportToXML(data): string
 *  - importFromXML(xmlString): { version, settings, blocks }
 *  - importAndValidateFromXML(xmlString): Promise<{ version, settings, blocks }>
 *
 * Implementation for Validation:
 *  - After parsing the XML, we iterate over any <files> blocks.
 *  - For each file path, we invoke window.electronAPI.verifyFileExistence(path).
 *  - If the file does not exist, we skip it and log a warning.
 *  - If all files in a block are invalid, that block ends up with an empty files array.
 *  - We return the final set of blocks, ensuring the system does not crash or keep invalid paths.
 */

import { Block, TextBlock, TemplateBlock, FilesBlock } from '../types/Block';

// Existing importFromXML, used internally:
export function importFromXML(xmlString: string): {
  version: string;
  settings: { maxTokens: number; model: string };
  blocks: Block[];
} {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'text/xml');

  const promptComposerEl = doc.querySelector('promptComposer');
  if (!promptComposerEl) {
    throw new Error('Invalid XML: missing <promptComposer> root element.');
  }

  const version = promptComposerEl.getAttribute('version') || '1.0';

  // Parse <settings>
  const settingsEl = doc.querySelector('promptComposer > settings');
  if (!settingsEl) {
    throw new Error('Invalid XML: missing <settings> element.');
  }
  const maxTokensEl = settingsEl.querySelector('maxTokens');
  const modelEl = settingsEl.querySelector('model');
  if (!maxTokensEl || !modelEl) {
    throw new Error('Invalid XML: missing <maxTokens> or <model> in <settings>.');
  }
  const maxTokens = parseInt(maxTokensEl.textContent || '8000', 10);
  const model = modelEl.textContent || 'gpt-4';

  // Parse <blocks>
  const blocksEl = doc.querySelector('promptComposer > blocks');
  if (!blocksEl) {
    throw new Error('Invalid XML: missing <blocks> element.');
  }

  const blockEls = Array.from(blocksEl.querySelectorAll('block'));
  const blocks: Block[] = [];

  for (const blockEl of blockEls) {
    const id = blockEl.getAttribute('id') || '';
    const type = blockEl.getAttribute('type') as 'text' | 'template' | 'files';
    const label = unescapeXml(blockEl.getAttribute('label') || 'Untitled');

    switch (type) {
      case 'text': {
        const contentEl = blockEl.querySelector('content');
        const content = contentEl ? unescapeXml(contentEl.textContent || '') : '';
        const textBlock: TextBlock = {
          id,
          type: 'text',
          label,
          content,
        };
        blocks.push(textBlock);
        break;
      }
      case 'template': {
        const contentEl = blockEl.querySelector('content');
        const content = contentEl ? unescapeXml(contentEl.textContent || '') : '';

        // Parse variables
        const variables: Array<{ name: string; default: string }> = [];
        const variablesEl = blockEl.querySelector('variables');
        if (variablesEl) {
          const variableEls = Array.from(variablesEl.querySelectorAll('variable'));
          for (const vEl of variableEls) {
            const varName = vEl.getAttribute('name') || '';
            const varDefault = vEl.getAttribute('default') || '';
            variables.push({ name: unescapeXml(varName), default: unescapeXml(varDefault) });
          }
        }

        const templateBlock: TemplateBlock = {
          id,
          type: 'template',
          label,
          content,
          variables,
        };
        blocks.push(templateBlock);
        break;
      }
      case 'files': {
        const filesBlock: FilesBlock = {
          id,
          type: 'files',
          label,
          files: [],
        };
        const filesEl = blockEl.querySelector('files');
        if (filesEl) {
          const fileEls = Array.from(filesEl.querySelectorAll('file'));
          for (const fEl of fileEls) {
            const filePath = fEl.getAttribute('path') || '';
            const language = fEl.getAttribute('language') || 'plaintext';
            const cdataContent = fEl.textContent || '';
            // Remove leading/trailing newlines from CDATA
            const fileContent = cdataContent.replace(/^\n/, '').replace(/\n$/, '');

            filesBlock.files.push({
              path: unescapeXml(filePath),
              content: fileContent,
              language: unescapeXml(language),
            });
          }
        }
        blocks.push(filesBlock);
        break;
      }
      default:
        console.warn(`[importFromXML] Skipping unknown block type: ${type}`);
        break;
    }
  }

  return {
    version,
    settings: { maxTokens, model },
    blocks,
  };
}

/**
 * importAndValidateFromXML
 * @description
 * An async wrapper around importFromXML that verifies each file path in <files> blocks
 * actually exists on the local file system. Invalid references are removed or skipped.
 *
 * @param xmlString - The raw XML content
 * @returns a Promise resolving to { version, settings, blocks }, but with
 *          invalid file references removed from the 'blocks'.
 */
export async function importAndValidateFromXML(xmlString: string): Promise<{
  version: string;
  settings: { maxTokens: number; model: string };
  blocks: Block[];
}> {
  // 1) Parse the XML normally
  const data = importFromXML(xmlString);

  // 2) For each "files" block, check file existence
  if (!window.electronAPI?.verifyFileExistence) {
    console.warn(
      '[importAndValidateFromXML] No electronAPI.verifyFileExistence found. Skipping path validation.'
    );
    return data;
  }

  // Because we must do async checks, we iterate over the blocks
  for (const blk of data.blocks) {
    if (blk.type === 'files') {
      const filesBlock = blk as FilesBlock;
      const validFiles = [];
      for (const fObj of filesBlock.files) {
        const doesExist = await window.electronAPI.verifyFileExistence(fObj.path);
        if (doesExist) {
          validFiles.push(fObj);
        } else {
          console.warn(`[importAndValidateFromXML] File does not exist: ${fObj.path}. Skipping.`);
        }
      }
      filesBlock.files = validFiles;
    }
  }

  return data;
}

/**
 * exportToXML
 * @param data: { version, settings, blocks }
 * @returns string of well-formed XML
 */
export function exportToXML(data: {
  version: string;
  settings: { maxTokens: number; model: string };
  blocks: Block[];
}): string {
  const { version, settings, blocks } = data;
  const { maxTokens, model } = settings;

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<promptComposer version="${version}">\n`;
  xml += `  <settings>\n`;
  xml += `    <maxTokens>${maxTokens}</maxTokens>\n`;
  xml += `    <model>${model}</model>\n`;
  xml += `  </settings>\n`;
  xml += `  <blocks>\n`;

  for (const block of blocks) {
    xml += `    <block id="${block.id}" type="${block.type}" label="${escapeXml(block.label)}">\n`;

    if (block.type === 'text') {
      const b = block as TextBlock;
      xml += `      <content>${escapeXml(b.content)}</content>\n`;
    } else if (block.type === 'template') {
      const b = block as TemplateBlock;
      xml += `      <content>${escapeXml(b.content)}</content>\n`;
      if (b.variables && b.variables.length > 0) {
        xml += `      <variables>\n`;
        for (const v of b.variables) {
          xml += `        <variable name="${escapeXml(v.name)}" default="${escapeXml(v.default)}" />\n`;
        }
        xml += `      </variables>\n`;
      }
    } else if (block.type === 'files') {
      const b = block as FilesBlock;
      if (b.files && b.files.length > 0) {
        xml += `      <files>\n`;
        for (const fileObj of b.files) {
          xml += `        <file path="${escapeXml(fileObj.path)}" language="${escapeXml(fileObj.language)}">\n`;
          xml += `<![CDATA[\n${fileObj.content}\n]\]>`;
          xml += `\n        </file>\n`;
        }
        xml += `      </files>\n`;
      }
    }

    xml += `    </block>\n`;
  }

  xml += `  </blocks>\n</promptComposer>\n`;
  return xml;
}

/** Utility: escape XML entities in text content */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Utility: unescape XML entities */
function unescapeXml(str: string): string {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}
