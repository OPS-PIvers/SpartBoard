import { describe, expect, it } from 'vitest';
import { InsideClipboard, insertKind } from './writingClipboard';

describe('InsideClipboard', () => {
  it('treats text copied from the piece as a move, whatever its spacing', () => {
    const clip = new InsideClipboard();
    clip.noteCopy('The storm\nrolled in.', 'inside');
    expect(clip.sourceOf('The storm rolled in.\n')).toBe('inside');
    expect(clip.sourceOf('Something from a website')).toBe('outside');
  });

  it('only remembers the latest copy from the piece', () => {
    const clip = new InsideClipboard();
    clip.noteCopy('first part', 'inside');
    clip.noteCopy('second part', 'inside');
    expect(clip.sourceOf('first part')).toBe('outside');
    expect(clip.sourceOf('second part')).toBe('inside');
  });

  it('knows the student own unsent writing, whole or a long part of it', () => {
    const clip = new InsideClipboard();
    clip.noteCopy(
      'I walked to the lake every morning that summer.',
      'own-unsent'
    );
    expect(clip.sourceOf('I walked to the lake every morning')).toBe(
      'own-unsent'
    );
    expect(clip.sourceOf('lake')).toBe('outside');
  });

  it('never matches empty text', () => {
    const clip = new InsideClipboard();
    clip.noteCopy('   ', 'inside');
    expect(clip.sourceOf('')).toBe('outside');
  });
});

describe('insertKind', () => {
  it('lets a move inside the piece through even with paste off (D8)', () => {
    expect(insertKind('inside', false)).toBe('typed');
    expect(insertKind('own-unsent', false)).toBe('restored');
  });

  it('blocks outside text unless paste is allowed, and logs it as pasted', () => {
    expect(insertKind('outside', false)).toBeNull();
    expect(insertKind('outside', true)).toBe('pasted');
  });
});
