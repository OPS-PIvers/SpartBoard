export const GAP_STYLE = 'min(10px, 2cqmin)';

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
