
/**
 * @file TopBar.tsx
 * @description
 * A simple top bar for the Prompt Composer that includes:
 *  - Copy Prompt button
 *  - Export XML button
 * 
 * Step 14: "Export XML" Implementation
 * - On click, we call exportToXML and then window.electronAPI.exportXml
 */

import React from 'react';
import { usePrompt } from '../context/PromptContext';
import { exportToXML } from '../utils/xmlParser';

const TopBar: React.FC = () => {
  const { getFlattenedPrompt, blocks, settings } = usePrompt();

  const handleCopy = async () => {
    try {
      const promptString = getFlattenedPrompt();
      await navigator.clipboard.writeText(promptString);
      console.log('[TopBar] Prompt copied to clipboard!');
    } catch (err) {
      console.error('[TopBar] Failed to copy prompt:', err);
    }
  };

  /**
   * Exports the entire composition (blocks, settings) to an XML file
   */
  const handleExportXML = async () => {
    try {
      // Build the data structure for export
      const data = {
        version: '1.0',
        settings: {
          maxTokens: settings.maxTokens,
          model: settings.model
        },
        blocks
      };

      const xmlString = exportToXML(data);

      // Attempt to export using the electronAPI
      const defaultFileName = 'prompt_composition.xml';
      const result = await window.electronAPI.exportXml({
        defaultFileName,
        xmlContent: xmlString
      });

      if (result) {
        console.log('[TopBar] Successfully exported XML file.');
      } else {
        console.log('[TopBar] User canceled XML export or an error occurred.');
      }
    } catch (err) {
      console.error('[TopBar] Failed to export XML:', err);
    }
  };

  return (
    <header className="w-full h-14 bg-white dark:bg-gray-800 flex items-center px-4 shadow">
      <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
        Prompt Composer
      </h1>

      <div className="ml-auto flex items-center gap-3">
        <button
          onClick={handleCopy}
          className="px-3 py-1 text-sm rounded bg-blue-500 hover:bg-blue-600 text-white"
        >
          Copy Prompt
        </button>

        {/* Export XML Button */}
        <button
          onClick={handleExportXML}
          className="px-3 py-1 text-sm rounded bg-purple-500 hover:bg-purple-600 text-white"
        >
          Export XML
        </button>
      </div>
    </header>
  );
};

export default TopBar;
