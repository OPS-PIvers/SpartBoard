import { describe, it, expect } from 'vitest';
import {
  DEFAULT_RECORDING_CONFIG,
  isWhiteboardRecording,
  normalizeRecordingConfig,
  limitStartingInk,
  normalizeWhiteboardStartingPage,
  recordingReviewEnabled,
  WHITEBOARD_INK_POINTS_MAX,
  WHITEBOARD_INK_STROKES_MAX,
  whiteboardUsesMic,
  takesRemaining,
  wrapUpThresholdSeconds,
} from './quizRecordingDefaults';

describe('normalizeRecordingConfig', () => {
  it('returns undefined for an absent block so legacy questions stay legacy', () => {
    expect(normalizeRecordingConfig(undefined)).toBeUndefined();
    expect(normalizeRecordingConfig(null)).toBeUndefined();
  });

  it('defaults to 30s prep, 60s limit and unlimited takes', () => {
    expect(normalizeRecordingConfig({})).toEqual({
      prepSeconds: 30,
      limitSeconds: 60,
      prepExpiry: 'armed',
      takeLimit: null,
    });
    expect(DEFAULT_RECORDING_CONFIG.takeLimit).toBeNull();
  });

  it('clamps the audio limit to 300 seconds', () => {
    expect(normalizeRecordingConfig({ limitSeconds: 9000 })?.limitSeconds).toBe(
      300
    );
  });

  it('rejects an unknown prepExpiry rather than passing it through', () => {
    expect(
      normalizeRecordingConfig({
        prepExpiry: 'nonsense' as never,
      })?.prepExpiry
    ).toBe('armed');
  });

  it.each(['auto-advance', 'unanswered'] as const)(
    'reads the retired %s choice as auto-start, so students still get to record',
    (prepExpiry) => {
      expect(normalizeRecordingConfig({ prepExpiry })?.prepExpiry).toBe(
        'auto-start'
      );
    }
  );

  it('tolerates the authoring-only stash and drops it from the result', () => {
    const normalized = normalizeRecordingConfig({
      ...DEFAULT_RECORDING_CONFIG,
      priorTimeLimit: 45,
    });
    expect(normalized).toEqual(DEFAULT_RECORDING_CONFIG);
    expect(normalized && 'priorTimeLimit' in normalized).toBe(false);
  });

  it('treats a non-numeric takeLimit as unlimited', () => {
    expect(normalizeRecordingConfig({ takeLimit: 0 })?.takeLimit).toBe(1);
    expect(
      normalizeRecordingConfig({ takeLimit: undefined })?.takeLimit
    ).toBeNull();
  });
});

describe('takesRemaining', () => {
  it('is null when unlimited and never negative when limited', () => {
    const base = DEFAULT_RECORDING_CONFIG;
    expect(takesRemaining(base, 5)).toBeNull();
    expect(takesRemaining({ ...base, takeLimit: 2 }, 0)).toBe(2);
    expect(takesRemaining({ ...base, takeLimit: 2 }, 5)).toBe(0);
  });
});

describe('wrapUpThresholdSeconds', () => {
  it('opens the wrap-up stretch before the limit, never after it', () => {
    expect(wrapUpThresholdSeconds(60)).toBe(6);
    expect(wrapUpThresholdSeconds(300)).toBe(30);
    // Short takes still get a warning rather than a silent cut-off.
    expect(wrapUpThresholdSeconds(10)).toBe(5);
  });
});

describe('whiteboard recording fields', () => {
  it('keeps a legacy block free of the new keys, so it still means audio with review on', () => {
    const config = normalizeRecordingConfig({ limitSeconds: 90 });
    expect(config).not.toHaveProperty('mode');
    expect(config).not.toHaveProperty('review');
    expect(config).not.toHaveProperty('explainAloud');
    expect(config).not.toHaveProperty('startingPage');
    expect(isWhiteboardRecording(config)).toBe(false);
    expect(config && recordingReviewEnabled(config)).toBe(true);
  });

  it('carries mode, review, explainAloud and the starting page through', () => {
    const config = normalizeRecordingConfig({
      mode: 'whiteboard',
      review: false,
      explainAloud: false,
      startingPage: { pattern: { kind: 'grid' } },
    });
    if (!config) throw new Error('expected a config');
    expect(isWhiteboardRecording(config)).toBe(true);
    expect(recordingReviewEnabled(config)).toBe(false);
    expect(whiteboardUsesMic(config)).toBe(false);
    expect(config.startingPage).toEqual({ pattern: { kind: 'grid' } });
  });

  it('drops an unknown mode', () => {
    const config = normalizeRecordingConfig({
      mode: 'video' as unknown as 'audio',
    });
    expect(config).not.toHaveProperty('mode');
  });

  it('clamps whiteboard limits to the shared 300 s ceiling', () => {
    expect(
      normalizeRecordingConfig({ mode: 'whiteboard', limitSeconds: 600 })
        ?.limitSeconds
    ).toBe(300);
  });
});

describe('normalizeWhiteboardStartingPage', () => {
  it('returns undefined for absent input and blank for an unknown pattern', () => {
    expect(normalizeWhiteboardStartingPage(undefined)).toBeUndefined();
    expect(
      normalizeWhiteboardStartingPage({ pattern: { kind: 'zig' } })
    ).toEqual({ pattern: { kind: 'blank' } });
  });

  it('falls back on reversed axis ranges and keeps valid ones', () => {
    expect(
      normalizeWhiteboardStartingPage({
        pattern: {
          kind: 'coordinate-plane',
          xMin: 5,
          xMax: -5,
          yMin: 0,
          yMax: 8,
        },
      })
    ).toEqual({
      pattern: {
        kind: 'coordinate-plane',
        xMin: -10,
        xMax: 10,
        yMin: 0,
        yMax: 8,
      },
    });
  });

  it('replaces a number-line step that would draw over 100 ticks', () => {
    expect(
      normalizeWhiteboardStartingPage({
        pattern: { kind: 'number-line', min: 0, max: 1000, step: 1 },
      })
    ).toEqual({
      pattern: { kind: 'number-line', min: 0, max: 1000, step: 100 },
    });
  });

  it('clamps polygon sides and drops sides on other shapes', () => {
    expect(
      normalizeWhiteboardStartingPage({
        pattern: { kind: 'shape', shape: 'polygon', sides: 40 },
      })
    ).toEqual({ pattern: { kind: 'shape', shape: 'polygon', sides: 12 } });
    expect(
      normalizeWhiteboardStartingPage({
        pattern: { kind: 'shape', shape: 'circle', sides: 5 },
      })
    ).toEqual({ pattern: { kind: 'shape', shape: 'circle' } });
  });

  it('keeps a complete image and drops an incomplete one', () => {
    const image = {
      driveFileId: 'drive-1',
      url: 'https://lh3.googleusercontent.com/d/drive-1',
      mimeType: 'image/png',
      width: 800,
      height: 600,
    };
    expect(
      normalizeWhiteboardStartingPage({ pattern: { kind: 'blank' }, image })
    ).toEqual({ pattern: { kind: 'blank' }, image });
    expect(
      normalizeWhiteboardStartingPage({
        pattern: { kind: 'blank' },
        image: { ...image, width: 0 },
      })
    ).toEqual({ pattern: { kind: 'blank' } });
  });

  it('drops an image on a host other than Drive, or a malformed file id', () => {
    const image = {
      driveFileId: 'drive-1',
      url: 'https://drive.google.com/file/d/drive-1/view',
      mimeType: 'image/png',
      width: 800,
      height: 600,
    };
    expect(
      normalizeWhiteboardStartingPage({ pattern: { kind: 'blank' }, image })
    ).toEqual({ pattern: { kind: 'blank' }, image });
    for (const bad of [
      { ...image, url: 'https://tracker.example.com/p.png' },
      { ...image, url: 'https://lh3.googleusercontent.com.evil.io/d/x' },
      { ...image, url: 'http://lh3.googleusercontent.com/d/x' },
      { ...image, driveFileId: '../x' },
    ]) {
      expect(
        normalizeWhiteboardStartingPage({
          pattern: { kind: 'blank' },
          image: bad,
        })
      ).toEqual({ pattern: { kind: 'blank' } });
    }
  });
});

describe('normalizeWhiteboardStartingPage images and ink', () => {
  const image = {
    driveFileId: 'drive-1',
    url: 'https://lh3.googleusercontent.com/d/drive-1',
    mimeType: 'image/png',
    width: 800,
    height: 600,
  };

  it('keeps valid placed images, caps them at six and ignores the legacy image', () => {
    const placed = { ...image, x: 10, y: 20, w: 400, h: 300 };
    const out = normalizeWhiteboardStartingPage({
      pattern: { kind: 'blank' },
      image,
      images: [
        ...Array.from({ length: 7 }, () => placed),
        { ...placed, w: 0 },
        { ...placed, url: 'https://evil.io/x.png' },
      ],
    });
    expect(out?.image).toBeUndefined();
    expect(out?.images).toHaveLength(6);
    expect(out?.images?.[0]).toEqual(placed);
  });

  it('pulls an off-page image back on and shrinks an oversized one', () => {
    const out = normalizeWhiteboardStartingPage({
      pattern: { kind: 'blank' },
      images: [
        { ...image, x: 1500, y: -40, w: 400, h: 300 },
        { ...image, x: 0, y: 0, w: 3200, h: 1200 },
      ],
    });
    expect(out?.images?.[0]).toMatchObject({ x: 1200, y: 0, w: 400, h: 300 });
    expect(out?.images?.[1]).toMatchObject({ x: 0, y: 0, w: 1600, h: 600 });
  });

  it('drops the image key when every placed image is invalid', () => {
    expect(
      normalizeWhiteboardStartingPage({
        pattern: { kind: 'blank' },
        images: [{ ...image, x: 0, y: 0, w: -1, h: 5 }],
      })
    ).toEqual({ pattern: { kind: 'blank' } });
  });

  it('rounds and clamps ink points and drops malformed strokes', () => {
    expect(
      limitStartingInk([
        { color: '#0f172a', size: 4, points: [1.4, 2.6, -5, 9000, 7] },
        { color: 'red', size: 4, points: [1, 1, 2, 2] },
        { color: '#000', size: 4, points: ['x', 1] },
        { color: '#000', size: 999, points: [3, 3] },
      ])
    ).toEqual([
      { color: '#0f172a', size: 4, points: [1, 3, 0, 1200] },
      { color: '#000', size: 64, points: [3, 3] },
    ]);
  });

  it('caps strokes at 200 and total points at 20,000', () => {
    const many = Array.from({ length: 300 }, () => ({
      color: '#000',
      size: 4,
      points: [1, 1, 2, 2],
    }));
    expect(limitStartingInk(many)).toHaveLength(WHITEBOARD_INK_STROKES_MAX);
    const big = Array.from({ length: 3 }, () => ({
      color: '#000',
      size: 4,
      points: Array.from({ length: 5_000 }, (_, i) => i % 1000),
    }));
    const limited = limitStartingInk(big);
    const total = limited.reduce((n, s) => n + s.points.length / 2, 0);
    expect(limited).toHaveLength(2);
    expect(total).toBeLessThanOrEqual(WHITEBOARD_INK_POINTS_MAX);
  });

  it('carries ink through and omits an empty list', () => {
    const ink = [{ color: '#0f172a', size: 4, points: [1, 2, 3, 4] }];
    expect(
      normalizeWhiteboardStartingPage({ pattern: { kind: 'blank' }, ink })
    ).toEqual({ pattern: { kind: 'blank' }, ink });
    expect(
      normalizeWhiteboardStartingPage({ pattern: { kind: 'blank' }, ink: [] })
    ).toEqual({ pattern: { kind: 'blank' } });
  });
});
