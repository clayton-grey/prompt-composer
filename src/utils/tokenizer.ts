/**
 * @file tokenizer.ts
 * @description Simple token estimation functions as fallback solution
 */

// Track initialization state
let initialized = false;

// Store the current model name
let currentModel = 'gpt-4o';

/**
 * Initialize the token estimator
 */
export function initEncoder(model: string = 'gpt-4o'): void {
  initialized = true;
  currentModel = model;
  console.log('[tokenizer] Initializing simple token estimator for model:', model);
}

/**
 * Simple token estimation using character count
 * Now accepts a model parameter for compatibility with tokenEstimator.ts
 */
export function estimateTokens(text: string, model?: string): number {
  if (!initialized) {
    initEncoder(model || currentModel);
  }
  
  if (!text) return 0;
  
  // Use the provided model or fallback to the initialized one
  const modelToUse = model || currentModel;
  
  // Get a character count
  const charCount = text.length;
  
  // Determine if text contains code blocks
  const hasCode = text.includes('```');
  
  // Calculate more accurate divisor based on model and content type
  let divisor = 3.8; // Base divisor for GPT-4o plain text
  
  if (modelToUse === 'gpt-4o') {
    // GPT-4o specific adjustments
    if (hasCode) {
      // Code content is more token-efficient
      divisor = text.includes('typescript') || text.includes('javascript') ? 4.7 : 4.5;
    } else if (text.includes('<file_map>') || text.includes('<file_contents>')) {
      // File content with markup tends to be less efficient
      divisor = 3.55;
    }
  } else if (modelToUse.startsWith('gpt-4')) {
    // Other GPT-4 models
    divisor = hasCode ? 4.5 : 3.9;
  } else {
    // GPT-3.5 and others
    divisor = hasCode ? 4.2 : 3.7;
  }
  
  // Apply bias adjustment - OpenAI's counter tends to be higher for GPT-4o
  let tokenCount = Math.ceil(charCount / divisor);
  
  if (modelToUse === 'gpt-4o') {
    // Apply correction factor to better match OpenAI's estimator for GPT-4o
    // Increased from 1.115 to 1.170 to match observed ratio more closely
    tokenCount = Math.ceil(tokenCount * 1.170);
  }
  
  console.log(`[tokenizer] Model: ${modelToUse}, Chars: ${charCount}, Divisor: ${divisor.toFixed(2)}, Raw estimate: ${Math.ceil(charCount / divisor)}, Final tokens: ${tokenCount}`);
  
  return tokenCount;
} 