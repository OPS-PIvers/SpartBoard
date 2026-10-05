import { describe, expect, it } from 'vitest';
import {
  analyzeG1,
  analyzeG2,
  analyzeG3,
  analyzeG4,
  renderMetrics,
} from '@/scripts/widget-grader/measure/analyze';
import { loadThresholds } from '@/scripts/widget-grader/measure/constants';
import type {
  Box,
  ControlInfo,
  FaceSnapshot,
  TextInfo,
} from '@/scripts/widget-grader/measure/snapshotTypes';

const CARD: Box = { x: 100, y: 100, w: 300, h: 200 };
const GLASS = [{ color: 'rgba(255, 255, 255, 0.8)', image: null }];

const control = (over: Partial<ControlInfo> = {}): ControlInfo => {
  const box = over.box ?? { x: 120, y: 120, w: 48, h: 48 };
  return {
    path: 'button',
    label: 'Go',
    box,
    visibleBox: box,
    nonScrollBox: box,
    clippedByNonScroller: false,
    hiddenInScroller: false,
    centerHit: 'self',
    coveredBy: null,
    srOnly: false,
    transparent: false,
    nested: false,
    ...over,
  };
};

const text = (over: Partial<TextInfo> = {}): TextInfo => {
  const box = over.box ?? { x: 120, y: 200, w: 100, h: 20 };
  return {
    path: 'span',
    text: 'Hello',
    box,
    fontPx: 16,
    fontWeight: 400,
    nonScrollBox: box,
    clippedByNonScroller: false,
    hiddenInScroller: false,
    truncated: false,
    overflowsOwnBox: false,
    color: 'rgb(15, 23, 42)',
    layers: GLASS,
    ...over,
  };
};

const face = (over: Partial<FaceSnapshot> = {}): FaceSnapshot => ({
  card: CARD,
  viewport: { w: 1920, h: 1080 },
  controls: [],
  texts: [],
  media: [],
  scrollers: [],
  contentBox: { x: 110, y: 110, w: 280, h: 180 },
  drag: { samples: 100, draggable: 50 },
  strips: [],
  toolbar: null,
  faceText: '',
  ...over,
});

describe('analyzeG1', () => {
  it('passes for a reachable control', () => {
    expect(analyzeG1(face({ controls: [control()] })).pass).toBe(true);
  });

  it('fails for a control cut by a non-scrolling box', () => {
    const box = { x: 370, y: 120, w: 60, h: 44 };
    const result = analyzeG1(
      face({
        controls: [control({ box, nonScrollBox: { ...box, w: 30 } })],
      })
    );
    expect(result.pass).toBe(false);
    expect(result.values.clipped).toBe(1);
  });

  it('fails for a covered control and names the cover', () => {
    const result = analyzeG1(
      face({
        controls: [control({ centerHit: 'covered', coveredBy: 'div.overlay' })],
      })
    );
    expect(result.pass).toBe(false);
    expect(result.values.offenders).toContain('div.overlay');
  });

  it('ignores a control scrolled out of view and a hover-only one', () => {
    const result = analyzeG1(
      face({
        controls: [
          control({
            centerHit: 'scrolled',
            visibleBox: null,
            hiddenInScroller: true,
          }),
          control({ transparent: true, centerHit: 'covered' }),
        ],
      })
    );
    expect(result.pass).toBe(true);
  });
});

describe('analyzeG2', () => {
  it('passes for text inside its box', () => {
    expect(analyzeG2(face({ texts: [text()] })).pass).toBe(true);
  });

  it('fails for text cut sideways', () => {
    const box = { x: 300, y: 200, w: 200, h: 20 };
    const result = analyzeG2(
      face({ texts: [text({ box, nonScrollBox: { ...box, w: 100 } })] })
    );
    expect(result.pass).toBe(false);
  });

  it('allows a tight line box to trim ascent and descent', () => {
    const box = { x: 120, y: 120, w: 200, h: 120 };
    const result = analyzeG2(
      face({
        texts: [
          text({
            box,
            fontPx: 100,
            nonScrollBox: { x: 120, y: 130, w: 200, h: 100 },
          }),
        ],
      })
    );
    expect(result.pass).toBe(true);
  });

  it('passes for ellipsis truncation and counts it', () => {
    const box = { x: 300, y: 200, w: 200, h: 20 };
    const result = analyzeG2(
      face({
        texts: [
          text({ box, nonScrollBox: { ...box, w: 100 }, truncated: true }),
        ],
      })
    );
    expect(result.pass).toBe(true);
    expect(result.values.truncatedText).toBe(1);
  });

  it('fails for media mostly hidden', () => {
    const box = { x: 380, y: 120, w: 40, h: 40 };
    const result = analyzeG2(
      face({
        media: [
          {
            path: 'svg',
            box,
            nonScrollBox: { ...box, w: 20 },
            clippedByNonScroller: true,
            clippedFraction: 0.5,
          },
        ],
      })
    );
    expect(result.pass).toBe(false);
  });
});

describe('analyzeG3', () => {
  it('passes with no errors and dedupes repeats', () => {
    expect(analyzeG3([]).pass).toBe(true);
    const result = analyzeG3(['boom\n at x', 'boom\n at y']);
    expect(result.pass).toBe(false);
    expect(result.values.errors).toBe(1);
  });
});

describe('analyzeG4', () => {
  const base = {
    beforeReload: 'Lab day 12:30',
    afterReload: 'Lab day 12:31',
    emptyText: 'Add a task',
    typicalText: 'Pair up for chemistry laboratory notebook',
    secondText: 'Add a task',
  };

  it('passes when content survives reload and stays on its own instance', () => {
    expect(analyzeG4(base).pass).toBe(true);
  });

  it('fails when the face changes after reload', () => {
    expect(analyzeG4({ ...base, afterReload: 'Add a task' }).pass).toBe(false);
  });

  it('fails when the second instance shows the first one’s content', () => {
    const result = analyzeG4({ ...base, secondText: base.typicalText });
    expect(result.pass).toBe(false);
    expect(result.values.leakedWords).toBeGreaterThan(0);
  });

  it('fails when protected data is on the face', () => {
    const result = analyzeG4({
      ...base,
      typicalText: 'Ava Lee IEP: extended time',
    });
    expect(result.pass).toBe(false);
    expect(result.values.protectedHits).toBe('iep');
  });
});

describe('renderMetrics', () => {
  const t = loadThresholds();

  it('measures fonts, contrast and targets', () => {
    const m = renderMetrics(
      face({
        texts: [
          text({ fontPx: 40 }),
          text({ fontPx: 12, color: 'rgb(203, 213, 225)' }),
        ],
        controls: [
          control({ box: { x: 120, y: 120, w: 48, h: 48 } }),
          control({ box: { x: 172, y: 120, w: 30, h: 30 } }),
        ],
      }),
      t
    );
    expect(m.primaryPx).toBe(40);
    expect(m.minFontPx).toBe(12);
    expect(m.contrastUnder3).toBe(1);
    expect(m.targetsUnder32).toBe(1);
    expect(m.targetsUnderDefault).toBe(1);
    expect(m.minSpacingPx).toBe(4);
  });

  it('reads the drag fraction, covered strips and toolbar overlap', () => {
    const m = renderMetrics(
      face({
        drag: { samples: 10, draggable: 1 },
        strips: [{ side: 'top', samples: 8, covered: 6 }],
        controls: [control()],
        toolbar: { x: 110, y: 110, w: 200, h: 40 },
      }),
      t
    );
    expect(m.dragFraction).toBe(0.1);
    expect(m.stripsCovered).toBe(1);
    expect(m.toolbarOverlaps).toBe(1);
  });

  it('flags nested scrollers and a scrolling card', () => {
    const scroller = {
      path: 'div',
      box: { x: 110, y: 110, w: 100, h: 100 },
      scrollHeight: 400,
      clientHeight: 100,
      scrollWidth: 100,
      clientWidth: 100,
      nested: true,
    };
    const m = renderMetrics(
      face({ scrollers: [scroller, { ...scroller, path: '', nested: false }] }),
      t
    );
    expect(m.nestedScroll).toBe(true);
    expect(m.wholeCardScroll).toBe(true);
  });
});

describe('analyzeG4 shared roster', () => {
  it('does not count shared roster names as a leak', () => {
    const typicalText = 'Harper Okafor Jordan Smith Taylor Brown';
    const result = analyzeG4({
      beforeReload: typicalText,
      afterReload: typicalText,
      emptyText: '',
      typicalText,
      secondText: typicalText,
      sharedText: 'Harper Okafor Jordan Smith Taylor Brown',
    });
    expect(result.pass).toBe(true);
  });
});
