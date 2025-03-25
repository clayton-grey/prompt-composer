
/**
 * @file xmlParser.ts
 * @description
 * Provides functions to serialize and deserialize the Prompt Composer's data to/from XML.
 *
 * Key Exports:
 *  - exportToXML(data: any): string
 *  - importFromXML(xmlString: string): { version: string, settings: ..., blocks: Block[] }
 *
 * Implementation Details:
 *  - We use DOMParser in the renderer for parsing (browser-based).
 *  - For Node/Electron environment, we'd use a library, but here we assume the code runs in renderer context.
 *  - We handle blocks of type text/template/files. For file blocks, we parse <file> subnodes with CDATA.
 *  - If a block is 'template', we parse <variables> as well.
 *
 * @notes
 *  - In the future, we could add more robust error handling if the XML is invalid or missing required tags.
 */

import { Block, TextBlock, TemplateBlock, FilesBlock } from '../types/Block';

/**
 * exportToXML
 * @param data: { version: string, settings: { maxTokens, model }, blocks: Block[] }
 * @returns string of well-formed XML
 *
 * @example
 * const xmlString = exportToXML({
 *   version: '1.0',
 *   settings: { maxTokens: 8000, model: 'gpt-4' },
 *   blocks: [...]
 * });
 */
export function exportToXML(data: {
  version: string;
  settings: { maxTokens: number; model: string };
  blocks: Block[];
}): string {
  const { version, settings, blocks } = data;
  const { maxTokens, model } = settings;

  // Basic XML structure
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
          // Wrap the file content in CDATA
          xml += `<![CDATA[\n${fileObj.content}\n]/]>`;
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

/**
 * importFromXML
 * @param xmlString - The XML string representing a prompt composition
 * @returns { version: string, settings: { maxTokens, model }, blocks: Block[] }
 *
 * @example
 * const { version, settings, blocks } = importFromXML(xmlString);
 *
 * Implementation:
 *  1) Parse the <promptComposer> root, read version
 *  2) Extract <settings><maxTokens>, <model>
 *  3) Loop over <block> elements, read type, label, etc.
 *  4) For text blocks: read <content>
 *  5) For template blocks: read <content>, <variables><variable .../>
 *  6) For files blocks: read <files><file path="" language=""> <![CDATA[ ... ]/]></file>
 *  7) Return the structured data
 *
 * @notes
 *  - We assume well-formed XML. Minimal error checking is done.
 *  - If parse fails, we throw an error or return partial data. 
 *  - This function should be called by the renderer after openXml, to update the context state.
 */
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
          content
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
          variables
        };
        blocks.push(templateBlock);
        break;
      }
      case 'files': {
        const filesBlock: FilesBlock = {
          id,
          type: 'files',
          label,
          files: []
        };
        const filesEl = blockEl.querySelector('files');
        if (filesEl) {
          const fileEls = Array.from(filesEl.querySelectorAll('file'));
          for (const fEl of fileEls) {
            const filePath = fEl.getAttribute('path') || '';
            const language = fEl.getAttribute('language') || 'plaintext';

            // The file content is stored in the textContent, inside a CDATA block
            const cdataContent = fEl.textContent || '';
            // We do not do fancy unescaping for now, as it's within CDATA
            // But we can strip leading/trailing newlines if desired:
            const fileContent = cdataContent.replace(/^\n/, '').replace(/\n$/, '');

            filesBlock.files.push({
              path: unescapeXml(filePath),
              content: fileContent,
              language: unescapeXml(language)
            });
          }
        }
        blocks.push(filesBlock);
        break;
      }
      default:
        // Unknown block type. We could skip or throw. Let's skip for safety.
        console.warn(`[importFromXML] Skipping unknown block type: ${type}`);
        break;
    }
  }

  return {
    version,
    settings: { maxTokens, model },
    blocks
  };
}

/**
 * escapeXml - Minimal XML entity escaping for attribute/element text
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * unescapeXml - Reverse of escapeXml
 */
function unescapeXml(str: string): string {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}
