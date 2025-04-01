/**
 * @file tokenEstimator.ts
 * @description
 * Official single source of token estimation logic using the tiktoken library,
 * with improved handling of disallowed special tokens and a small error short-circuit cache.
 *
 * Changes to address production issues:
 *  1) Filter out <|endoftext|> and other special tokens before encoding
 *  2) Use a failCache object to avoid repeated attempts for the same text
 *  3) Add more robust error handling for production environments
 *  4) Implement a fallback counting mechanism when tiktoken fails
 */

import { encoding_for_model, TiktokenModel, get_encoding } from '@dqbd/tiktoken';

/**
 * Simple cache so we don't re-initialize Tiktoken encoders repeatedly.
 */
const encoderCache = new Map<string, any>();

/**
 * For large repeated texts that cause tiktoken to fail, we store a hashed "fail" marker
 * so we skip re-attempting for the exact same text over and over.
 */
const failCache = new Set<string>();

/**
 * initEncoder
 * We can call this to do an initial log or any pre-warm if we want.
 */
export function initEncoder(model: string = 'gpt-4'): void {
  console.log('[tokenEstimator] initEncoder called for model:', model);

  // Try to initialize the encoder early to catch any issues
  try {
    const encoder = getEncoder(model);
    if (encoder) {
      console.log('[tokenEstimator] Successfully pre-initialized encoder for:', model);
    }
  } catch (err) {
    console.warn('[tokenEstimator] Failed to pre-initialize encoder:', err);
  }
}

/**
 * Helper function to get an encoder instance with proper error handling
 */
function getEncoder(modelName: string) {
  try {
    let encoder = encoderCache.get(modelName);
    if (!encoder) {
      // Try encoding_for_model first
      try {
        encoder = encoding_for_model(modelName as TiktokenModel);
        console.log('[tokenEstimator] Created new encoder for model:', modelName);
      } catch (err) {
        console.warn('[tokenEstimator] encoding_for_model() failed for model:', modelName);

        // Attempt fallback to "cl100k_base"
        console.warn('[tokenEstimator] Falling back to cl100k_base encoder...');
        try {
          encoder = get_encoding('cl100k_base');
          console.log('[tokenEstimator] Successfully created fallback encoder');
        } catch (errFallback) {
          console.error('[tokenEstimator] Fallback to cl100k_base also failed:', errFallback);
          return null;
        }
      }
      encoderCache.set(modelName, encoder);
    }
    return encoder;
  } catch (err) {
    console.error('[tokenEstimator] Unexpected error creating encoder:', err);
    return null;
  }
}

/**
 * sanitizeText
 * Removes known disallowed special tokens or placeholders that break tiktoken.
 */
function sanitizeText(text: string): string {
  try {
    if (!text) return '';

    // remove or replace <|endoftext|> and other special tokens if present
    const bannedTokens = [
      '<|endoftext|>',
      '<|startoftext|>',
      '<|fim_prefix|>',
      '<|fim_suffix|>',
      '<|fim_middle|>',
      '<|endofprompt|>',
      '<|im_start|>',
      '<|im_end|>',
      '<|im_sep|>',
      '<fim_prefix>',
      '<fim_suffix>',
      '<fim_middle>',
      // Add more problematic tokens here
    ];

    let cleaned = text;

    // First specifically remove the known banned tokens
    for (const token of bannedTokens) {
      // Use split/join instead of replace for complete removal of all instances
      cleaned = cleaned.split(token).join('');
    }

    // Then use a comprehensive regex to catch any remaining <|...|> patterns
    cleaned = cleaned.replace(/<\|[\w_]*\|>/g, '');

    // Also remove <...> without pipes that might cause issues
    cleaned = cleaned.replace(/<[\w_]+>/g, '');

    // Remove any Unicode control characters
    cleaned = cleaned.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');

    // Remove any null bytes that might have slipped through
    cleaned = cleaned.replace(/\0/g, '');

    return cleaned;
  } catch (error) {
    // If anything goes wrong during sanitization, return empty string
    console.error('[tokenEstimator] Error in sanitizeText:', error);
    return '';
  }
}

/**
 * quickHash
 * Returns a short hash so we can store the text in failCache.
 * For large texts, we don't want to store the entire text in memory.
 */
function quickHash(s: string): string {
  let hash = 0;
  for (let i = 0; i < Math.min(s.length, 1000); i++) {
    // simple char code prime
    hash = (hash << 5) - hash + s.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString();
}

/**
 * Fallback token estimation based on character count
 * Not accurate but better than nothing when tiktoken fails
 */
function estimateTokensByCharCount(text: string): number {
  if (!text) return 0;
  // Rough approximation: ~4 characters per token for English text
  return Math.ceil(text.length / 4);
}

/**
 * estimateTokens
 * @param text - The content to estimate tokens for
 * @param model - The model name or custom label
 * @returns A numeric estimate of the tokens used (no artificial multipliers).
 */
export function estimateTokens(text: string, model: string = 'gpt-4'): number {
  if (!text) return 0;

  try {
    // Handle empty text case
    if (text.trim().length === 0) return 0;

    // Map model names to known Tiktoken-compatible names
    let modelName = model;
    if (model === 'GPTo4') {
      modelName = 'gpt-4';
    } else if (model === 'GPTo4-mini') {
      modelName = 'gpt-3.5-turbo';
    } else if (model === 'claude-3') {
      modelName = 'cl100k_base'; // Claude models use the same tokenizer as GPT-4
    }

    // Step 1: sanitize text by removing disallowed tokens
    const cleanedText = sanitizeText(text);
    if (!cleanedText) return 0;

    // Step 2: check if we've already failed on this exact text
    const textKey = modelName + '|' + quickHash(cleanedText);
    if (failCache.has(textKey)) {
      console.log('[tokenEstimator] Using fallback for previously failed text');
      return estimateTokensByCharCount(cleanedText);
    }

    try {
      // Get encoder (with caching)
      const encoder = getEncoder(modelName);
      if (!encoder) {
        console.warn('[tokenEstimator] No encoder available, using character-based fallback');
        failCache.add(textKey);
        return estimateTokensByCharCount(cleanedText);
      }

      // Try to encode with specific error handling
      try {
        const tokens = encoder.encode(cleanedText);
        return tokens.length;
      } catch (encodeError) {
        console.error('[tokenEstimator] Encode operation failed:', encodeError);
        failCache.add(textKey);
        return estimateTokensByCharCount(cleanedText);
      }
    } catch (error) {
      console.error('[tokenEstimator] Error in tiktoken. Using character-based fallback:', error);
      failCache.add(textKey);
      return estimateTokensByCharCount(cleanedText);
    }
  } catch (outerError) {
    // Catch any errors that might happen at the top level
    console.error('[tokenEstimator] Unexpected error estimating tokens:', outerError);
    return estimateTokensByCharCount(text);
  }
}
