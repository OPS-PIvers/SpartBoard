import { describe, it, expect, beforeEach } from 'vitest';
import {
  clampPanelPct,
  panelPctForKey,
  readPanelPct,
  writePanelPct,
} from '@/utils/quizStimulusPanel';

describe('quizStimulusPanel', () => {
  beforeEach(() => window.sessionStorage.clear());

  it('starts at an even split and remembers a chosen width', () => {
    expect(readPanelPct()).toBe(50);
    writePanelPct(62);
    expect(readPanelPct()).toBe(62);
  });

  it('keeps the width between a quarter and three quarters', () => {
    expect(clampPanelPct(5)).toBe(25);
    expect(clampPanelPct(99)).toBe(75);
    expect(clampPanelPct(Number.NaN)).toBe(50);
    writePanelPct(900);
    expect(readPanelPct()).toBe(75);
  });

  it('moves with the arrow keys and resets on Enter', () => {
    expect(panelPctForKey('ArrowLeft', 50)).toBe(48);
    expect(panelPctForKey('ArrowRight', 74)).toBe(75);
    expect(panelPctForKey('Home', 50)).toBe(25);
    expect(panelPctForKey('End', 50)).toBe(75);
    expect(panelPctForKey('Enter', 31)).toBe(50);
    expect(panelPctForKey('a', 50)).toBeNull();
  });
});
