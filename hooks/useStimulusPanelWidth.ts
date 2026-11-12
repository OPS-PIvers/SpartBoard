import { useCallback, useState } from 'react';
import {
  clampPanelPct,
  readPanelPct,
  writePanelPct,
} from '@/utils/quizStimulusPanel';

/** Sources panel width for this tab; survives question changes and a reload. */
export function useStimulusPanelWidth(): [number, (pct: number) => void] {
  const [pct, setPct] = useState(readPanelPct);
  const set = useCallback((next: number) => {
    const clamped = clampPanelPct(next);
    setPct(clamped);
    writePanelPct(clamped);
  }, []);
  return [pct, set];
}
