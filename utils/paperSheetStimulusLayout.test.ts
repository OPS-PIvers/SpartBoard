import { describe, expect, it } from 'vitest';
import type { PaperSheetStimulus } from '@/types';
import { STIMULUS_RECT_MM } from './paperSheetLayout';
import {
  MAX_STIMULI_PER_PAGE,
  STIMULUS_GAP_MM,
  captionLineCount,
  layoutSheetStimuli,
  naturalHeightMm,
  stimuliOffTheEnd,
  stimuliOnPage,
} from './paperSheetStimulusLayout';

const image = (over: Partial<PaperSheetStimulus> = {}): PaperSheetStimulus => ({
  id: `s${Math.random()}`,
  label: 'Unit 3 graph',
  source: 'image',
  driveFileId: 'drive-1',
  widthPx: 800,
  heightPx: 400,
  ...over,
});

const bottom = (r: { y: number; h: number }): number => r.y + r.h;
const bandBottom = STIMULUS_RECT_MM.y + STIMULUS_RECT_MM.h;

describe('naturalHeightMm', () => {
  it('keeps an image on its stored pixel aspect', () => {
    expect(naturalHeightMm(image({ widthPx: 800, heightPx: 400 }), 94)).toBe(
      47
    );
    expect(naturalHeightMm(image({ widthPx: 400, heightPx: 800 }), 94)).toBe(
      188
    );
  });

  it('falls back to a shape rather than a zero when pixels are unknown', () => {
    const unknown = naturalHeightMm(
      image({ widthPx: undefined, heightPx: undefined }),
      94
    );
    expect(unknown).toBeGreaterThan(0);
    expect(naturalHeightMm(image({ widthPx: 0, heightPx: 0 }), 94)).toBe(
      unknown
    );
  });

  it('takes a template height from its own spec', () => {
    const grid = image({
      source: 'template',
      template: {
        kind: 'coordinate-grid',
        quadrants: 4,
        min: -10,
        max: 10,
        step: 1,
        showNumbers: true,
      },
    });
    expect(naturalHeightMm(grid, 94)).toBe(94);
    expect(
      naturalHeightMm(
        image({
          source: 'template',
          template: { kind: 'lined', heightMm: 60 },
        }),
        94
      )
    ).toBe(60);
  });
});

describe('captionLineCount', () => {
  it('reserves nothing for a blank caption and never more than two lines', () => {
    expect(captionLineCount('')).toBe(0);
    expect(captionLineCount('Figure 1')).toBe(1);
    expect(captionLineCount('x'.repeat(120))).toBe(2);
  });
});

describe('stimuliOnPage', () => {
  it('takes the unpinned ones plus the ones pinned to this page', () => {
    const all = [
      image({ id: 'every' }),
      image({ id: 'p1', page: 1 }),
      image({ id: 'p2', page: 2 }),
    ];
    expect(stimuliOnPage(all, 1).shown.map((s) => s.id)).toEqual([
      'every',
      'p1',
    ]);
    expect(stimuliOnPage(all, 2).shown.map((s) => s.id)).toEqual([
      'every',
      'p2',
    ]);
  });

  it('drops everything past the per-page cap rather than shrinking further', () => {
    const many = Array.from({ length: MAX_STIMULI_PER_PAGE + 2 }, (_, i) =>
      image({ id: `s${i}` })
    );
    const { shown, dropped } = stimuliOnPage(many, 1);
    expect(shown).toHaveLength(MAX_STIMULI_PER_PAGE);
    expect(dropped.map((s) => s.id)).toEqual([
      `s${MAX_STIMULI_PER_PAGE}`,
      `s${MAX_STIMULI_PER_PAGE + 1}`,
    ]);
  });
});

describe('stimuliOffTheEnd', () => {
  it('names a stimulus pinned past the last page the test now has', () => {
    const all = [image({ id: 'a', page: 1 }), image({ id: 'b', page: 3 })];
    expect(stimuliOffTheEnd(all, 2).map((s) => s.id)).toEqual(['b']);
    expect(stimuliOffTheEnd(all, 3)).toEqual([]);
    expect(stimuliOffTheEnd([image({ id: 'c' })], 1)).toEqual([]);
  });
});

describe('layoutSheetStimuli', () => {
  it('prints a stack that fits at its natural size, top-aligned', () => {
    const { items, scale } = layoutSheetStimuli(
      [
        image({ widthPx: 800, heightPx: 400 }),
        image({ widthPx: 800, heightPx: 400 }),
      ],
      1
    );
    expect(scale).toBe(1);
    expect(items[0].rect).toEqual({
      x: STIMULUS_RECT_MM.x,
      y: STIMULUS_RECT_MM.y,
      w: STIMULUS_RECT_MM.w,
      h: 47,
    });
    expect(items[1].rect.y).toBe(STIMULUS_RECT_MM.y + 47 + STIMULUS_GAP_MM);
    expect(bottom(items[1].rect)).toBeLessThanOrEqual(bandBottom);
  });

  it('shrinks every item by one factor and centres them when the stack is too tall', () => {
    const tall = [
      image({ widthPx: 400, heightPx: 800 }),
      image({ widthPx: 400, heightPx: 800 }),
    ];
    const { items, scale } = layoutSheetStimuli(tall, 1);
    expect(scale).toBeLessThan(1);
    expect(items[0].rect.h).toBeCloseTo(items[1].rect.h, 6);
    expect(items[0].rect.w).toBeCloseTo(STIMULUS_RECT_MM.w * scale, 6);
    // Centred in the band, so the shrunk stack is not hugging the bubbles.
    const leftGap = items[0].rect.x - STIMULUS_RECT_MM.x;
    const rightGap =
      STIMULUS_RECT_MM.x +
      STIMULUS_RECT_MM.w -
      (items[0].rect.x + items[0].rect.w);
    expect(leftGap).toBeGreaterThan(0);
    expect(leftGap).toBeCloseTo(rightGap, 6);
    expect(bottom(items[1].rect)).toBeLessThanOrEqual(bandBottom + 1e-6);
  });

  it('never lets a caption push the stack out of the band', () => {
    const withCaptions = Array.from({ length: 3 }, () =>
      image({
        widthPx: 400,
        heightPx: 800,
        caption:
          'A long caption that wraps onto a second line of nine point text.',
      })
    );
    const { items } = layoutSheetStimuli(withCaptions, 1);
    for (const item of items) {
      expect(item.caption).toBeTruthy();
      expect(item.captionRect).toBeDefined();
      expect(item.captionRect?.y).toBeGreaterThanOrEqual(bottom(item.rect));
    }
    const last = items[items.length - 1];
    expect(bottom(last.captionRect ?? last.rect)).toBeLessThanOrEqual(
      bandBottom + 1e-6
    );
  });

  it('reserves no caption space for a blank or whitespace caption', () => {
    const { items } = layoutSheetStimuli([image({ caption: '   ' })], 1);
    expect(items[0].captionRect).toBeUndefined();
    expect(items[0].caption).toBeUndefined();
  });

  it('caps a caption at the length it is allowed to print', () => {
    const { items } = layoutSheetStimuli(
      [image({ caption: 'x'.repeat(200) })],
      1
    );
    expect(items[0].caption).toHaveLength(120);
  });

  it('places nothing on a page whose stimuli are all pinned elsewhere', () => {
    const layout = layoutSheetStimuli([image({ page: 2 })], 1);
    expect(layout.items).toEqual([]);
    expect(layout.scale).toBe(1);
  });
});
