
/**
 * @file electron-main/README.md
 * @description
 * Documentation for the Electron main process in Prompt Composer.
 *
 * The `electron-main` folder contains:
 *  - main.ts: Creates the Electron BrowserWindow, loads React in dev or prod mode, and sets up basic CSP.
 *  - preload.ts: Exposes our `window.electronAPI` bridging for the renderer to safely call main-process file I/O.
 *  - ipcHandlers.ts: Implements the IPC logic for reading directories, merging .gitignore + .promptignore, verifying file existence, listing template files, reading/writing .prompt-composer files, etc.
 *
 * Responsibilities:
 *  - Spin up the Electron window with the built or dev server content.
 *  - Provide and handle IPC channels for reading/writing project data.
 *  - Merge `.promptignore` with `.gitignore` for ignoring files in the file tree.
 *  - Manage open/save dialogs for XML export/import.
 *
 * Developer Notes:
 *  - This code is built separately (electron.tsconfig.json -> dist/electron-main).
 *  - The react code is built by `vite` into `dist/`, then packaged together by electron-builder for distribution.
 *
 * Typical Flow:
 *  - The React front-end uses `window.electronAPI...` to request directory listings or read files.
 *  - The main process (ipcHandlers) merges ignore rules, reads from the filesystem, and returns data to the renderer.
 */
# electron-main Folder

Inside this folder:

- **main.ts**  
  - Entry point. Creates the main BrowserWindow, configures dev tools, sets the content security policy, and loads index.html or http://localhost:3000.

- **preload.ts**  
  - Bridges the renderer and main process. Exposes a safe `electronAPI` object with typed methods for listing directories, reading/writing files, verifying existence, etc.

- **ipcHandlers.ts**  
  - The core logic for ignoring files with `.promptignore` + `.gitignore`, listing directories, reading/writing `.prompt-composer` files, verifying if a file exists, etc.

---
