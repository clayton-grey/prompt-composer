/**
 * @file tokenEstimator.ts
 * @description
 * Token estimation functions using the tiktoken library for accurate token counts.
 * Tiktoken is the same tokenizer used by OpenAI models.
 */

import { Tiktoken, encoding_for_model, TiktokenModel } from '@dqbd/tiktoken';

// Cache the encoder instances for different models
const encoderCache: Record<string, Tiktoken> = {};

// Map model names to encoding names
const MODEL_TO_ENCODING: Record<string, TiktokenModel> = {
  'gpt-3.5-turbo': 'cl100k_base',
  'gpt-4': 'cl100k_base',
  'gpt-4-turbo': 'cl100k_base',
  'text-embedding-ada-002': 'cl100k_base',
  // Note: gpt-4o is not included because it's not in the TiktokenModel type
  // We'll handle it in the getEncodingForModel function
};

// Default encoding to use
const DEFAULT_ENCODING: TiktokenModel = 'cl100k_base';

/**
 * Get the appropriate encoding name for a model
 */
function getEncodingForModel(model: string): TiktokenModel {
  // Check if the model is directly in our mapping
  if (model in MODEL_TO_ENCODING) {
    return MODEL_TO_ENCODING[model as keyof typeof MODEL_TO_ENCODING];
  }
  
  // For newer models like gpt-4o that aren't in the TiktokenModel type,
  // we use cl100k_base as recommended by OpenAI
  if (model.startsWith('gpt-4') || model.startsWith('gpt-3.5')) {
    return 'cl100k_base';
  }
  
  // Default fallback
  return DEFAULT_ENCODING;
}

/**
 * Initialize the token estimator for a specific model
 */
export function initEncoder(model: string = 'gpt-3.5-turbo'): void {
  console.log('[tokenEstimator] Initializing tiktoken encoder for model:', model);
  
  try {
    // Get the encoding name for this model
    const encodingName = getEncodingForModel(model);
    
    // Only create a new encoder if we don't already have one for this encoding
    if (!encoderCache[encodingName]) {
      const encoder = encoding_for_model(encodingName);
      encoderCache[encodingName] = encoder;
      console.log(`[tokenEstimator] Created new encoder for ${encodingName}`);
    } else {
      console.log(`[tokenEstimator] Using cached encoder for ${encodingName}`);
    }
  } catch (error) {
    console.error('[tokenEstimator] Error initializing encoder:', error);
  }
}

/**
 * Get the appropriate encoder for a model
 */
function getEncoder(model: string = 'gpt-3.5-turbo'): Tiktoken | null {
  const encodingName = getEncodingForModel(model);
  
  if (!encoderCache[encodingName]) {
    try {
      initEncoder(model);
    } catch (error) {
      console.error('[tokenEstimator] Failed to initialize encoder:', error);
      return null;
    }
  }
  
  return encoderCache[encodingName] || null;
}

/**
 * Accurate token estimation using tiktoken
 */
export function estimateTokens(text: string, model: string = 'gpt-3.5-turbo'): number {
  if (!text) return 0;
  
  try {
    const encoder = getEncoder(model);
    
    if (!encoder) {
      // Fallback to approximate count if encoder failed
      console.warn('[tokenEstimator] Using fallback token estimation');
      return fallbackEstimateTokens(text);
    }
    
    // Use tiktoken to encode and count tokens
    const tokens = encoder.encode(text);
    const tokenCount = tokens.length;
    
    console.log(`[tokenEstimator] Tiktoken count for text (${text.length} chars): ${tokenCount} tokens`);
    
    // Free resources
    if (tokens && typeof tokens.free === 'function') {
      tokens.free();
    }
    
    return tokenCount;
  } catch (error) {
    console.error('[tokenEstimator] Error estimating tokens:', error);
    return fallbackEstimateTokens(text);
  }
}

/**
 * Fallback token estimation when tiktoken fails
 */
function fallbackEstimateTokens(text: string): number {
  // Get a character count first
  const charCount = text.length;
  
  // Get a word count
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  
  // Generate multiple estimates and average them
  // 1. Character-based estimate (1 token ~= 4 chars)
  const charBasedEstimate = Math.ceil(charCount / 4);
  
  // 2. Word-based estimate (100 tokens ~= 75 words)
  const wordBasedEstimate = Math.ceil(wordCount * (100/75));
  
  // 3. Combined estimate - average of the two but weight char-based more
  const finalEstimate = Math.ceil((charBasedEstimate * 0.6) + (wordBasedEstimate * 0.4));
  
  console.log(`[tokenEstimator] Fallback estimate: ${finalEstimate} tokens`);
  
  return finalEstimate;
}
