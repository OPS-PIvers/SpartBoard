// Width of the sources panel beside a quiz question, as a percent of the row.
export const PANEL_PCT_DEFAULT = 50;
export const PANEL_PCT_MIN = 25;
export const PANEL_PCT_MAX = 75;
export const PANEL_PCT_STEP = 2;
const STORAGE_KEY = 'sb_quiz_stimulus_panel_pct';

export const clampPanelPct = (pct: number): number =>
  Number.isFinite(pct)
    ? Math.min(
        PANEL_PCT_MAX,
        Math.max(PANEL_PCT_MIN, Math.round(pct * 10) / 10)
      )
    : PANEL_PCT_DEFAULT;

/** The width this tab last chose, or the even split. */
export function readPanelPct(): number {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw === null ? PANEL_PCT_DEFAULT : clampPanelPct(Number(raw));
  } catch {
    return PANEL_PCT_DEFAULT;
  }
}

export function writePanelPct(pct: number): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, String(pct));
  } catch {
    // Storage can be blocked; the width then lasts until the page reloads.
  }
}

/** The width a key press moves the divider to, or null for a key it ignores. */
export function panelPctForKey(key: string, pct: number): number | null {
  if (key === 'ArrowLeft') return clampPanelPct(pct - PANEL_PCT_STEP);
  if (key === 'ArrowRight') return clampPanelPct(pct + PANEL_PCT_STEP);
  if (key === 'Home') return PANEL_PCT_MIN;
  if (key === 'End') return PANEL_PCT_MAX;
  if (key === 'Enter') return PANEL_PCT_DEFAULT;
  return null;
}
