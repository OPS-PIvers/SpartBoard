import { describe, expect, it } from 'vitest';
import { extractYouTubeId } from './youtube';

describe('extractYouTubeId', () => {
  it('extracts ID from standard watch URL', () => {
    expect(
      extractYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    ).toBe('dQw4w9WgXcQ');
  });

  it('extracts ID from youtu.be short URL', () => {
    expect(extractYouTubeId('https://youtu.be/dQw4w9WgXcQ')).toBe(
      'dQw4w9WgXcQ'
    );
  });

  it('extracts ID from embed URL', () => {
    expect(extractYouTubeId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe(
      'dQw4w9WgXcQ'
    );
  });

  it('extracts ID from shorts URL', () => {
    expect(extractYouTubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe(
      'dQw4w9WgXcQ'
    );
  });

  it('extracts ID from watch URL with extra parameters', () => {
    expect(
      extractYouTubeId(
        'https://www.youtube.com/watch?foo=bar&v=dQw4w9WgXcQ&baz=qux'
      )
    ).toBe('dQw4w9WgXcQ');
  });

  it('extracts ID from v/ URL format', () => {
    expect(extractYouTubeId('https://www.youtube.com/v/dQw4w9WgXcQ')).toBe(
      'dQw4w9WgXcQ'
    );
  });

  it('returns null for invalid URLs', () => {
    expect(extractYouTubeId('https://example.com')).toBeNull();
    expect(extractYouTubeId('https://www.youtube.com/')).toBeNull();
    expect(extractYouTubeId('not a url')).toBeNull();
  });

  it('handles empty or null input gracefully', () => {
    expect(extractYouTubeId('')).toBeNull();
  });

  it('handles IDs with hyphens and underscores', () => {
    expect(
      extractYouTubeId('https://www.youtube.com/watch?v=-_A-Za-z0-9')
    ).toBe('-_A-Za-z0-9');
  });
});
