# Prompt Composer

Prompt Composer is a desktop application (Electron + React + TypeScript) designed for working with **structured AI prompts** using **templates**, **inline user text blocks**, **file references**, and **saved prompt responses** stored in dedicated files in your `/.prompt-composer` folders.

Inspired by the prompts at [Takeoff AI](https://www.jointakeoff.com/prompts) and [Repo Prompt](https://repoprompt.com) with even more focus, it allows you to mix templates and dynamic inputs to create better prompts. To that end, this application supports different kinds of restrictions on content editing to improve consistency and to reduce copy and paste operations during AI assisted development.

The primary focus of this workflow is code. To support that, there is a dedicated way to add the contents of your text-based files into your prompts. (You can also just copy the files selected in the file tree.)

The workflow is initially designed around OpenAI's o1 pro model. Its 100k token context is the first time that I've been convinced you can begin to tackle more complex projects through AI development: **this app was built using the process it supports.**

It's currently aiming at OSX/Linux support, but it should be easily adaptable to a Windows environment.

## Why?

**Prompt Composer** attempts to reduce the friction around working with prompt scaffolding to make it easier to be consistent from a UX perspective.

AI work processes are strongest when you have substantial structure and consistency in your requests; the more you are able to reinforce goals and outcome, the stronger the results.

## Key Features

- **Template-First Workflow**:

  - When you select a template (from `.txt` or `.md` files in both project and global `/.prompt-composer` folders), Prompt Composer loads that file and **fully inlines** any nested template references like `{{ANOTHER_TEMPLATE}}`.
  - Special placeholders in the template text (`{{TEXT_BLOCK=...}}`, `{{FILE_BLOCK}}`, and `{{PROMPT_RESPONSE=filename.txt}}`) are recognized and rendered as their respective special text blocks.

- **Raw Edit Mode**:

  - Each template can be **raw edited** as a single text body. You can click the "Edit All as Raw" pencil icon to see the entire in-memory template.
  - Confirming your changes re-parses the template and updates the recognized blocks. This is how you add/remove placeholders.

- **Prompt Response Blocks**:

  - `{{PROMPT_RESPONSE=filename.txt}}` placeholders create a locked text area whose contents are loaded from and saved to `/.prompt-composer/filename.txt`.
  - They remain locked while the template is in raw edit mode, but are individually editable outside raw edit mode.

- **File Tree & .promptignore**:

  - The left sidebar shows your project folders and their contents, merging `.gitignore` and `.promptignore` to filter files.
  - You can tri-state select files (none, partial, all) that are included in the File Block.

- **File Block**:

  - A `{{FILE_BLOCK}}` tag indicates where a "File Block" goes. This block references the file tree on the left sidebar.
  - There's a checkbox to include or exclude the ASCII file map in the final prompt output.

- **Copy File Block Output**:

  - A button in the sidebar copies the ASCII file map plus selected file contents, so you can quickly paste them into a final prompt or other documents.

- **Token Estimation**:

  - Both the file tree and the prompt editor show total token estimates.
  - Currently it only checks against 100k limit using tiktoken for the 4o tokenizer.

- **Light/Dark Mode UI**:

  - The icon in the bottom right will allow you to toggle the appearance of the UI.

---

## Installation & Development

1. **Clone the Repository**  
   `git clone https://github.com/yourusername/prompt-composer.git && cd prompt-composer`

2. **Install Dependencies**  
   `npm install`

3. **Development Mode**  
   `npm run start:dev`  
   This runs a local Vite server on http://localhost:3000, compiles the Electron main process, and launches Electron with dev tools.

4. **Add Templates**
   The application is looking for templates in `~/.prompt-composer`. (Check out the prompts at [Takeoff AI](https://www.jointakeoff.com/prompts). I've found them to be very useful. [This video](https://www.youtube.com/watch?v=RLs-XUjmAfc) provides an explanation for their intended uses.)

### Directory Structure

- **electron-main**:  
  Electron main process code (window creation, IPC handlers, merging `.promptignore`, file I/O).

- **public**:  
  Static assets for Vite.

- **src**:  
  React + TypeScript code for the renderer (components, contexts, utilities).

- **dist**:  
  Output from `npm run build`.

- **/.prompt-composer**:  
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
   - Use `.promptignore` in your `/.prompt-composer` folder to hide additional unwanted files (beyond `.gitignore`).

2. **Select a Template**

   - If `.txt` or `.md` files exist in either project or global `/.prompt-composer` folders, they're listed as "Available Templates".
   - Prompt Composer will prefer project specific files over global versions, so you can create project specific versions of templates without modifying core templates.

3. **Raw Edit & Placeholders**

   - Click the pencil icon to "Edit All as Raw" if you want to change template scaffolding text.
   - Insert `{{TEXT_BLOCK=...}}` to create user-editable text blocks, `{{FILE_BLOCK}}` to embed the selected files, and `{{PROMPT_RESPONSE=someFile.txt}}` for a dedicated prompt response.

4. **Selecting Files**

   - Expand your folder in the sidebar, tri-state select which files to include. The `{{FILE_BLOCK}}` block will automatically reflect your selection and include the text of any selected files.
   - Optionally include an ASCII file map of your project.

5. **Copy Only the File Block Output**

   - Use the "Copy File Block Output" button in the sidebar to copy the ASCII file map plus selected file contents to your clipboard.

6. **Copy Prompt**

   - Easily copy your prompt for usage in your AI package of choice.

---

## What's next?

- Add some new user experience.
- Offer the user the options to save some default templates to the global `/.prompt-composer` folder.
- Add some settings to select the tokenizer and to save the UI style preference.
- Make the application OS agnostic.

---

## Contributing

Open issues / pull requests for bugs or feature requests. This is an early-stage, local-only tool without user authentication or cloud integration.

## Licenses

[MIT License](https://opensource.org/license/mit)
[Lucide License](https://lucide.dev/license)

---
