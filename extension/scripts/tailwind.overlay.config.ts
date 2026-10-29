import { fileURLToPath } from 'node:url';
import type { Config } from 'tailwindcss';
import rootConfig from '../../tailwind.config.js';

// URL.pathname is /C:/... on Windows, which matches no files; globs also need forward slashes.
const root = fileURLToPath(new URL('../../', import.meta.url)).replace(
  /\\/g,
  '/'
);

// The app's theme, scanned only over the overlay, the extension pages and the tour components it reuses.
export default {
  presets: [rootConfig],
  content: [
    `${root}extension/src/overlay/**/*.{ts,tsx}`,
    `${root}extension/src/sidepanel/**/*.{ts,tsx}`,
    `${root}extension/src/focus/**/*.{ts,tsx}`,
    `${root}components/tours/Tour{Bar,Spotlight,Tip}.tsx`,
    `${root}components/common/lightChrome.ts`,
    `${root}components/tours/web/BlurBoxes.tsx`,
  ],
} satisfies Config;
