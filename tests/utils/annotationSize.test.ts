import { describe, it, expect } from 'vitest';
import { estimateAnnotationBytes } from '@/utils/annotationSize';
import type { TextObject } from '@/types';

const text = (content: string): TextObject => ({
  id: 't',
  kind: 'text',
  z: 0,
  x: 0,
  y: 0,
  w: 1,
  h: 1,
  content,
  fontFamily: 'sans-serif',
  fontSize: 24,
  color: '#000',
});

describe('estimateAnnotationBytes', () => {
  it('counts UTF-8 bytes, not UTF-16 code units', () => {
    const ascii = estimateAnnotationBytes([text('aaaa')]);
    const accented = estimateAnnotationBytes([text('éééé')]);
    const emoji = estimateAnnotationBytes([text('😀😀😀😀')]);
    expect(accented).toBe(ascii + 4);
    // Each emoji is 2 code units but 4 bytes; JSON keeps them raw.
    expect(emoji).toBe(ascii + 12);
  });
});
