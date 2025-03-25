"use strict";
/**
 * @file main.ts
 * @description
 * Main entry point for the Electron application. Creates the main BrowserWindow,
 * loads the React frontend, and sets Content-Security-Policy to reduce dev warnings.
 *
 * We confirm the final compiled preload is located at dist/electron-main/preload.js,
 * referencing it via __dirname + 'preload.js'.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const process = __importStar(require("process"));
const ipcHandlers_1 = require("./ipcHandlers");
let mainWindow = null;
/**
 * Creates the main application window with specified settings.
 */
function createWindow() {
    // After building, we expect: dist/electron-main/preload.js
    // so __dirname is dist/electron-main, and we add 'preload.js'
    const preloadPath = path_1.default.join(__dirname, 'preload.js');
    console.log('[Electron Main] Using preload script at:', preloadPath);
    mainWindow = new electron_1.BrowserWindow({
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
    }
    else {
        // Production: load the built index.html from dist
        const indexHtmlPath = path_1.default.join(__dirname, '..', 'index.html');
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
electron_1.app.whenReady().then(() => {
    createWindow();
    // Register your IPC handlers
    (0, ipcHandlers_1.registerIpcHandlers)();
    // On macOS, re-open a window on activate event if no windows
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
    // Basic CSP for dev
    electron_1.session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
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
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
