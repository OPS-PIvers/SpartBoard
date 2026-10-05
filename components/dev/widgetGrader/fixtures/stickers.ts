import { defineFixtures } from './types';
import { STRESS } from './stress';

const SWATCH = (hue: number): string =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><circle cx="60" cy="60" r="54" fill="hsl(${hue} 70% 55%)"/></svg>`
  )}`;

export const stickersFixtures = defineFixtures<'stickers'>({
  empty: { config: {} },
  typical: {
    config: { uploadedUrls: [0, 60, 120, 200, 280].map(SWATCH) },
  },
  stress: {
    customTitle: STRESS.title,
    config: {
      uploadedUrls: Array.from({ length: STRESS.itemCount }, (_, i) =>
        SWATCH((i * 37) % 360)
      ),
    },
  },
});
