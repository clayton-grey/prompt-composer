
/**
 * @file main.tsx
 * @description
 * This is the actual entry point that Vite/Electron loads (via index.html).
 * Previously, we rendered just <App/>, which meant <PromptProvider>
 * from index.tsx was never used in production. We now wrap <App/>
 * with <PromptProvider> to ensure the context is actually in use.
 *
 * Key Responsibilities:
 *  - Create the React root and render the <App/> within <PromptProvider>
 *  - Provide global context (blocks array, etc.) so that the
 *    "Add Block" feature updates the UI properly.
 *
 * @notes
 *  - We removed src/index.tsx to avoid confusion, as index.html references main.tsx.
 *  - This fix ensures the user's blocks appear in the UI.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Import the PromptProvider from the context
import { PromptProvider } from './context/PromptContext';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PromptProvider>
      <App />
    </PromptProvider>
  </React.StrictMode>
);
