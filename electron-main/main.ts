/**
 * @file main.ts
 * @description
 * This file is the main entry point for the Electron application. It creates
 * the main BrowserWindow and handles all top-level app events such as
 * 'window-all-closed' and 'activate' for macOS.
 *
 * Key Responsibilities:
 *  - Create and manage the main application window
 *  - Load the React frontend (from dev server in development, or from
 *    built files in production)
 *  - Handle lifecycle events like app ready, window closed, etc.
 *
 * @notes
 *  - We conditionally load from "http://localhost:3000" when in development
 *    to enable live reload of the React app.
 *  - In production, we load the built index.html output from the
 *    dist folder generated by Vite.
 *  - We enable contextIsolation and disable nodeIntegration for security.
 *  - This file depends on the "preload.ts" script for safe bridging to the
 *    renderer if needed.
 */

import { app, BrowserWindow } from 'electron';
import path from 'path';
import * as process from 'process';

let mainWindow: BrowserWindow | null = null;

/**
 * Creates the main application window with specified settings.
 * Loads the appropriate URL depending on whether it's dev or prod.
 */
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Prompt Composer',
    webPreferences: {
      // preload script path references the compiled JS if you're using TS
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // If developing, load from local dev server
  // If building for production, load the local dist index.html
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load from the Vite-built dist directory
    const indexHtmlPath = path.join(__dirname, '..', '..', 'dist', 'index.html');
    console.log('Loading production file from:', indexHtmlPath);
    mainWindow.loadFile(indexHtmlPath).catch(err => {
      console.error('Failed to load index.html:', err);
      console.log('Current directory:', __dirname);
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Electron `ready` event listener
app.whenReady().then(() => {
  createWindow();

  // On macOS, it's common to recreate a window when the doc icon is clicked
  // and there are no other windows open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
