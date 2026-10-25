import { describe, expect, it } from 'vitest';
import type { DrawableObject } from '@/types';
import { readClipboardObjects, writeClipboardObjects } from './clipboard';

const rect: DrawableObject = {
  id: 'r1',
  kind: 'rect',
  z: 2,
  x: 10,
  y: 20,
  w: 30,
  h: 40,
  stroke: '#000',
  strokeWidth: 2,
};

describe('drawing clipboard', () => {
  it('round-trips copied objects', () => {
    expect(readClipboardObjects(writeClipboardObjects([rect]))).toEqual([rect]);
  });

  it('ignores other clipboard text', () => {
    expect(readClipboardObjects('hello')).toBeNull();
    expect(readClipboardObjects('{"spartboardDrawing": 1')).toBeNull();
    expect(
      readClipboardObjects('{"spartboardDrawing": 2, "objects": []}')
    ).toBeNull();
  });

  it('rejects objects a renderer could not draw', () => {
    const broken = { ...rect, kind: 'path', points: 'nope' };
    expect(
      readClipboardObjects(writeClipboardObjects([broken as never]))
    ).toBeNull();
    const unknownKind = { ...rect, kind: 'hexagon' };
    expect(
      readClipboardObjects(writeClipboardObjects([unknownKind as never]))
    ).toBeNull();
    const script: DrawableObject = {
      id: 'i',
      kind: 'image',
      z: 0,
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      src: 'javascript:alert(1)',
    };
    expect(readClipboardObjects(writeClipboardObjects([script]))).toBeNull();
  });

  it('rejects sizes that could hang a render and images from other sites', () => {
    const sticky = {
      id: 's',
      kind: 'text',
      z: 0,
      x: 0,
      y: 0,
      w: 180,
      h: 180,
      content: 'x',
      fontFamily: 'sans-serif',
      fontSize: 1e300,
      color: '#000',
      sticky: { fill: '#ff0' },
    };
    expect(
      readClipboardObjects(writeClipboardObjects([sticky as never]))
    ).toBeNull();
    const tracker = {
      id: 'i',
      kind: 'image',
      z: 0,
      x: 0,
      y: 0,
      w: 10,
      h: 10,
      src: 'https://example.com/pixel.png',
    };
    expect(
      readClipboardObjects(writeClipboardObjects([tracker as never]))
    ).toBeNull();
    const svg = { ...tracker, src: 'data:image/svg+xml;base64,PHN2Zz4=' };
    expect(
      readClipboardObjects(writeClipboardObjects([svg as never]))
    ).toBeNull();
  });

  it('keeps only known fields', () => {
    const extra = { ...rect, assetId: 'a', authorUid: 'u', onload: 'x' };
    expect(
      readClipboardObjects(writeClipboardObjects([extra as never]))
    ).toEqual([rect]);
    const storage = {
      id: 'i',
      kind: 'image',
      z: 0,
      x: 0,
      y: 0,
      w: 10,
      h: 10,
      src: 'https://firebasestorage.googleapis.com/v0/b/x/o/y.png',
    };
    expect(
      readClipboardObjects(writeClipboardObjects([storage as never]))
    ).toEqual([storage]);
  });
});
