
/**
 * @file tokenEstimator.ts
 * @description
 * Official single source of token estimation logic using the tiktoken library.
 * We have removed the older fallback-based files (tokenizer.ts, tokenizer/index.ts, tokenEstimator.js, etc.)
 * in favor of this unified approach.
 *
 * Usage:
 *   import { initEncoder, estimateTokens } from '../utils/tokenEstimator';
 *   initEncoder('gpt-4o');
 *   const count = estimateTokens("Hello, world!", 'gpt-4o');
 *
 * Implementation Details:
 *  - We rely on Tiktoken for accurate token counts.
 *  - If Tiktoken fails, we use a fallback approach that estimates tokens by analyzing
 *    character count, presence of code blocks, etc.
 *  - For GPT-4o specifically, we apply a correction factor to better approximate real usage.
 */

import { encoding_for_model, TiktokenModel } from '@dqbd/tiktoken';

/**
 * A cache mapping model encodings to Tiktoken encoder instances.
 */
const encoderCache = new Map<string, any>();

/**
 * Valid encoding names that we might use. Tiktoken uses these strings to load a set of BytePairEncoding merges/ranks.
 */
const VALID_ENCODINGS = {
  'cl100k_base': 'cl100k_base' as TiktokenModel,
  'p50k_base': 'p50k_base' as TiktokenModel,
  'r50k_base': 'r50k_base' as TiktokenModel
} as const;

/**
 * Mapping from model name prefix to a TiktokenModel encoding. 
 * We assume 'gpt-4o', 'gpt-4-turbo', etc. uses 'cl100k_base' unless overridden.
 */
const MODEL_ENCODINGS: Record<string, TiktokenModel> = {
  'gpt-4o': VALID_ENCODINGS.cl100k_base,
  'gpt-4-turbo': VALID_ENCODINGS.cl100k_base,
  'gpt-4': VALID_ENCODINGS.cl100k_base,
  'gpt-3.5-turbo': VALID_ENCODINGS.cl100k_base,
  'text-embedding': VALID_ENCODINGS.cl100k_base
};

/**
 * Default encoding to use if we cannot match the model prefix above.
 */
const DEFAULT_ENCODING = VALID_ENCODINGS.cl100k_base;

/**
 * initEncoder
 * @param model - model name (e.g. 'gpt-4o', 'gpt-3.5-turbo')
 * @description
 * Initialization hook. We do a lazy init, but this function
 * can be called early to pre-warm the Tiktoken library if desired.
 */
export function initEncoder(model: string = 'gpt-4o'): void {
  // No immediate action needed. 
  // We'll actually load the encoder on-demand in estimateTokens.
  // This function is provided in case we want to do pre-initialization.
  console.log('[tokenEstimator] initEncoder called for model:', model);
}

/**
 * estimateTokens
 * @param text - The content to estimate tokens for
 * @param model - The model name
 * @returns A numeric estimate of the tokens used
 *
 * Implementation:
 *  1) Find the TiktokenModel encoding that matches the given model prefix (or default).
 *  2) If we haven't already cached that encoder, load it via encoding_for_model.
 *  3) Encode the text and count the tokens. 
 *  4) If the model is 'gpt-4o', apply an additional correction factor (about 1.17).
 *  5) If anything fails, fallback to a naive character-based approach.
 */
export function estimateTokens(text: string, model: string = 'gpt-4o'): number {
  if (!text) return 0;

  try {
    // Determine the encoding to use
    let encodingName = DEFAULT_ENCODING;

    // Attempt to match model prefix
    for (const [prefix, enc] of Object.entries(MODEL_ENCODINGS)) {
      if (model.startsWith(prefix)) {
        encodingName = enc;
        break;
      }
    }

    // Check if we've cached an encoder
    let encoder = encoderCache.get(encodingName);
    if (!encoder) {
      // Attempt to initialize
      encoder = encoding_for_model(encodingName);
      encoderCache.set(encodingName, encoder);
    }

    // Encode
    const tokens = encoder.encode(text);
    let tokenCount = tokens.length;

    // Correction factor for 'gpt-4o'
    if (model === 'gpt-4o') {
      tokenCount = Math.ceil(tokenCount * 1.170);
    }

    return tokenCount;
  } catch (error) {
    console.error('[tokenEstimator] Error in tiktoken. Using fallback:', error);
    return fallbackEstimateTokens(text, model);
  }
}

/**
 * fallbackEstimateTokens
 * @description 
 * A naive token estimation approach if Tiktoken fails. 
 * We count characters, adjust for code blocks or known markup, 
 * and approximate tokens using a divisor. Then we apply the same GPT-4o factor if relevant.
 */
function fallbackEstimateTokens(text: string, model: string = 'gpt-4o'): number {
  if (!text) return 0;

  const charCount = text.length;
  const hasCode = text.includes('```');

  let divisor = 3.8; // base divisor for GPT-4o plain text

  if (model.startsWith('gpt-4')) {
    // GPT-4 family
    if (model === 'gpt-4o') {
      // If code is present, adjust upwards
      if (hasCode) {
        divisor = text.includes('typescript') || text.includes('javascript') ? 4.7 : 4.5;
      } else if (text.includes('<file_map>') || text.includes('<file_contents>')) {
        divisor = 3.55;
      }
    } else {
      // other gpt-4
      divisor = hasCode ? 4.5 : 3.9;
    }
  } else {
    // GPT-3.5 or other model
    divisor = hasCode ? 4.2 : 3.7;
  }

  let tokenCount = Math.ceil(charCount / divisor);

  if (model === 'gpt-4o') {
    tokenCount = Math.ceil(tokenCount * 1.170);
  }

  console.log(
    `[tokenEstimator-fallback] Model: ${model}, ` +
    `Chars: ${charCount}, Divisor: ${divisor.toFixed(2)}, ` +
    `Approx tokens: ${tokenCount}`
  );

  return tokenCount;
}
