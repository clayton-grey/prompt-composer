
/**
 * @file App.tsx
 * @description
 * The main application component. Lays out the top bar, a resizable sidebar, main content area,
 * and bottom bar using Tailwind CSS utility classes. We apply a "dark" class if darkMode is true.
 * 
 * Step 17 Changes:
 *  1) Introduced a "draggable divider" approach so users can resize the sidebar horizontally.
 *  2) Enforce a minimum sidebar width of 180px.
 *  3) Keep existing usage of <TopBar />, <Sidebar />, <MainContent />, <BottomBar />.
 *
 * Implementation:
 *  - We keep "App" in a "flex flex-col h-screen" container for overall layout.
 *  - Inside the main area, we track sidebarWidth in state.
 *  - We render a "resizer" div between the sidebar and main content that triggers onMouseDown to start resizing.
 *  - We handle onMouseMove/onMouseUp globally for a typical "drag to resize" pattern.
 *  - The rest is unchanged, including dark mode from ThemeContext.
 */

import React, { useState, useRef, useEffect, MouseEvent } from 'react';
import TopBar from './components/TopBar';
import Sidebar from './components/Sidebar';
import BottomBar from './components/BottomBar';
import MainContent from './components/MainContent';
import { useTheme } from './context/ThemeContext';

const MIN_SIDEBAR_WIDTH = 180;
const MAX_SIDEBAR_WIDTH = 1200; // Arbitrary large number to avoid extreme expansions

const App: React.FC = () => {
  const { darkMode } = useTheme();

  // Step 17: We'll store the sidebar width in local state, default to 256.
  const [sidebarWidth, setSidebarWidth] = useState(256);
  const resizingRef = useRef(false);
  const lastClientXRef = useRef(0);

  /**
   * startResize is triggered onMouseDown on the resizer handle.
   */
  const startResize = (e: MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    resizingRef.current = true;
    lastClientXRef.current = e.clientX;
  };

  /**
   * handleMouseMove is triggered by window's mousemove while resizing is active.
   */
  const handleMouseMove = (e: MouseEvent) => {
    if (!resizingRef.current) return;
    // Calculate the new width
    const delta = e.clientX - lastClientXRef.current;
    lastClientXRef.current = e.clientX;

    setSidebarWidth((prev) => {
      let newWidth = prev + delta;
      if (newWidth < MIN_SIDEBAR_WIDTH) newWidth = MIN_SIDEBAR_WIDTH;
      if (newWidth > MAX_SIDEBAR_WIDTH) newWidth = MAX_SIDEBAR_WIDTH;
      return newWidth;
    });
  };

  /**
   * handleMouseUp stops the resizing logic.
   */
  const handleMouseUp = () => {
    resizingRef.current = false;
  };

  /**
   * We attach window-level event handlers to handle resizing outside the immediate resizer area.
   */
  useEffect(() => {
    function onMouseMove(e: globalThis.MouseEvent) {
      if (!resizingRef.current) return;
      // We can reuse handleMouseMove logic by faking a React SyntheticEvent:
      const fakeEvent = {
        clientX: e.clientX,
        preventDefault: () => {},
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

  // Conditionally apply the 'dark' class so Tailwind's dark:* variants become active
  return (
    <div className={`flex flex-col h-screen ${darkMode ? 'dark' : ''}`}>
      <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
        {/* Top Bar */}
        <TopBar />

        {/* Main Body: Sidebar + Content + Draggable Divider */}
        <div className="flex flex-row flex-grow overflow-hidden">
          {/* SIDEBAR with dynamic width */}
          <div
            className="relative h-full"
            style={{ width: sidebarWidth, minWidth: MIN_SIDEBAR_WIDTH }}
          >
            <Sidebar />
            {/* The Resizer handle: absolutely positioned on the right edge of the sidebar */}
            <div
              onMouseDown={startResize}
              className="absolute top-0 right-0 w-2 h-full cursor-col-resize bg-transparent hover:bg-gray-300 dark:hover:bg-gray-600 z-10"
            />
          </div>

          {/* MAIN CONTENT, flex grows to fill remaining space */}
          <div className="flex-grow">
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
