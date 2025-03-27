
/**
 * @file App.tsx
 * @description
 * The main application component. Lays out the top bar, a resizable sidebar,
 * main content area, and bottom bar. We now ensure the main content region
 * is truly scrollable by carefully applying Tailwind classes that allow
 * the PromptBuilder to have enough space and overflow if needed.
 *
 * Fixing Scroll Issue:
 *  - We use a "flex flex-col h-screen" on the root,
 *  - Then "flex flex-row flex-grow overflow-hidden" on the main body,
 *  - The main content region is "flex flex-col flex-grow overflow-hidden",
 *    so that inside it, we can place a child that sets "overflow-auto".
 */

import React, { useState, useRef, useEffect, MouseEvent } from 'react';
import TopBar from './components/TopBar';
import Sidebar from './components/Sidebar';
import BottomBar from './components/BottomBar';
import MainContent from './components/MainContent';
import { useTheme } from './context/ThemeContext';

const MIN_SIDEBAR_WIDTH = 180;
const MAX_SIDEBAR_WIDTH = 1200;

const App: React.FC = () => {
  const { darkMode } = useTheme();
  const [sidebarWidth, setSidebarWidth] = useState(256);
  const resizingRef = useRef(false);
  const lastClientXRef = useRef(0);

  const startResize = (e: MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    resizingRef.current = true;
    lastClientXRef.current = e.clientX;
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!resizingRef.current) return;
    const delta = e.clientX - lastClientXRef.current;
    lastClientXRef.current = e.clientX;
    setSidebarWidth((prev) => {
      let newWidth = prev + delta;
      if (newWidth < MIN_SIDEBAR_WIDTH) newWidth = MIN_SIDEBAR_WIDTH;
      if (newWidth > MAX_SIDEBAR_WIDTH) newWidth = MAX_SIDEBAR_WIDTH;
      return newWidth;
    });
  };

  const handleMouseUp = () => {
    resizingRef.current = false;
  };

  useEffect(() => {
    function onMouseMove(e: globalThis.MouseEvent) {
      if (!resizingRef.current) return;
      const fakeEvent = {
        clientX: e.clientX,
        preventDefault: () => {}
      } as unknown as MouseEvent<HTMLDivElement>;
      handleMouseMove(fakeEvent);
    }
    function onMouseUp() {
      handleMouseUp();
    }
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  return (
    <div className={`flex flex-col h-screen ${darkMode ? 'dark' : ''}`}>
      <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
        {/* Top Bar */}
        <TopBar />

        {/* Body: Sidebar + Main Content in a horizontal flex, with a resizable divider */}
        <div className="flex flex-row flex-grow overflow-hidden">
          {/* Sidebar */}
          <div
            className="relative h-full dark:bg-gray-700 bg-gray-200"
            style={{ width: sidebarWidth, minWidth: MIN_SIDEBAR_WIDTH }}
          >
            <Sidebar />
            <div
              onMouseDown={startResize}
              className="absolute top-0 right-0 w-2 h-full cursor-col-resize bg-transparent hover:bg-gray-300 dark:hover:bg-gray-600 z-10"
            />
          </div>

          {/* Main content container, which can overflow */}
          <div className="flex flex-col flex-grow overflow-hidden">
            <MainContent />
          </div>
        </div>

        {/* Bottom Bar */}
        <BottomBar />
      </div>
    </div>
  );
};

export default App;
