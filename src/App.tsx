
/**
 * @file App.tsx
 * @description
 * The main application component. Lays out the top bar, sidebar, main content area,
 * and bottom bar using Tailwind CSS utility classes. We now apply the "dark" class
 * conditionally if darkMode is true, enabling Tailwind's dark styles.
 *
 * Key Features:
 *  - Renders TopBar, Sidebar, MainContent, and BottomBar
 *  - Uses Tailwind classes to create a flexible, responsive layout
 *  - Applies 'dark' class based on ThemeContext's darkMode state
 *
 * @notes
 *  - The layout is a simple flex container with a column orientation
 *    and a row split for the main content and sidebar.
 *  - We read darkMode from useTheme() and apply 'dark' class to the outer container.
 */

import React from 'react';
import TopBar from './components/TopBar';
import Sidebar from './components/Sidebar';
import BottomBar from './components/BottomBar';
import MainContent from './components/MainContent';
import { useTheme } from './context/ThemeContext';

const App: React.FC = () => {
  const { darkMode } = useTheme();

  // Conditionally apply the 'dark' class so Tailwind's dark:* variants become active
  // Also note we have some existing "dark:bg-..." classes in child elements that rely on 'dark' being present at a parent level
  return (
    <div className={`flex flex-col h-screen ${darkMode ? 'dark' : ''}`}>
      {/* We set a base background color that changes with dark mode below */}
      <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
        {/* Top Bar */}
        <TopBar />

        {/* Main Body: Sidebar + Content */}
        <div className="flex flex-row flex-grow overflow-hidden">
          <Sidebar />
          <MainContent />
        </div>

        {/* Bottom Bar */}
        <BottomBar />
      </div>
    </div>
  );
};

export default App;
