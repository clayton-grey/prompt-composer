"use strict";
/**
 * @file tokenEstimator.ts
 * @description
 * Provides a function to estimate the number of tokens in a given string using
 * the "@dqbd/tiktoken" library. This helps the Prompt Composer app warn users
 * when they're approaching model token limits.
 *
 * Key Responsibilities:
 *  - Import and initialize a Tiktoken encoder for a chosen model (e.g., 'gpt-3.5-turbo')
 *  - Expose a function `estimateTokens(text: string): number` returning the token count
 *
 * @dependencies
 *  - "@dqbd/tiktoken": Node-based library for GPT tokenization
 *
 * @usage
 *   import { estimateTokens } from '../utils/tokenEstimator';
 *   const numTokens = estimateTokens("Hello, world!");
 *   console.log('Tokens used:', numTokens);
 *
 * @notes
 *  - We use the cl100k_base encoding which is commonly used for GPT models
 *  - We do not do advanced prompt prefix logic in this function; it's just raw text tokenizing.
 *  - For a fallback or offline scenario, you might consider a naive word-count approach,
 *    but we stick to Tiktoken for consistency with OpenAI token usage.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.estimateTokens = exports.initEncoder = void 0;
const tiktoken_1 = require("@dqbd/tiktoken");
// Map of model names to their corresponding encodings
const MODEL_TO_ENCODING = {
    'gpt-4': 'cl100k_base',
    'gpt-4-turbo': 'cl100k_base',
    'gpt-3.5-turbo': 'cl100k_base',
    'text-davinci-003': 'p50k_base'
};
// Default to cl100k_base if model is unknown
const DEFAULT_ENCODING = 'cl100k_base';
let encoder = null;
/**
 * Initialize the Tiktoken encoder with the appropriate encoding for the given model.
 * This function can be called again if needed.
 *
 * @param model - The model name to get the encoding for
 * @returns void
 */
function initEncoder(model = 'gpt-3.5-turbo') {
    try {
        const encodingName = MODEL_TO_ENCODING[model] || DEFAULT_ENCODING;
        console.log('[tokenEstimator] Initializing encoder for model:', model, 'using encoding:', encodingName);
        encoder = (0, tiktoken_1.get_encoding)(encodingName);
        console.log('[tokenEstimator] Successfully initialized encoder');
    }
    catch (err) {
        console.error('[tokenEstimator] Failed to initialize encoder:', err);
        encoder = null;
    }
}
exports.initEncoder = initEncoder;
/**
 * estimateTokens
 * @param text - The string to be tokenized
 * @description
 * Returns the approximate number of tokens for the given text using Tiktoken.
 * If the encoder is not initialized or fails, we return a naive fallback: split on whitespace.
 *
 * @returns number - token count
 */
function estimateTokens(text) {
    if (!encoder) {
        // Attempt to initialize the encoder if not done
        initEncoder();
    }
    if (encoder) {
        const tokens = encoder.encode(text);
        return tokens.length;
    }
    else {
        // Fallback: naive split
        return text.trim().split(/\s+/).filter(Boolean).length;
    }
}
exports.estimateTokens = estimateTokens;
