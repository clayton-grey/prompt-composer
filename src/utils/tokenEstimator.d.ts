declare module 'tokenEstimator' {
  export function initEncoder(model?: string): void;
  export function estimateTokens(text: string): number;
  
  const TokenEstimator: {
    initEncoder: typeof initEncoder;
    estimateTokens: typeof estimateTokens;
  };
  
  export default TokenEstimator;
} 