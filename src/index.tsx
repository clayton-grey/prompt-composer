
/**
 * @file index.tsx
 * @description
 * The entry point for the React portion of the Prompt Composer application.
 * We create a React root here and render the App component. In addition,
 * we wrap the entire app with the PromptProvider to supply global prompt
 * state and settings throughout the app.
 *
 * Key Responsibilities:
 *  - Mount the React app at the #root DOM element
 *  - Provide global context wrappers (PromptProvider, etc.)
 *
 * @notes
 *  - The StrictMode can be kept for dev to highlight potential issues
 *    in the console.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Import the PromptProvider so we can wrap our app
import { PromptProvider } from './context/PromptContext';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <PromptProvider>
      <App />
    </PromptProvider>
  </React.StrictMode>
);
