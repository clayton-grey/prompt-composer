/**
 * @file App.tsx
 * @description
 * The main application component. Lays out the top bar, sidebar, main content area,
 * and bottom bar using Tailwind CSS utility classes. This represents the basic
 * desktop-like structure that is common for prompt-building workflows.
 *
 * Key Features:
 * - Renders TopBar, Sidebar, MainContent, and BottomBar
 * - Uses Tailwind classes to create a flexible, responsive layout
 *
 * @notes
 *  - The layout is a simple flex container with a column orientation overall
 *    and a row split for the main content and sidebar.
 */

import React from 'react';
import TopBar from './components/TopBar';
import Sidebar from './components/Sidebar';
import BottomBar from './components/BottomBar';
import MainContent from './components/MainContent';

const App: React.FC = () => {
  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900">
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
  );
};

export default App;
