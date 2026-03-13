export const GAP_STYLE = 'min(10px, 2cqmin)';

/** Converts a hex color + alpha into an rgba() CSS string. */
export const hexToRgba = (hex: string, alpha: number): string => {
  const clean = (hex ?? '#ffffff').replace('#', '');
  const a =
    typeof alpha === 'number' && !isNaN(alpha)
      ? Math.max(0, Math.min(1, alpha))
      : 1;
  if (clean.length !== 6) return `rgba(255, 255, 255, ${a})`;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return `rgba(255, 255, 255, ${a})`;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};

export const FONTS = [
  { id: 'global', label: 'Inherit', icon: 'G' },
  { id: 'font-mono', label: 'Digital', icon: '01' },
  { id: 'font-sans', label: 'Modern', icon: 'Aa' },
  { id: 'font-handwritten', label: 'School', icon: '✏️' },
];

/**
 * Attempts to extract a Google Calendar ID from a pasted URL.
 */
export const extractCalendarId = (input: string): string => {
  const trimmed = input.trim();
  if (!trimmed) return '';

  try {
    const url = new URL(trimmed);
    const src = url.searchParams.get('src');
    if (src) return src;

    if (url.pathname.includes('/settings/calendar/')) {
      const parts = url.pathname.split('/');
      const last = parts[parts.length - 1];
      if (last && last.includes('@')) return decodeURIComponent(last);
    }
  } catch (_e) {
    /* treat as raw ID */
  }

  return trimmed;
};
