import type React from 'react';

/** `min(Xpx, Ycqmin)` font-size, only when `cqScaled` — else the caller's own Tailwind text class stands. */
export const scaledFont = (
  cqScaled: boolean | undefined,
  px: number,
  cqmin: number
): React.CSSProperties | undefined =>
  cqScaled ? { fontSize: `min(${px}px, ${cqmin}cqmin)` } : undefined;

/** ms epoch <-> `<input type="datetime-local">` value (local time, no seconds). */
export const msToLocalInputValue = (ms: number | undefined): string => {
  if (!ms) return '';
  const d = new Date(ms);
  const tzOffsetMs = d.getTimezoneOffset() * 60_000;
  return new Date(ms - tzOffsetMs).toISOString().slice(0, 16);
};
export const localInputValueToMs = (value: string): number | undefined => {
  if (!value) return undefined;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : undefined;
};
