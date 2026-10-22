import type { Config } from 'tailwindcss';
import rootConfig from '../../tailwind.config.js';

const root = new URL('../../', import.meta.url).pathname;

// The app's theme, scanned only over the overlay and the tour components it reuses.
export default {
  presets: [rootConfig],
  content: [
    `${root}extension/src/overlay/**/*.{ts,tsx}`,
    `${root}components/tours/Tour{Bar,Spotlight,Tip}.tsx`,
    `${root}components/common/lightChrome.ts`,
  ],
} satisfies Config;
