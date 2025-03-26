/**
 * @file tokenEstimator.ts
 * @description
 * Token estimation functions using the tiktoken library for accurate token counts.
 * Tiktoken is the same tokenizer used by OpenAI models.
 */

import { encoding_for_model, TiktokenModel } from '@dqbd/tiktoken';

// Cache the encoder instances for different encodings
const encoderCache = new Map();

// Valid encoding names according to TiktokenModel type
const VALID_ENCODINGS = {
  'cl100k_base': 'cl100k_base' as TiktokenModel,
  'p50k_base': 'p50k_base' as TiktokenModel,
  'r50k_base': 'r50k_base' as TiktokenModel
} as const;

// Map of model name prefixes to their encoding
const MODEL_ENCODINGS: Record<string, TiktokenModel> = {
  'gpt-4o': VALID_ENCODINGS.cl100k_base,
  'gpt-4-turbo': VALID_ENCODINGS.cl100k_base, 
  'gpt-4': VALID_ENCODINGS.cl100k_base,
  'gpt-3.5-turbo': VALID_ENCODINGS.cl100k_base,
  'text-embedding': VALID_ENCODINGS.cl100k_base
};

// Default encoding for any model not explicitly mapped
const DEFAULT_ENCODING = VALID_ENCODINGS.cl100k_base;

/**
 * Initialize the token estimator for a specific model
 */
export function initEncoder(model: string = 'gpt-4o'): void {
  console.log('[tokenEstimator] Initializing encoder for model:', model);
  
  // Lazily initialize the encoder when it's actually needed
  // This avoids unnecessary initialization at startup
}

/**
 * Accurate token estimation using the tiktoken library
 */
export function estimateTokens(text: string, model: string = 'gpt-4o'): number {
  if (!text) return 0;
  
  try {
    // Determine the encoding to use
    let encodingName = DEFAULT_ENCODING;
    
    // Find the right encoding based on model prefix
    for (const [prefix, encoding] of Object.entries(MODEL_ENCODINGS)) {
      if (model.startsWith(prefix)) {
        encodingName = encoding;
        break;
      }
    }
    
    // Get or create the encoder
    let encoder = encoderCache.get(encodingName);
    if (!encoder) {
      try {
        encoder = encoding_for_model(encodingName);
        encoderCache.set(encodingName, encoder);
      } catch (error) {
        console.error(`[tokenEstimator] Error creating encoder for ${encodingName}:`, error);
        return fallbackEstimateTokens(text, model);
      }
    }
    
    // Count tokens
    const tokens = encoder.encode(text);
    const tokenCount = tokens.length;
    
    // For GPT-4o specifically, apply a correction factor to match OpenAI's web interface
    if (model === 'gpt-4o') {
      return Math.ceil(tokenCount * 1.170);
    }
    
    return tokenCount;
  } catch (error) {
    console.error('[tokenEstimator] Error estimating tokens:', error);
    return fallbackEstimateTokens(text, model);
  }
}

/**
 * Fallback token estimation when tiktoken fails
 * This implementation closely matches OpenAI's average token/character ratio
 */
function fallbackEstimateTokens(text: string, model: string = 'gpt-4o'): number {
  if (!text) return 0;
  
  // Get a character count
  const charCount = text.length;
  
  // Determine if text contains code blocks
  const hasCode = text.includes('```');
  
  // Calculate more accurate divisor based on model and content type
  let divisor = 3.8; // Base divisor for GPT-4o plain text
  
  if (model === 'gpt-4o') {
    // GPT-4o specific adjustments
    if (hasCode) {
      // Code content is more token-efficient
      divisor = text.includes('typescript') || text.includes('javascript') ? 4.7 : 4.5;
    } else if (text.includes('<file_map>') || text.includes('<file_contents>')) {
      // File content with markup tends to be less efficient
      divisor = 3.55;
    }
  } else if (model.startsWith('gpt-4')) {
    // Other GPT-4 models
    divisor = hasCode ? 4.5 : 3.9;
  } else {
    // GPT-3.5 and others
    divisor = hasCode ? 4.2 : 3.7;
  }
  
  // Calculate token count
  let tokenCount = Math.ceil(charCount / divisor);
  
  // Apply correction factor for GPT-4o to match OpenAI's web interface
  if (model === 'gpt-4o') {
    tokenCount = Math.ceil(tokenCount * 1.170);
  }
  
  console.log(`[tokenEstimator-fallback] Model: ${model}, Chars: ${charCount}, Divisor: ${divisor.toFixed(2)}, Final tokens: ${tokenCount}`);
  
  return tokenCount;
}
