
/**
 * @file ThemeContext.tsx
 * @description
 * Provides a global context to manage the application's theme (light or dark).
 * We use Tailwind's "darkMode: 'class'" config, so we need to add or remove the 'dark' class
 * on a parent container. This context simply holds a boolean state `darkMode` and a toggle function.
 *
 * Key Responsibilities:
 *  - Maintain and expose the `darkMode` boolean
 *  - Provide a `toggleDarkMode` function to flip between light and dark
 *  - We wrap the entire application with <ThemeProvider>, so any child can access or modify theme
 *
 * Usage:
 *  1. Wrap <App/> with <ThemeProvider> in src/main.tsx
 *  2. Use the `useTheme()` hook in components (e.g., TopBar) to show a toggle button
 *  3. In App.tsx, apply the 'dark' class conditionally at the top-level container
 *
 * Edge Cases & Notes:
 *  - We store the theme in a simple React state. No local storage or system preference detection here.
 *  - We default to `false` (light mode). If future updates want to read from user preferences, we'd do that here.
 */

import React, { createContext, useContext, useState, useCallback } from 'react';

interface ThemeContextType {
  darkMode: boolean;
  toggleDarkMode: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  darkMode: false,
  toggleDarkMode: () => {}
});

/**
 * ThemeProvider
 * Wraps children in a context that manages darkMode and a toggle function.
 */
export const ThemeProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [darkMode, setDarkMode] = useState<boolean>(false);

  const toggleDarkMode = useCallback(() => {
    setDarkMode((prev) => !prev);
  }, []);

  return (
    <ThemeContext.Provider value={{ darkMode, toggleDarkMode }}>
      {children}
    </ThemeContext.Provider>
  );
};

/**
 * Custom hook to access the theme context
 */
export function useTheme(): ThemeContextType {
  return useContext(ThemeContext);
}
