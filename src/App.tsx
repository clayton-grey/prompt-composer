/**
 * @file App.tsx
 * @description
 * Main 2-column layout with a left sidebar (file tree) and right editor column.
 * This snippet restores the EditorFooter that might have been lost or removed accidentally.
 *
 * Implementation:
 *  - In the right column, after our main content area, we re-add the <EditorFooter />
 *    so it appears pinned at the bottom, just like in earlier versions.
 *  - The footer has a fixed height (e.g., h-10), keeping it consistent with the sidebar's bottom bar.
 *
 * You can adapt the styling or remove the partial classes if needed for your layout.
 */

import React, { useRef, useEffect, useState } from 'react';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
import { useTheme } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { usePrompt } from './context/PromptContext';
import { TemplateBlock } from './types/Block';
import EditorFooter from './components/EditorFooter';

const MIN_SIDEBAR_WIDTH = 270;
const MAX_SIDEBAR_WIDTH = 1200;

const App: React.FC = () => {
  const { darkMode } = useTheme();
  const [sidebarWidth, setSidebarWidth] = useState(256);
  const resizingRef = useRef(false);
  const lastClientXRef = useRef(0);

  const { blocks } = usePrompt();

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
        {/* Left column: sidebar */}
        <div
          className="relative dark:bg-gray-700 bg-gray-200 flex-none flex flex-col"
          style={{
            width: sidebarWidth,
            minWidth: MIN_SIDEBAR_WIDTH,
            maxWidth: '50%',
          }}
        >
          <Sidebar />
          <div
            onMouseDown={startResize}
            className="absolute top-0 right-0 w-2 h-full cursor-col-resize bg-transparent hover:bg-gray-300 dark:hover:bg-gray-600 z-10"
          />
        </div>

        {/* Right column: editor => main content + pinned footer */}
        <div className="flex-grow flex flex-col dark:bg-gray-900 bg-gray-50">
          <div className="flex-1 overflow-auto">
            <MainContent />
          </div>

          {/* Here is the EditorFooter pinned at the bottom */}
          <EditorFooter />
        </div>
      </div>
    </ToastProvider>
  );
};

export default App;
