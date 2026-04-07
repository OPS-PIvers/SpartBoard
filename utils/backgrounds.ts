import type React from 'react';

/**
 * Returns true if the background value is an external URL or data URI
 * (i.e. an image, YouTube link, or Drive URL) rather than a Tailwind class string.
 */
export const isExternalBackground = (background: string): boolean =>
  background.startsWith('http') ||
  background.startsWith('data:') ||
  background.startsWith('blob:');

/**
 * Returns true if the background uses the custom: prefix convention for
 * user-created colors/gradients that can't be Tailwind classes.
 */
export const isCustomBackground = (background: string): boolean =>
  background.startsWith('custom:');

/**
 * Converts a custom: background string to inline CSS properties.
 * - `custom:#ff5500` → { backgroundColor: '#ff5500' }
 * - `custom:linear-gradient(...)` → { background: 'linear-gradient(...)' }
 */
export const getCustomBackgroundStyle = (
  background: string
): React.CSSProperties => {
  const value = background.slice('custom:'.length);
  if (value.startsWith('#') || value.startsWith('rgb')) {
    return { backgroundColor: value };
  }
  return { background: value };
};
