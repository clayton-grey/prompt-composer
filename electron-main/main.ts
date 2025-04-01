/**
 * @file main.ts
 * @description
 * Main entry point for the Electron application. Creates the main BrowserWindow,
 * loads the React frontend, and sets Content-Security-Policy to reduce dev warnings.
 *
 * We confirm the final compiled preload is located at dist/electron-main/preload.js,
 * referencing it via __dirname + 'preload.js'.
 *
 * Changelog (Step 1: Debug/Perf enhancements):
 *  - Added extra console logs for environment and process version info at startup, 
 *    to help diagnose distribution build issues.
 */

import { app, BrowserWindow, session, dialog, shell } from 'electron';
import path from 'path';
import * as process from 'process';
import { registerIpcHandlers } from './ipcHandlers';
import fs from 'fs';
import * as os from 'os';

let mainWindow: BrowserWindow | null = null;

// Add additional debugging logs for diagnosing issues in packaged builds
const DEBUG_PROD = process.env.DEBUG_PROD === 'true' || process.env.DEBUG_PROD === '1';

// Set up file logging
const logFile = path.join(os.homedir(), '.prompt-composer', 'app.log');
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

// Override console.log to write to both file and console
const originalLog = console.log;
console.log = (...args) => {
  const message = args.map(arg => 
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : arg
  ).join(' ');
  
  const timestamp = new Date().toISOString();
  logStream.write(`[${timestamp}] ${message}\n`);
  originalLog.apply(console, args);
};

// Override console.error to write to both file and console
const originalError = console.error;
console.error = (...args) => {
  const message = args.map(arg => 
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : arg
  ).join(' ');
  
  const timestamp = new Date().toISOString();
  logStream.write(`[${timestamp}] ERROR: ${message}\n`);
  originalError.apply(console, args);
};

// Override console.warn to write to both file and console
const originalWarn = console.warn;
console.warn = (...args) => {
  const message = args.map(arg => 
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : arg
  ).join(' ');
  
  const timestamp = new Date().toISOString();
  logStream.write(`[${timestamp}] WARN: ${message}\n`);
  originalWarn.apply(console, args);
};

// Ensure the log directory exists
try {
  const logDir = path.dirname(logFile);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
} catch (err) {
  console.error('Failed to create log directory:', err);
}

/**
 * Initialize the global projectRoot value 
 * This is critical for consistent file path resolution in both dev and production mode
 */
function initializeProjectRoot() {
  try {
    // Get the app path - this will be the correct root in both dev and production
    const appPath = app.getAppPath();
    console.log(`[Electron Main] App path: ${appPath}`);
    
    // In production, the app path will be inside the .app bundle
    // We want to use the parent directory of the .app bundle as our project root
    let projectRoot: string;
    
    if (process.env.NODE_ENV === 'development') {
      // In development, use the current working directory
      projectRoot = process.cwd();
      console.log(`[Electron Main] Development mode - using cwd: ${projectRoot}`);
    } else {
      // In production, we need to handle the .app bundle case
      const appDir = path.dirname(appPath);
      console.log(`[Electron Main] App directory: ${appDir}`);
      
      // For macOS, check for .app bundle by looking for path components
      if (appPath.includes('.app/Contents/Resources')) {
        console.log('[Electron Main] Detected macOS .app bundle');
        
        // Extract the app bundle path from the app.asar path
        // Format: /path/to/App.app/Contents/Resources/app.asar
        const appPathParts = appPath.split('/');
        let appBundlePathParts = [];
        let foundApp = false;
        
        // Keep components until we find the .app directory
        for (const part of appPathParts) {
          appBundlePathParts.push(part);
          if (part.endsWith('.app')) {
            foundApp = true;
            break;
          }
        }
        
        if (foundApp) {
          const appBundleDir = appBundlePathParts.join('/');
          console.log(`[Electron Main] Found .app bundle at: ${appBundleDir}`);
          
          // Use the project directory (not just the directory containing the app bundle)
          // Go up two levels - one for the bundle itself and one more for the build directory
          const bundleParentDir = path.dirname(appBundleDir);
          console.log(`[Electron Main] Directory containing .app bundle: ${bundleParentDir}`);
          
          // Check if we're in a build directory like "release" or "dist" and go up one more level
          const parentDirName = path.basename(bundleParentDir);
          if (parentDirName === 'release' || parentDirName === 'mac' || parentDirName === 'dist') {
            projectRoot = path.dirname(bundleParentDir);
            console.log(`[Electron Main] Using project directory (parent of build dir): ${projectRoot}`);
          } else {
            projectRoot = bundleParentDir;
            console.log(`[Electron Main] Using directory containing .app bundle: ${projectRoot}`);
          }
        } else {
          console.log('[Electron Main] Could not extract .app path, falling back to cwd');
          projectRoot = process.cwd();
        }
      } else {
        // Not in a .app bundle, use the current directory
        projectRoot = process.cwd();
        console.log(`[Electron Main] Not in .app bundle, using cwd: ${projectRoot}`);
      }
    }
    
    // Verify we have access to the project root
    try {
      fs.accessSync(projectRoot, fs.constants.R_OK | fs.constants.W_OK);
      global.projectRoot = projectRoot;
      console.log(`[Electron Main] Verified access to project root: ${global.projectRoot}`);
    } catch (accessErr: any) {
      // Fall back to home directory if we can't access project root
      console.warn(`[Electron Main] No access to project root, falling back to home: ${accessErr.message}`);
      global.projectRoot = os.homedir();
    }
    
    // Create .prompt-composer directories
    const createPromptComposerDirs = (basePath: string) => {
      try {
        // Check if the basePath itself is accessible first
        try {
          fs.accessSync(basePath, fs.constants.R_OK | fs.constants.W_OK);
          console.log(`[Electron Main] Base path is accessible: ${basePath}`);
        } catch (baseErr) {
          console.error(`[Electron Main] Cannot access base path: ${basePath}`, baseErr);
          return false;
        }
        
        const promptComposerDir = path.join(basePath, '.prompt-composer');
        
        // Check if directory exists and create if needed
        try {
          fs.accessSync(promptComposerDir);
          console.log(`[Electron Main] Directory exists: ${promptComposerDir}`);
        } catch (accessErr) {
          // Directory doesn't exist, create it
          try {
            console.log(`[Electron Main] Creating directory: ${promptComposerDir}`);
            fs.mkdirSync(promptComposerDir, { recursive: true });
            
            // Double-check if creation succeeded
            try {
              fs.accessSync(promptComposerDir, fs.constants.R_OK | fs.constants.W_OK);
              console.log(`[Electron Main] Successfully created and verified directory: ${promptComposerDir}`);
            } catch (verifyErr) {
              console.error(`[Electron Main] Failed to verify created directory: ${promptComposerDir}`, verifyErr);
            }
          } catch (createErr) {
            console.error(`[Electron Main] Failed to create directory: ${promptComposerDir}`, createErr);
          }
        }
        
        return true;
      } catch (err) {
        console.error(`[Electron Main] Error initializing directories at ${basePath}:`, err);
        return false;
      }
    };
    
    // Create .prompt-composer directories in user's home first (as fallback)
    const homeDir = os.homedir();
    console.log(`[Electron Main] Setting up home directory templates: ${homeDir}`);
    const homeDirOk = createPromptComposerDirs(homeDir);
    
    // Then try project .prompt-composer directories
    if (global.projectRoot !== homeDir) {
      console.log(`[Electron Main] Setting up project directory templates: ${global.projectRoot}`);
      const projectDirOk = createPromptComposerDirs(global.projectRoot);
      
      // If project directory setup failed, force using home
      if (!projectDirOk && homeDirOk) {
        console.log(`[Electron Main] Project directory setup failed, forcing projectRoot to home`);
        global.projectRoot = homeDir;
      }
    }
    
    console.log(`[Electron Main] Final projectRoot path: ${global.projectRoot}`);
    
  } catch (err) {
    // Fall back to user's home directory if there was any error
    const homeDir = os.homedir();
    console.error(`[Electron Main] Error in initializeProjectRoot, falling back to home directory:`, err);
    global.projectRoot = homeDir;
    console.log(`[Electron Main] Using fallback projectRoot: ${global.projectRoot}`);
    
    // At minimum try to create directories in home
    try {
      const promptComposerDir = path.join(homeDir, '.prompt-composer');
      
      if (!fs.existsSync(promptComposerDir)) {
        console.log(`[Electron Main] Creating directory in fallback: ${promptComposerDir}`);
        fs.mkdirSync(promptComposerDir, { recursive: true });
      }
    } catch (fallbackErr) {
      console.error(`[Electron Main] Critical error: Failed to create directories in home:`, fallbackErr);
    }
  }
  
  // Debug logs for additional environment information
  if (DEBUG_PROD || process.env.NODE_ENV === 'development') {
    console.log(`[Electron Main] Environment: ${process.env.NODE_ENV}`);
    console.log(`[Electron Main] User home directory: ${os.homedir()}`);
    console.log(`[Electron Main] Temp directory: ${os.tmpdir()}`);
    console.log(`[Electron Main] App path: ${app.getAppPath()}`);
    console.log(`[Electron Main] Resource path: ${process.resourcesPath || 'undefined'}`);
    console.log(`[Electron Main] Current directory: ${process.cwd()}`);
    console.log(`[Electron Main] Final projectRoot: ${global.projectRoot}`);
  }
}

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
      contextIsolation: true,
    },
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    // In production: 
    // We do open devtools in detached mode for debugging final builds if needed
    mainWindow.webContents.openDevTools({ mode: 'detach' });
    // Production: load the built index.html from dist
    const indexHtmlPath = path.join(__dirname, '..', 'index.html');
    console.log('Loading production file from:', indexHtmlPath);
    mainWindow.loadFile(indexHtmlPath).catch(err => {
      console.error('Failed to load index.html:', err);
      
      // Show a dialog if we can't load the index.html file
      dialog.showErrorBox(
        'Error Loading Application',
        `Failed to load the application: ${err}\n\n` +
        `Path: ${indexHtmlPath}\n` +
        `Cwd: ${process.cwd()}\n` +
        `Readable: ${fs.existsSync(indexHtmlPath) ? 'Yes' : 'No'}`
      );
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Prevent the default behavior of opening a new window when clicking on links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// Electron ready
app.whenReady().then(() => {
  // Enable debug mode for production (helps diagnose issues)
  if (process.env.NODE_ENV !== 'development') {
    process.env.DEBUG_PROD = '1';
  }

  // Log some environment details to help debug distribution builds
  console.log('[Electron Main] Starting in', process.env.NODE_ENV, 'mode.');
  console.log('[Electron Main] Node version:', process.version);
  console.log('[Electron Main] Chrome version:', process.versions.chrome);
  console.log('[Electron Main] Electron version:', process.versions.electron);
  console.log('[Electron Main] Platform:', process.platform, 'Arch:', process.arch);
  console.log('[Electron Main] Current directory:', process.cwd());
  console.log('[Electron Main] App path:', app.getAppPath());
  console.log('[Electron Main] Resource path:', process.resourcesPath);
  
  // Initialize project root before other operations
  initializeProjectRoot();
  
  createWindow();
  // Register your IPC handlers
  registerIpcHandlers();

  // Create a main menu that includes a Reload option
  const { Menu } = require('electron');
  
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Quit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => app.quit()
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: (_item: any, focusedWindow: any) => {
            if (focusedWindow) {
              // Reset project root before reload
              global.projectRoot = null;
              // @ts-ignore - Ignore the type check for the global templateCache
              global.templateCache = {};
              // Initialize project root again
              initializeProjectRoot();
              // Reload the window
              focusedWindow.reload();
            }
          }
        },
        {
          label: 'Toggle Developer Tools',
          accelerator: process.platform === 'darwin' ? 'Alt+Command+I' : 'Ctrl+Shift+I',
          click: (_item: any, focusedWindow: any) => {
            if (focusedWindow) {
              focusedWindow.webContents.toggleDevTools();
            }
          }
        }
      ]
    }
  ];
  
  // @ts-ignore - Menu.buildFromTemplate type issue
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  // On macOS, re-open a window on activate event if no windows
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  // Basic CSP for dev
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const csp =
      "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' blob:; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://localhost:* http://localhost:*; img-src 'self' data:; media-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'self' blob:; child-src 'self' blob:;";
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });
});

// Quit on all windows closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
