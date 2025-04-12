import React, { createContext, useContext, useEffect, useRef, ReactNode, useCallback } from 'react';
import { usePrompt } from './PromptContext';
import { useProject } from './ProjectContext';
import { generateAsciiTree } from '../utils/asciiTreeGenerator';
import { useToast } from './ToastContext';
import { showOpenDialog, addIpcListener, removeIpcListener } from '../utils/electronUtils';

// Global registration tracking to prevent duplicate event handlers in StrictMode
let isRegistered = false;

// Debounce mechanism to prevent duplicate action handling
let lastActionTime = 0;
const DEBOUNCE_TIME = 500; // ms

type MenuShortcutsContextType = {
  copyPromptBtnRef: React.RefObject<HTMLButtonElement>;
  copyFileBlockBtnRef: React.RefObject<HTMLButtonElement>;
  refreshFoldersBtnRef: React.RefObject<HTMLButtonElement>;
};

// Define a simple interface for IPC message event data
interface IpcMessageEvent {
  eventId?: string;
}

// Define types for event handlers
type MessageHandler = (event: unknown, data: IpcMessageEvent) => void;

const MenuShortcutsContext = createContext<MenuShortcutsContextType | null>(null);

export const useMenuShortcuts = () => {
  const context = useContext(MenuShortcutsContext);
  if (!context) {
    throw new Error('useMenuShortcuts must be used within a MenuShortcutsProvider');
  }
  return context;
};

export const MenuShortcutsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { getFlattenedPrompt } = usePrompt();
  const { projectFolders, getSelectedFileEntries, addProjectFolder, refreshFolders } = useProject();
  const { showToast } = useToast();

  // Use refs to hold references to the buttons for flashing effect
  const copyPromptBtnRef = useRef<HTMLButtonElement>(null);
  const copyFileBlockBtnRef = useRef<HTMLButtonElement>(null);
  const refreshFoldersBtnRef = useRef<HTMLButtonElement>(null);

  // Use refs to store the handler functions to prevent recreating them on each render
  // Using MutableRefObject to allow assigning values to current property
  const handleCopyPromptRef = useRef<(() => Promise<void>) | null>(null);
  const handleCopyFileBlockOutputRef = useRef<(() => Promise<void>) | null>(null);
  const handleAddFolderRef = useRef<(() => Promise<void>) | null>(null);
  const handleRefreshFoldersRef = useRef<(() => Promise<void>) | null>(null);

  // Helper to prevent rapid duplicate actions
  const shouldHandleAction = () => {
    const now = Date.now();
    if (now - lastActionTime < DEBOUNCE_TIME) {
      console.log('[MenuShortcuts] Debouncing action - too soon since last action');
      return false;
    }
    lastActionTime = now;
    return true;
  };

  // Function to flash a button element to provide visual feedback
  const flashButton = (buttonRef: React.RefObject<HTMLButtonElement>) => {
    if (!buttonRef.current) return;

    // Add active/pressed class
    buttonRef.current.classList.add('bg-gray-400', 'dark:bg-gray-500');

    // Remove class after short delay to create flash effect
    setTimeout(() => {
      if (buttonRef.current) {
        buttonRef.current.classList.remove('bg-gray-400', 'dark:bg-gray-500');
      }
    }, 150);
  };

  // Handle Copy Prompt action (Cmd+Shift+C)
  const handleCopyPrompt = useCallback(async () => {
    // Debounce to prevent duplicate actions
    if (!shouldHandleAction()) return;

    try {
      const promptString = await getFlattenedPrompt();
      await navigator.clipboard.writeText(promptString);
      console.log('[MenuShortcuts] Prompt copied to clipboard');
      showToast('Copied prompt to clipboard!', 'info');

      // Flash the Copy Prompt button
      flashButton(copyPromptBtnRef);
    } catch (err) {
      console.error('[MenuShortcuts] Failed to copy prompt:', err);
      showToast('Failed to copy prompt. See console.', 'error');
    }
  }, [getFlattenedPrompt, showToast]);

  // Handle Copy File Block Output action (Cmd+Alt+C)
  const handleCopyFileBlockOutput = useCallback(async () => {
    // Debounce to prevent duplicate actions
    if (!shouldHandleAction()) return;

    try {
      // First, ensure files are freshly loaded by refreshing folders
      await refreshFolders(projectFolders);
      console.log('[MenuShortcuts] Refreshed files before copying');

      let finalOutput = '';

      // For each project folder, generate the ASCII tree
      for (const folder of projectFolders) {
        const ascii = await generateAsciiTree([folder]);
        if (ascii) {
          finalOutput += ascii.trim() + '\n\n';
        }
      }

      // Now append all selected file entries
      const selectedEntries = getSelectedFileEntries();
      for (const entry of selectedEntries) {
        finalOutput += `<file_contents>\nFile: ${entry.path}\n\`\`\`${entry.language}\n${entry.content}\n\`\`\`\n</file_contents>\n\n`;
      }

      // Copy to clipboard
      await navigator.clipboard.writeText(finalOutput.trim());
      console.log('[MenuShortcuts] Copied file block output to clipboard.');
      showToast('Copied file block output to clipboard!', 'info');

      // Flash the Copy File Block Output button
      flashButton(copyFileBlockBtnRef);
    } catch (err) {
      console.error('[MenuShortcuts] Failed to copy file block output:', err);
      showToast('Failed to copy file block output. See console.', 'error');
    }
  }, [projectFolders, getSelectedFileEntries, showToast, refreshFolders]);

  // Handle Add Folder action (Cmd+O)
  const handleAddFolder = useCallback(async () => {
    // Debounce to prevent duplicate actions
    if (!shouldHandleAction()) return;

    try {
      const result = await showOpenDialog({
        properties: ['openDirectory'],
        title: 'Select Project Folder',
      });

      if (!result || result.canceled || !result.filePaths || result.filePaths.length === 0) {
        console.log('[MenuShortcuts] Folder selection canceled');
        return;
      }

      const folderPath = result.filePaths[0];
      await addProjectFolder(folderPath);
      console.log('[MenuShortcuts] Added folder:', folderPath);
    } catch (err) {
      console.error('[MenuShortcuts] Failed to add folder:', err);
      showToast('Failed to add folder. See console.', 'error');
    }
  }, [addProjectFolder, showToast]);

  // Handle Refresh Folders action (Cmd+R)
  const handleRefreshFolders = useCallback(async () => {
    // Debounce to prevent duplicate actions
    if (!shouldHandleAction()) return;

    try {
      await refreshFolders(projectFolders);
      console.log('[MenuShortcuts] Refreshed project folders');
      showToast('Refreshed project folders', 'info');

      // Flash the Refresh Folders button
      flashButton(refreshFoldersBtnRef);
    } catch (err) {
      console.error('[MenuShortcuts] Failed to refresh folders:', err);
      showToast('Failed to refresh folders. See console.', 'error');
    }
  }, [projectFolders, refreshFolders, showToast]);

  // Update our refs with the latest callbacks
  useEffect(() => {
    handleCopyPromptRef.current = handleCopyPrompt;
    handleCopyFileBlockOutputRef.current = handleCopyFileBlockOutput;
    handleAddFolderRef.current = handleAddFolder;
    handleRefreshFoldersRef.current = handleRefreshFolders;
  }, [handleCopyPrompt, handleCopyFileBlockOutput, handleAddFolder, handleRefreshFolders]);

  useEffect(() => {
    // Skip registration if already registered (prevents StrictMode double registration)
    if (isRegistered) {
      console.log('[MenuShortcuts] Skipping duplicate registration - already registered');
      return;
    }

    // Event handler wrappers that use the refs
    const copyPromptHandler: MessageHandler = (event, data) => {
      console.log(`[MenuShortcuts] Received copy-prompt event ID: ${data?.eventId || 'unknown'}`);
      if (handleCopyPromptRef.current) {
        handleCopyPromptRef.current();
      }
    };

    const copyFileBlockHandler: MessageHandler = (event, data) => {
      console.log(
        `[MenuShortcuts] Received copy-file-block-output event ID: ${data?.eventId || 'unknown'}`
      );
      if (handleCopyFileBlockOutputRef.current) {
        handleCopyFileBlockOutputRef.current();
      }
    };

    const addFolderHandler: MessageHandler = (event, data) => {
      console.log(`[MenuShortcuts] Received add-folder event ID: ${data?.eventId || 'unknown'}`);
      if (handleAddFolderRef.current) {
        handleAddFolderRef.current();
      }
    };

    const refreshFoldersHandler: MessageHandler = (event, data) => {
      console.log(
        `[MenuShortcuts] Received refresh-folders event ID: ${data?.eventId || 'unknown'}`
      );
      if (handleRefreshFoldersRef.current) {
        handleRefreshFoldersRef.current();
      }
    };

    // Set up IPC listeners for menu shortcut actions
    console.log('[MenuShortcuts] Setting up event listeners');

    const copyPromptAdded = addIpcListener('copy-prompt', copyPromptHandler);
    const copyFileBlockAdded = addIpcListener('copy-file-block-output', copyFileBlockHandler);
    const addFolderAdded = addIpcListener('add-folder', addFolderHandler);
    const refreshFoldersAdded = addIpcListener('refresh-folders', refreshFoldersHandler);

    // Only mark as registered if at least one listener was successful
    if (copyPromptAdded || copyFileBlockAdded || addFolderAdded || refreshFoldersAdded) {
      isRegistered = true;
    }

    // Clean up listeners when component unmounts
    return () => {
      if (isRegistered) {
        console.log('[MenuShortcuts] Removing event listeners');

        removeIpcListener('copy-prompt', copyPromptHandler);
        removeIpcListener('copy-file-block-output', copyFileBlockHandler);
        removeIpcListener('add-folder', addFolderHandler);
        removeIpcListener('refresh-folders', refreshFoldersHandler);

        // Reset registration flag
        isRegistered = false;
      }
    };
  }, []); // Empty dependency array - this effect runs once on mount and cleanup on unmount

  return (
    <MenuShortcutsContext.Provider
      value={{
        copyPromptBtnRef,
        copyFileBlockBtnRef,
        refreshFoldersBtnRef,
      }}
    >
      {children}
    </MenuShortcutsContext.Provider>
  );
};
