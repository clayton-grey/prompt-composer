/**
 * @file App.tsx
 * @description
 * The main application component. Lays out the top bar, a resizable sidebar,
 * main content area, and bottom bar. We now wrap the entire content with ToastProvider
 * for user-facing notifications as part of Step 4 (error feedback).
 *
 * Implementation:
 *  - We import the ToastProvider from ./context/ToastContext.
 *  - We wrap our main layout with <ToastProvider> so that any child can call showToast().
 *  - The rest remains the same, with the same drag-to-resize sidebar logic.
 *
 * Key changes in Step 4:
 *  - Added <ToastProvider> to wrap everything, so error messages appear as toasts.
 */

import React, { useState, useRef, useEffect, MouseEvent } from 'react';
import TopBar from './components/TopBar';
import Sidebar from './components/Sidebar';
import BottomBar from './components/BottomBar';
import MainContent from './components/MainContent';
import { useTheme } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';

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
    setSidebarWidth(prev => {
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

  return (
    <ToastProvider>
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
    </ToastProvider>
  );
};

export default App;
