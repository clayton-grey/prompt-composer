
/**
 * @file tokenEstimator.ts
 * @description
 * Official single source of token estimation logic using the tiktoken library,
 * now without any arbitrary correction factors. The raw Tiktoken output is
 * used directly.
 *
 * Implementation Changes:
 *  - Removed the 1.17 factor for gpt-4.
 *  - Removed any other multipliers in fallback. 
 *  - Return raw token counts directly. 
 *
 * This should align the file tree usage with the file block usage in the prompt
 * without introducing discrepancies.
 */

import { encoding_for_model, TiktokenModel, get_encoding } from '@dqbd/tiktoken';

/**
 * Simple cache so we don't re-initialize Tiktoken encoders repeatedly.
 */
const encoderCache = new Map<string, any>();

/**
 * initEncoder
 * We can call this to do an initial log or any pre-warm if we want.
 */
export function initEncoder(model: string = 'gpt-4'): void {
  console.log('[tokenEstimator] initEncoder called for model:', model);
}

/**
 * estimateTokens
 * @param text - The content to estimate tokens for
 * @param model - The model name or custom label
 * @returns A numeric estimate of the tokens used (no artificial multipliers).
 */
export function estimateTokens(text: string, model: string = 'gpt-4'): number {
  if (!text) return 0;

  // If user calls "GPTo4" or "GPTo4-mini", map them to known Tiktoken-compatible names
  if (model === 'GPTo4') {
    model = 'gpt-4';
  } else if (model === 'GPTo4-mini') {
    model = 'gpt-3.5-turbo';
  }

  try {
    let encoder = encoderCache.get(model);
    if (!encoder) {
      // Try encoding_for_model first
      try {
        encoder = encoding_for_model(model as TiktokenModel);
      } catch (err) {
        console.warn('[tokenEstimator] encoding_for_model() failed for model:', model, err);

        // If the model is a known base encoding name, try get_encoding
        if (model === 'cl100k_base' || model === 'p50k_base' || model === 'r50k_base') {
          encoder = get_encoding(model);
        } else if (model.includes('cl100k_base')) {
          encoder = get_encoding('cl100k_base');
        } else if (model.includes('p50k_base')) {
          encoder = get_encoding('p50k_base');
        } else if (model.includes('r50k_base')) {
          encoder = get_encoding('r50k_base');
        } else {
          throw new Error(`Could not find a valid encoding for model: ${model}`);
        }
      }
      encoderCache.set(model, encoder);
    }
    const tokens = encoder.encode(text);
    return tokens.length;
  } catch (error) {
    console.error('[tokenEstimator] Error in tiktoken. Using fallback:', error);
    return null
  }
}
