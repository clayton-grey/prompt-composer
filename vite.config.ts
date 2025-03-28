/**
 * @file Vite Configuration
 * @description Configures Vite to bundle the React application. Additional
 * settings (e.g., custom alias, plugins) can be added here.
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// NEW: import wasm plugin & top-level-await plugin
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig({
  plugins: [
    react(),
    wasm(),
    topLevelAwait()
  ],
  root: '.',
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
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  optimizeDeps: {
    include: ['@dqbd/tiktoken'],
    esbuildOptions: {
      target: 'es2020'
    }
  },
  esbuild: {
    target: 'es2020'
  },
  server: {
    port: 3000,
    strictPort: true,
    hmr: {
      port: 3001
    },
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' blob:; worker-src 'self' blob:; child-src 'self' blob:; connect-src 'self' blob:;"
    }
  }
});
 