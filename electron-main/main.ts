
/**
 * @file main.ts
 * @description
 * Main entry point for the Electron application. Creates the main BrowserWindow,
 * loads the React frontend, and sets Content-Security-Policy to reduce dev warnings.
 *
 * We confirm the final compiled preload is located at dist/electron-main/preload.js,
 * referencing it via __dirname + 'preload.js'.
 */

import { app, BrowserWindow, session } from 'electron';
import path from 'path';
import * as process from 'process';
import { registerIpcHandlers } from './ipcHandlers';

let mainWindow: BrowserWindow | null = null;

/**
 * Creates the main application window with specified settings.
 */
function createWindow(): void {
  // After building, we expect: dist/electron-main/preload.js
  // so __dirname is dist/electron-main, and we add 'preload.js'
  const preloadPath = path.join(__dirname, 'preload.js');
  console.log('[Electron Main] Using preload script at:', preloadPath);

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Prompt Composer',
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    // Production: load the built index.html from dist
    const indexHtmlPath = path.join(__dirname, '..', 'index.html');
    console.log('Loading production file from:', indexHtmlPath);
    mainWindow.loadFile(indexHtmlPath).catch(err => {
      console.error('Failed to load index.html:', err);
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Electron ready
app.whenReady().then(() => {
  createWindow();
  // Register your IPC handlers
  registerIpcHandlers();

  // On macOS, re-open a window on activate event if no windows
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  // Basic CSP for dev
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const csp = "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' blob:; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://localhost:* http://localhost:*; img-src 'self' data:; media-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'self' blob:; child-src 'self' blob:;";
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp]
      }
    });
  });
});

// Quit on all windows closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
