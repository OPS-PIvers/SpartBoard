import { describe, it, expect, beforeEach } from 'vitest';
import {
  clampPanelPct,
  panelImageFit,
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

describe('panelImageFit', () => {
  const tall = { w: 600, h: 1100 };
  it('shows the whole picture beside the question when it stays wide enough', () => {
    expect(
      panelImageFit(tall, { w: 680, maxH: 800, beside: true })
    ).toBeCloseTo(800 / 1100);
  });
  it('fits a very tall picture to the panel width so it stays readable', () => {
    const page = { w: 600, h: 2400 };
    expect(
      panelImageFit(page, { w: 680, maxH: 800, beside: true })
    ).toBeCloseTo(680 / 600);
  });
  it('always shows the whole picture when stacked above the question', () => {
    const page = { w: 600, h: 2400 };
    expect(
      panelImageFit(page, { w: 360, maxH: 250, beside: false })
    ).toBeCloseTo(250 / 2400);
  });
  it('caps how far a small picture grows', () => {
    expect(
      panelImageFit({ w: 100, h: 100 }, { w: 680, maxH: 800, beside: true })
    ).toBe(2);
  });
});
