/\*\*

- @file README.md
- @description
- Overview of the `src` folder in Prompt Composer.
-
- The `src` directory holds React + TypeScript code for:
- - components/: React components (PromptBuilder, Sidebar, block editors, etc.)
- - context/: Context providers (ProjectContext, PromptContext, etc.) for app-wide state
- - types/: Shared TypeScript definitions for blocks and electron APIs
- - utils/: Helper modules for token estimation, template parsing, flattening, file tree building, etc.
- - main.tsx/App.tsx: App entry points, rendering the layout with ThemeProvider, ProjectProvider, PromptProvider
-
- Key Points:
- - The UI is built with React hooks and contexts.
- - A "template-first" design: we parse placeholders from a template to create or update blocks.
- - Raw edit mode allows advanced users to modify the entire template text at once.
- - There's no direct "Add Block" or "Remove Block" UI. Blocks are purely determined by placeholders.
- - .promptignore merges with .gitignore to filter the file tree in ProjectContext.
    \*/

# Prompt Composer: `src` Folder

This folder contains the React-based front-end code for Prompt Composer:

- **components/**

  - UI elements (Builder, Sidebar, Editors, etc.)

- **context/**

  - Global state using React Context (ProjectContext, PromptContext, ThemeContext, ToastContext).

- **types/**

  - Type definitions for blocks, electron APIs, etc.

- **utils/**

  - Template parsing, file map generation, token estimation, other shared utilities.

- **App.tsx / main.tsx**
  - Main layout and rendering pipeline.
  - Combined with providers for theme, project, prompt, and toast notifications.

---
