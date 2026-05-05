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
 * Only supports hex colors, rgb/rgba colors, and linear-gradient values.
 * Returns an empty object for unrecognised formats.
 */
export const getCustomBackgroundStyle = (
  background: string
): React.CSSProperties => {
  if (!isCustomBackground(background)) {
    return {};
  }
  const value = background.slice('custom:'.length).trim();
  if (/^#([0-9a-fA-F]{3}){1,2}$/.test(value)) {
    return { backgroundColor: value };
  }
  if (/^rgba?\(.*\)$/.test(value)) {
    return { backgroundColor: value };
  }
  if (/^linear-gradient\(.*\)$/.test(value)) {
    return { background: value };
  }
  return {};
};
