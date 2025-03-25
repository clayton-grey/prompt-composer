/**
 * @file Vite Configuration
 * @description Configures Vite to bundle the React application. Additional
 * settings (e.g., custom alias, plugins) can be added here.
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: '.', // The default root is the project folder
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html')
      }
    }
  },
  server: {
    port: 3000
  }
});
