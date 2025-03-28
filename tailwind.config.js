// tailwind.config.js
/**
 * @file Tailwind CSS configuration
 * @description This file configures Tailwind CSS for utility-first styling.
 * It includes paths to all React (JS/TS/TSX/JSX) files in the src/ directory
 * and any other relevant paths. Also handles dark mode toggling via class.
 *
 * @notes
 *  - For dark mode, use the 'class' strategy and toggle a 'dark' class on <html> or <body>.
 */

module.exports = {
  darkMode: 'class',
  content: [
    './index.html',
    './public/index.html',
    './src/**/*.{js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {}
  },
  plugins: []
};
      