import { describe, it, expect } from 'vitest';
import { mergeAnnotationObjects } from '@/utils/annotationMerge';
import type { DrawableObject } from '@/types';

const rect = (id: string, x = 0): DrawableObject => ({
  id,
  kind: 'rect',
  z: 1,
  x,
  y: 0,
  w: 10,
  h: 10,
  stroke: '#000',
  strokeWidth: 2,
});
const ids = (o: DrawableObject[]) => o.map((x) => x.id);

describe('mergeAnnotationObjects', () => {
  const X = rect('X');

  it('keeps a local add and a concurrent remote add', () => {
    const out = mergeAnnotationObjects([X, rect('Y')], [X, rect('Z')], [X]);
    expect(ids(out)).toEqual(['X', 'Y', 'Z']);
  });

  it('honors a remote delete of untouched ink and keeps a local delete', () => {
    const A = rect('A');
    const B = rect('B');
    // Local deleted B; remote deleted A.
    const out = mergeAnnotationObjects([X], [X, B], [X, A, B]);
    expect(ids(out)).toEqual(['X']);
  });

  it('takes the remote edit for untouched ink and the local edit for touched ink', () => {
    const out = mergeAnnotationObjects(
      [rect('X', 5), rect('W')],
      [rect('X', 1), rect('W', 9)],
      [X, rect('W')]
    );
    expect(out.find((o) => o.id === 'X')).toMatchObject({ x: 5 });
    expect(out.find((o) => o.id === 'W')).toMatchObject({ x: 9 });
  });

  it('a locally edited object survives a remote delete', () => {
    const out = mergeAnnotationObjects([rect('X', 5)], [], [X]);
    expect(ids(out)).toEqual(['X']);
  });
});
