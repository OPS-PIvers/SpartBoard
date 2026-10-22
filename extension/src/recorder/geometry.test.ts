import { describe, expect, it } from 'vitest';
import { cropRect, framePath, toBox } from './geometry';

const viewport = { w: 1000, h: 800 };

describe('cropRect', () => {
  it('keeps the target and its surroundings, in screenshot pixels', () => {
    const r = cropRect({ x: 480, y: 380, width: 40, height: 20 }, viewport, {
      w: 2000,
      h: 1600,
    });
    expect(r).toEqual({ x: 360, y: 360, width: 1280, height: 840 });
  });

  it('stays inside the screenshot near an edge', () => {
    const r = cropRect({ x: 0, y: 0, width: 40, height: 20 }, viewport, {
      w: 1000,
      h: 800,
    });
    expect(r).toEqual({ x: 0, y: 0, width: 640, height: 420 });
  });

  it('is the whole picture when the target is unknown', () => {
    expect(cropRect(null, viewport, { w: 1000, h: 800 })).toEqual({
      x: 0,
      y: 0,
      width: 1000,
      height: 800,
    });
  });
});

describe('toBox', () => {
  it('gives viewport fractions', () => {
    expect(toBox({ x: 500, y: 200, width: 100, height: 80 }, viewport)).toEqual(
      { x: 0.5, y: 0.25, w: 0.1, h: 0.1 }
    );
  });
});

describe('framePath', () => {
  const frames = [
    { frameId: 0, parentFrameId: -1, url: 'https://orono.schoology.com/home' },
    { frameId: 4, parentFrameId: 0, url: 'https://ads.example/a' },
    {
      frameId: 7,
      parentFrameId: 0,
      url: 'https://app.example/course/123456/view',
    },
    { frameId: 9, parentFrameId: 7, url: 'https://docs.google.com/x?id=55' },
  ];

  it('is empty for the top frame', () => {
    expect(framePath(frames, 0)).toEqual([]);
  });

  it('walks down from the top with wildcarded addresses and sibling places', () => {
    expect(framePath(frames, 9)).toEqual([
      { urlPattern: 'https://app.example/course/*/view', index: 1 },
      { urlPattern: 'https://docs.google.com/x?id=*', index: 0 },
    ]);
  });

  it('is null for a frame it cannot place', () => {
    expect(framePath(frames, 42)).toBeNull();
  });
});
