/**
 * Unity Files Helper for Prompt Composer
 * Add this to your project to auto-detect Unity files with spaces
 * 
 * Usage: 
 * 1. Save this file in your project
 * 2. Import it in your app (main or preload)
 * 3. Call detectMissingMetaFiles() when refreshing your file tree
 */
  
const fs = require('fs');
const path = require('path');

/**
 * Detects Unity script files without .meta files and creates them
 * @param {string} projectDir - The Unity project directory to scan
 * @returns {Promise<Array>} - Array of fixed files
 */
async function detectMissingMetaFiles(projectDir) {
  // Check if this is a Unity project by looking for typical Unity folders
  const isUnityProject = fs.existsSync(path.join(projectDir, 'Assets')) || 
                         projectDir.includes('/Assets/');
  
  if (!isUnityProject) {
    console.log('[UnityHelper] Not a Unity project, skipping meta file check');
    return [];
  }
  
  console.log(`[UnityHelper] Checking for missing meta files in ${projectDir}`);
  
  // Find .cs files without meta files
  const results = [];
  const processDirectory = async (dirPath) => {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      
      if (entry.isDirectory()) {
        // Skip common directories that aren't relevant
        if (entry.name !== 'node_modules' && 
            entry.name !== '.git' && 
            entry.name !== 'Library') {
          await processDirectory(fullPath);
        }
      } else if (entry.name.endsWith('.cs') && !entry.name.endsWith('.meta')) {
        // Check if meta file exists
        const metaPath = `${fullPath}.meta`;
        if (!fs.existsSync(metaPath)) {
          console.log(`[UnityHelper] Found file without meta: ${fullPath}`);
          
          // Generate meta file with a random GUID
          const guid = generateGuid();
          const metaContent = `fileFormatVersion: 2
guid: ${guid}
MonoImporter:
  externalObjects: {}
  serializedVersion: 2
  defaultReferences: []
  executionOrder: 0
  icon: {instanceID: 0}
  userData: 
  assetBundleName: 
  assetBundleVariant: 
`;
          
          try {
            fs.writeFileSync(metaPath, metaContent);
            results.push({ script: fullPath, meta: metaPath, guid });
            console.log(`[UnityHelper] Created meta file: ${metaPath}`);
          } catch (err) {
            console.error(`[UnityHelper] Failed to create meta file: ${err.message}`);
          }
        }
      }
    }
  };
  
  await processDirectory(projectDir);
  return results;
}

/**
 * Generate a Unity-compatible GUID
 */
function generateGuid() {
  // Create a random 32-character hexadecimal string
  let result = '';
  const characters = '0123456789abcdef';
  for (let i = 0; i < 32; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

module.exports = {
  detectMissingMetaFiles
};
