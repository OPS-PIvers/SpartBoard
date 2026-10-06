import { useState } from 'react';

const WIDTH_KEY = 'spart.plcNotes.actionItemsWidth';
export const ACTION_PANEL_MIN = 260;
export const ACTION_PANEL_MAX = 560;
const ACTION_PANEL_DEFAULT = 340;

const clampWidth = (w: number) =>
  Math.round(Math.min(ACTION_PANEL_MAX, Math.max(ACTION_PANEL_MIN, w)));

const readStoredWidth = (): number => {
  try {
    const raw = Number(localStorage.getItem(WIDTH_KEY));
    return raw ? clampWidth(raw) : ACTION_PANEL_DEFAULT;
  } catch {
    return ACTION_PANEL_DEFAULT;
  }
};

// Per-viewer convenience, so the width only lives in this browser.
export const useActionPanelWidth = () => {
  const [width, setWidth] = useState(readStoredWidth);
  const save = (w: number) => {
    const next = clampWidth(w);
    setWidth(next);
    try {
      localStorage.setItem(WIDTH_KEY, String(next));
    } catch {
      // Storage blocked: the width still applies for this visit.
    }
  };
  return [width, save] as const;
};
