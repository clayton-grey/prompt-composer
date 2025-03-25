/**
 * @file tokenEstimator.ts
 * @description
 * Simple token estimation functions for working with text.
 */

// Record to track initialized state
const state = {
  initialized: false
};

/**
 * Initialize the token estimator
 */
export function initEncoder(model: string = 'gpt-3.5-turbo'): void {
  console.log('[tokenEstimator] Initializing simple token estimator for model:', model);
  state.initialized = true;
}

/**
 * Simple token estimation function (word count based)
 * Uses whitespace splitting as a basic approximation
 */
export function estimateTokens(text: string): number {
  if (!state.initialized) {
    initEncoder();
  }
  
  if (!text) return 0;
  
  // Simple token estimation: words + punctuation (very approximate)
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  console.log('[tokenEstimator] Estimated tokens for text (word-based):', wordCount);
  
  return wordCount;
}
