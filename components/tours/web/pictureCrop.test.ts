import { describe, expect, it } from 'vitest';
import type { WebTourPicture } from '@/types';
import { clampCrop, moveMarkup, moveRect, recropPicture } from './pictureCrop';

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe('recropPicture', () => {
  // A picture cut from the middle half of its capture, target in its centre.
  const picture: WebTourPicture = {
    path: 'p/old.jpg',
    w: 800,
    h: 400,
    cssW: 640,
    target: { x: 0.45, y: 0.45, w: 0.1, h: 0.1 },
    original: {
      path: 'p/orig.jpg',
      w: 1600,
      h: 800,
      crop: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 },
    },
  };

  it('widening to the whole capture keeps the ring on the same spot of the page', () => {
    const out = recropPicture(
      picture,
      { x: 0, y: 0, w: 1, h: 1 },
      { path: 'p/new.jpg', w: 1600, h: 800 }
    );
    if (!out.target) throw new Error('lost target');
    // Capture coordinates of the target: 0.25 + 0.45 * 0.5 = 0.475.
    close(out.target.x, 0.475);
    close(out.target.y, 0.475);
    close(out.target.w, 0.05);
    close(out.target.h, 0.05);
    close(out.cssW ?? 0, 1280);
    expect(out.original?.crop).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    expect(out.original?.path).toBe('p/orig.jpg');
    expect(out.path).toBe('p/new.jpg');
  });

  it('cropping tighter around the target scales it up', () => {
    const out = recropPicture(
      picture,
      { x: 0.4, y: 0.4, w: 0.2, h: 0.2 },
      { path: 'p/t.jpg', w: 320, h: 160 }
    );
    if (!out.target) throw new Error('lost target');
    close(out.target.x, (0.475 - 0.4) / 0.2);
    close(out.target.w, 0.05 / 0.2);
  });

  it('drops the ring when the crop leaves the target out', () => {
    const out = recropPicture(
      picture,
      { x: 0, y: 0, w: 0.2, h: 0.2 },
      { path: 'p/c.jpg', w: 320, h: 160 }
    );
    expect(out.target).toBeUndefined();
  });

  it('crops an older step, with no capture, inside its own picture', () => {
    const { original: _o, ...older } = picture;
    const out = recropPicture(
      older,
      { x: 0.4, y: 0.4, w: 0.2, h: 0.2 },
      { path: 'p/o.jpg', w: 160, h: 80 }
    );
    if (!out.target) throw new Error('lost target');
    close(out.target.x, 0.25);
    close(out.target.w, 0.5);
    expect(out.original).toBeUndefined();
    close(out.cssW ?? 0, 128);
  });

  it('carries markup with the crop and drops what falls outside', () => {
    const out = recropPicture(
      {
        ...picture,
        markup: [
          { id: 'b', kind: 'box', x: 0.4, y: 0.4, w: 0.2, h: 0.2 },
          { id: 'n', kind: 'number', x: 0.05, y: 0.05, n: 1 },
          { id: 'a', kind: 'arrow', x1: 0.1, y1: 0.5, x2: 0.45, y2: 0.5 },
        ],
      },
      { x: 0.35, y: 0.25, w: 0.3, h: 0.5 },
      { path: 'p/m.jpg', w: 480, h: 400 }
    );
    expect(out.markup?.map((s) => s.id)).toEqual(['b', 'a']);
  });
});

describe('moveRect and moveMarkup', () => {
  it('clips a rect to the new crop', () => {
    const r = moveRect(
      { x: 0.8, y: 0.8, w: 0.4, h: 0.4 },
      { x: 0, y: 0, w: 1, h: 1 },
      { x: 0, y: 0, w: 1, h: 1 }
    );
    if (!r) throw new Error('no rect');
    close(r.x, 0.8);
    close(r.w, 0.2);
    close(r.h, 0.2);
  });

  it('keeps an arrow with one end inside, clamping the other', () => {
    const [a] = moveMarkup(
      [{ id: 'a', kind: 'arrow', x1: 0.5, y1: 0.5, x2: 0.9, y2: 0.5 }],
      { x: 0, y: 0, w: 1, h: 1 },
      { x: 0, y: 0, w: 0.6, h: 1 }
    );
    expect(a).toMatchObject({ x2: 1 });
  });
});

describe('clampCrop', () => {
  it('keeps a crop inside its base and above the minimum size', () => {
    expect(clampCrop({ x: 0.9, y: -0.2, w: 0.5, h: 0.01 })).toEqual({
      x: 0.5,
      y: 0,
      w: 0.5,
      h: 0.05,
    });
  });
});
