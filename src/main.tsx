
/**
 * @file main.tsx
 * @description
 * Entry point that Vite/Electron loads (via index.html). We render the <App/>
 * inside the ThemeProvider, ProjectProvider, and PromptProvider. 
 * 
 * Step 3 (File & Directory Handling) requires we wrap <PromptProvider> in 
 * <ProjectProvider> to cache directory listing data. That ensures components 
 * like FileTree or FileMapViewer can fetch from the ProjectContext instead 
 * of calling electronAPI directly.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Providers
import { ThemeProvider } from './context/ThemeContext';
import { PromptProvider } from './context/PromptContext';
import { ProjectProvider } from './context/ProjectContext';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      {/* The ProjectProvider caches directory data for FileTree / FileMapViewer */}
      <ProjectProvider>
        <PromptProvider>
          <App />
        </PromptProvider>
      </ProjectProvider>
    </ThemeProvider>
  </React.StrictMode>
);
