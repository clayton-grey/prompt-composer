
/**
 * @file README.md
 * @description
 * Primary README for the Prompt Composer project. Reflects the final architecture where:
 *  - The UI no longer has buttons for adding blocks directly.
 *  - Blocks are recognized by special tags in a loaded template ({{TEXT_BLOCK=...}}, {{FILE_BLOCK}}, {{PROMPT_RESPONSE=...}}).
 *  - A .promptignore file can exclude paths from the file tree beyond .gitignore.
 *  - We have raw edit mode for the entire template text.
 *  - A "Copy File Block Output" button in the sidebar can copy the ASCII file map + selected file contents.
 *
 * Key Updates in Step 8:
 *  1. Removed references to old block-adding UI elements.
 *  2. Documented the raw edit mode, .promptignore usage, and new file block output copying.
 *  3. Provided final instructions on how to get started, run, and build the app.
 */

# Prompt Composer

Prompt Composer is a desktop application (Electron + React) designed for building **structured AI prompts** using **templates**, **inline user text blocks**, **file references**, and **prompt responses** stored in dedicated `.prompt-composer` files. 

## Key Features

- **Template-First Workflow**:
  - When you select a template (from `.txt` or `.md` files in `.prompt-composer`), Prompt Composer loads that file and **fully inlines** any nested template references like `{{ANOTHER_TEMPLATE}}`. 
  - Special placeholders in the template text (`{{TEXT_BLOCK=...}}`, `{{FILE_BLOCK}}`, and `{{PROMPT_RESPONSE=filename.txt}}`) are recognized and rendered as respective blocks.

- **Raw Edit Mode**:
  - Each template can be **raw edited** as a single text body. You can click the "Edit All as Raw" pencil icon to see the entire in-memory template. 
  - Confirming your changes re-parses the template and updates the recognized blocks. This is how you add/remove placeholders.

- **Prompt Response Blocks**:
  - `{{PROMPT_RESPONSE=filename.txt}}` placeholders create a locked text area whose contents are loaded from and saved to `.prompt-composer/filename.txt`.
  - They remain locked while the template is in raw edit mode, but are individually editable outside raw edit mode.

- **File Block**:
  - A `{{FILE_BLOCK}}` tag indicates where a "File Block" goes. This block references the file tree on the left sidebar. 
  - There's a checkbox to include or exclude the ASCII file map in the final prompt output.

- **No More "Add Block" Buttons**:
  - We do not directly add text/file blocks from the UI. Blocks appear because the template text has placeholders.

- **File Tree & .promptignore**:
  - The left sidebar shows your project folders and their contents, merging `.gitignore` and `.promptignore` to filter files.
  - You can tri-state select files (none, partial, all) that are included in the File Block.

- **Copy File Block Output**:
  - A button in the sidebar copies the ASCII file map plus selected file contents, so you can quickly paste them into a final prompt or other documents.

---

## Installation & Development

1. **Clone the Repository**  
   `git clone https://github.com/yourusername/prompt-composer.git && cd prompt-composer`

2. **Install Dependencies**  
   `npm install`

3. **Development Mode**  
   `npm run start:dev`  
   This runs a local Vite server on http://localhost:3000, compiles the Electron main process, and launches Electron with dev tools.

### Directory Structure

- **electron-main**:  
  Electron main process code (window creation, IPC handlers, merging `.promptignore`, file I/O).

- **public**:  
  Static assets for Vite.

- **src**:  
  React + TypeScript code for the renderer (components, contexts, utilities).

- **dist**:  
  Output from `npm run build`.

- **.prompt-composer**:  
  Folder for storing template files (`.txt`, `.md`) and prompt response files (like `myResponse.txt`).

---

## Building & Packaging

- **Production Build**  
  `npm run build`  
  This compiles the React app into `dist/`.

- **Compile Electron**  
  `npm run compile-electron`  
  Transpiles the Electron main process into `dist/electron-main`.

- **Package**  
  `npm run build:electron`  
  Uses `electron-builder` to package the app (DMG, EXE, etc.) in the `release` folder.

- **All-in-One**  
  `npm run dist:all`

---

## Usage Overview

1. **Add a Project Folder**  
   - Click "Add Folder" in the sidebar to choose your project's root folder.  
   - Use `.promptignore` in `.prompt-composer` to hide additional unwanted files (beyond `.gitignore`).

2. **Select or Create a Template**  
   - If `.txt` or `.md` files exist in `.prompt-composer`, they're listed as "Available Templates".
   - Click one to load it. Or create a new file in `.prompt-composer`, then refresh.

3. **Raw Edit & Placeholders**  
   - Click the pencil icon to "Edit All as Raw" if you want to change placeholders or text. 
   - Insert `{{TEXT_BLOCK=...}}` to create user-editable text blocks, `{{FILE_BLOCK}}` to embed the selected files, and `{{PROMPT_RESPONSE=someFile.txt}}` for a dedicated prompt response.

4. **Selecting Files**  
   - Expand your folder in the sidebar, tri-state select which files to include. The `{{FILE_BLOCK}}` block will automatically reflect your selection.

5. **Copy File Block Output**  
   - Use the "Copy File Block Output" button in the sidebar to copy the ASCII file map plus selected file contents to your clipboard.

6. **Export / Import**  
   - Export your entire composition to XML, or import from XML later to restore.

---

## Contributing

Open issues / pull requests for bugs or feature requests. This is an early-stage, local-only tool without user authentication or cloud integration.

## License

[MIT License](LICENSE)

---
