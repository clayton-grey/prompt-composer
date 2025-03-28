/**
 * @file App.tsx
 * @description
 * Main 2-column layout with a left sidebar (file tree) and right editor column.
 * Updated to set minimum width of the file tree to 250px.
 */

import React, { useRef, useEffect, useState } from 'react';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
import { useTheme } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { usePrompt } from './context/PromptContext';
import { TemplateBlock } from './types/Block';
import EditorFooter from './components/EditorFooter';

const MIN_SIDEBAR_WIDTH = 270; // changed from 180 to 250
const MAX_SIDEBAR_WIDTH = 1200;

const App: React.FC = () => {
  const { darkMode } = useTheme();
  const [sidebarWidth, setSidebarWidth] = useState(256);
  const resizingRef = useRef(false);
  const lastClientXRef = useRef(0);

  const { blocks } = usePrompt();

  // If there's a lead template block editing raw, show the raw editor in place of normal content
  const rawEditingBlock = blocks.find(
    b => b.type === 'template' && b.isGroupLead && b.editingRaw
  ) as TemplateBlock | undefined;

  const startResize = (e: React.MouseEvent<HTMLDivElement>) => {
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
    function onMove(ev: MouseEvent) {
      if (!resizingRef.current) return;
      handleMouseMove(ev);
    }
    function onUp() {
      handleMouseUp();
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  return (
    <ToastProvider>
      <div className={`${darkMode ? 'dark' : ''} h-screen w-screen overflow-hidden flex flex-row`}>
        {/* Left column: sidebar (flex-none) + pinned footer inside the Sidebar */}
        <div
          className="relative dark:bg-gray-700 bg-gray-200 flex-none flex flex-col"
          style={{ width: sidebarWidth, minWidth: MIN_SIDEBAR_WIDTH }}
        >
          <Sidebar />
          <div
            onMouseDown={startResize}
            className="absolute top-0 right-0 w-2 h-full cursor-col-resize bg-transparent hover:bg-gray-300 dark:hover:bg-gray-600 z-10"
          />
        </div>

        {/* Right column: editor (flex-col) => top content, bottom <EditorFooter /> */}
        <div className="flex-grow flex flex-col dark:bg-gray-900 bg-gray-50">
          {/* Main content area */}
          <div className="flex-1 overflow-auto">
            <MainContent />
          </div>

          {/* Editor Footer: h-10 => ensures same height as sidebar's footer area */}
          <EditorFooter />
        </div>
      </div>
    </ToastProvider>
  );
};

export default App;
