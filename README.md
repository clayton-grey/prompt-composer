
/**
 * @file README.md
 * @description
 * The main README for the Prompt Composer project, providing
 * documentation on setup, usage, building, and packaging.
 *
 * Final Cleanup (Step 11):
 *  - Introduced a consolidated README to guide end users on how to
 *    install, run, and package the application with electron-builder.
 */

/*
################################################################################
# Prompt Composer - Main Project README
################################################################################

Welcome to **Prompt Composer**, a desktop-focused Electron + React application
designed for building structured, reusable prompts for AI-assisted workflows.
This README provides instructions for setup, development, and packaging.
*/

# Prompt Composer

Prompt Composer is a desktop application for creating modular AI prompts that
can include text blocks, template blocks with variables, and file contents. It
offers real-time token estimation, tri-state file selection, and import/export
of prompt flows in XML.

---

## Features Overview

- **Tri-State File Browser**: Add folders and selectively include text-based files
  while ignoring .gitignore patterns.
- **Prompt Builder**: Create and reorder text blocks, template blocks, and a single
  file block. Toggle an optional ASCII map (now removed from the default UI).
- **Token Estimation**: Real-time approximate token usage per block and total.
- **Export/Import**: Save the entire composition as an XML file. Re-import to
  restore your block configuration.
- **Plain Text Prompt**: Flatten all blocks into a final prompt with special
  `<file_contents>` sections for file code.

---

## Installation & Development

1. **Clone the Repository**  
   ```bash
   git clone https://github.com/yourusername/prompt-composer.git
   cd prompt-composer
Install Dependencies
npm install
This will install both Electron and React (via Vite) dependencies.
Development Mode
npm run start:dev
Spawns a local Vite dev server on http://localhost:3000
Compiles the Electron main process, and launches Electron in dev mode
Opens dev tools automatically
Directory Structure
electron-main: The Electron main process (IPC handlers, window creation, etc.)
src: React + TypeScript code for the renderer
public: Static assets for the Vite build
dist: Compiled output for the renderer and Electron main
release: Output folder when building a distributable with electron-builder

Building & Packaging

Production Build
npm run build
Runs vite build to create the optimized renderer bundle in dist/
Compile Electron
npm run compile-electron
Transpiles the Electron main process code into dist/electron-main
Package with electron-builder
npm run build:electron
Generates a packaged application (AppImage, DMG, EXE, etc.) depending on your operating system and electron-builder config in package.json
Artifacts are placed in release/
All-in-One
npm run dist:all
Shortcut that runs the React build and Electron compilation, then triggers electron-builder to produce final binaries.
Usage

After launching the app (in dev or production mode), you'll see:

Top Bar: Contains the app title, theme toggle, export/import XML, and "Copy Prompt" button.
Sidebar: Add or remove folders, tri-state toggle files you want to include in your prompt.
Prompt Builder: Add text/template blocks, create or update the file block, reorder them.
Bottom Bar: Shows real-time token usage vs. your max token limit.
When you're satisfied, you can:

Copy the flattened prompt to your clipboard (Top Bar => "Copy Prompt").
Export the entire composition to XML, for later re-import or sharing.
Contributing

Feel free to open issues and pull requests for bug fixes or feature requests. This is an early-stage, offline-focused tool with no user authentication or cloud back-end.

License

MIT License (or your chosen license). Use, modify, and distribute freely with attribution.

