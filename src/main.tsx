
/**
 * @file main.tsx
 * @description
 * This is the actual entry point that Vite/Electron loads (via index.html).
 * We render the <App/> inside both <PromptProvider> and <ThemeProvider>.
 *
 * Key Responsibilities:
 *  - Create the React root and render the <App/> within both contexts
 *  - Provide global context (blocks array, theme toggle, etc.) so that
 *    the entire app has consistent data & theme state.
 *
 * @notes
 *  - We add <ThemeProvider> around <PromptProvider> to support dark mode toggling.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Import the PromptProvider from the context
import { PromptProvider } from './context/PromptContext';
// Import the ThemeProvider for dark/light mode
import { ThemeProvider } from './context/ThemeContext';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <PromptProvider>
        <App />
      </PromptProvider>
    </ThemeProvider>
  </React.StrictMode>
);
