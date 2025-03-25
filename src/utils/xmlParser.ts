
/**
 * @file xmlParser.ts
 * @description
 * Provides functions to export the current prompt data (settings + blocks) into an XML
 * string, and (in Step 15) parse them back. For Step 14, we implement export functionality:
 *
 * - exportToXML: Serialize the prompt data into an XML string
 * - Avoid nested CDATA issues by dynamically building using string concatenation
 *
 * Example XML Output:
 *    <promptComposer version="1.0">
 *      <settings>
 *        <maxTokens>8000</maxTokens>
 *        <model>gpt-4</model>
 *      </settings>
 *      <blocks>
 *        <block id="intro" type="text" label="Introduction">
 *          <content>Please review the following files.</content>
 *        </block>
 *        ...
 *      </blocks>
 *    </promptComposer>
 *
 * @notes
 *  - We insert file content in CDATA blocks so that code is preserved verbatim.
 *  - We carefully avoid literal '\]\]\>'' in the code snippet to prevent nested CDATA issues
 *    in the patch XML. We do so by constructing the string via '<!' + '[CDATA[' + ... + ']]' + '>'.
 */

import { Block, FilesBlock, TemplateBlock, TextBlock } from '../types/Block';

/**
 * A convenience interface for the data we want to serialize.
 */
export interface PromptDataForXML {
  version: string;
  settings: {
    maxTokens: number;
    model: string;
  };
  blocks: Block[];
}

/**
 * Helper to escape XML entities (less than, greater than, ampersand, quotes).
 */
function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * exportToXML
 * @param data PromptDataForXML
 * @returns string (XML)
 *
 * Serializes the given data into an XML string matching our project's specification.
 * For text/template blocks, we just wrap content in <content>...</content>.
 * For files block, we place each file's content in a CDATA section dynamically constructed
 * to avoid nested CDATA within the patch file.
 */
export function exportToXML(data: PromptDataForXML): string {
  const { version, settings, blocks } = data;

  // Build the <settings> section
  const settingsXml = `
    <settings>
      <maxTokens>${settings.maxTokens}</maxTokens>
      <model>${escapeXml(settings.model)}</model>
    </settings>
  `.trim();

  // Build the <blocks> section
  const blocksXml = blocks
    .map((block) => {
      const baseAttrs = `id="${escapeXml(block.id)}" type="${block.type}" label="${escapeXml(
        block.label
      )}"`;

      if (block.type === 'text') {
        const textBlock = block as TextBlock;
        const contentXml = `<content>${escapeXml(textBlock.content)}</content>`;
        return `
      <block ${baseAttrs}>
        ${contentXml}
      </block>
    `.trim();
      } else if (block.type === 'template') {
        const templateBlock = block as TemplateBlock;
        const contentXml = `<content>${escapeXml(templateBlock.content)}</content>`;
        const varsXml = templateBlock.variables
          .map((v) => {
            return `<variable name="${escapeXml(v.name)}" default="${escapeXml(
              v.default
            )}" />`;
          })
          .join('');

        return `
      <block ${baseAttrs}>
        ${contentXml}
        <variables>
          ${varsXml}
        </variables>
      </block>
    `.trim();
      } else {
        // files block
        const filesBlock = block as FilesBlock;
        const filesXml = filesBlock.files
          .map((f) => {
            // Construct the CDATA so we don't embed literal <![CDATA[ ... /]/]>
            // to avoid nested CDATA issues in the patch XML itself.
            const cdataOpen = '<!' + '[CDATA[';
            const cdataClose = ']]' + '>';
            const fileContentInCdata = `${cdataOpen}
${f.content}
${cdataClose}`;

            return `
          <file path="${escapeXml(f.path)}" language="${escapeXml(
              f.language
            )}">
            ${fileContentInCdata}
          </file>
        `.trim();
          })
          .join('');

        return `
      <block ${baseAttrs}>
        <files>
          ${filesXml}
        </files>
      </block>
    `.trim();
      }
    })
    .join('');

  const finalXml = `
<promptComposer version="${escapeXml(version)}">
  ${settingsXml}
  <blocks>
    ${blocksXml}
  </blocks>
</promptComposer>
`.trim();

  return finalXml;
}
