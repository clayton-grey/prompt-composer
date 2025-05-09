/**
 * @file EditorFooter.tsx
 * @description
 * A footer for the editor column. h-10, text-sm. We now replace the textual "Editor usage" label
 * with the coins icon + the numeric usage. The user wants to show e.g. [coins icon] 120 / 2048.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useState, useEffect } from 'react';
import { usePrompt } from '../context/PromptContext';
import { useTheme } from '../context/ThemeContext';
import FileSystemDebugger from './Debug/FileSystemDebugger';
import { isDevToolsOpen, addIpcListener, removeIpcListener } from '../utils/electronUtils';

const EditorFooter: React.FC = () => {
  const [isDevToolsOpenState, setIsDevToolsOpen] = useState(false);

  useEffect(() => {
    // Check if DevTools are open initially
    isDevToolsOpen().then(setIsDevToolsOpen);

    // Set up event listener for DevTools state changes
    const handleDevToolsChange = (_event: any, isOpen: boolean) => {
      setIsDevToolsOpen(isOpen);
    };

    addIpcListener('devtools-changed', handleDevToolsChange);

    return () => {
      removeIpcListener('devtools-changed', handleDevToolsChange);
    };
  }, []);
  const { tokenUsage, settings } = usePrompt();
  const { darkMode, toggleDarkMode } = useTheme();
  const [showDebug, setShowDebug] = useState(false);

  const { total } = tokenUsage;
  const { maxTokens } = settings;

  const isOverLimit = total > maxTokens;
  const barBgColor = isOverLimit ? 'bg-red-100 dark:bg-red-800' : 'bg-white dark:bg-gray-800';
  const textColor = isOverLimit
    ? 'text-red-600 dark:text-red-300 font-semibold'
    : 'text-gray-700 dark:text-gray-300';

  const handleThemeToggle = () => {
    toggleDarkMode();
  };

  const toggleDebug = () => {
    setShowDebug(prev => !prev);
  };

  return (
    <>
      {showDebug && (
        <div className="absolute bottom-10 right-4 z-50 w-96">
          <FileSystemDebugger />
        </div>
      )}
      <div
        className={`h-10 flex items-center justify-between px-4 shadow ${barBgColor} flex-none text-sm`}
      >
        {/* Left side: coins icon + "X / Y" */}
        <div className={`flex items-center gap-2 ${textColor}`}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-5 h-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="8" cy="8" r="6" />
            <path d="M18.09 10.37A6 6 0 1 1 10.34 18" />
            <path d="M7 6h1v4" />
            <path d="m16.71 13.88.7.71-2.82 2.82" />
          </svg>
          <span>
            {total} / {maxTokens}
          </span>
        </div>

        {/* Right side: theme toggle button and debug toggle */}
        <div className="flex items-center gap-2">
          <button
            onClick={toggleDebug}
            title="Check path permissions"
            aria-label="Check path permissions"
            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
            style={{ display: isDevToolsOpenState ? 'block' : 'none' }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={showDebug ? 'text-blue-500' : 'text-gray-500 dark:text-gray-400'}
            >
              <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          </button>
          <button
            onClick={handleThemeToggle}
            title="Toggle Theme"
            aria-label="Toggle Theme"
            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
          >
            {darkMode ? (
              /* dark => sun-moon icon, invert(1) */
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="lucide lucide-sun-moon"
                style={{ filter: 'invert(1)' }}
              >
                <path d="M12 8a2.83 2.83 0 0 0 4 4 4 4 0 1 1-4-4"></path>
                <path d="M12 2v2"></path>
                <path d="M12 20v2"></path>
                <path d="m4.9 4.9 1.4 1.4"></path>
                <path d="m17.7 17.7 1.4 1.4"></path>
                <path d="M2 12h2"></path>
                <path d="M20 12h2"></path>
                <path d="m6.3 17.7-1.4 1.4"></path>
                <path d="m19.1 4.9-1.4 1.4"></path>
              </svg>
            ) : (
              /* light => sun icon normal */
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="lucide lucide-sun"
              >
                <circle cx="12" cy="12" r="4"></circle>
                <path d="M12 2v2"></path>
                <path d="M12 20v2"></path>
                <path d="m4.93 4.93 1.41 1.41"></path>
                <path d="m17.66 17.66 1.41 1.41"></path>
                <path d="M2 12h2"></path>
                <path d="M20 12h2"></path>
                <path d="m6.34 17.66-1.41 1.41"></path>
                <path d="m19.07 4.93-1.41 1.41"></path>
              </svg>
            )}
          </button>
        </div>
      </div>
    </>
  );
};

export default EditorFooter;
