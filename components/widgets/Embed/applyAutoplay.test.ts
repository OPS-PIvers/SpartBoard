import { describe, it, expect } from 'vitest';
import { applyAutoplay } from './applyAutoplay';

describe('applyAutoplay', () => {
  it('returns the original URL when autoplay is false', () => {
    const url = 'https://www.youtube.com/embed/abc123';
    expect(applyAutoplay(url, false)).toBe(url);
  });

  it('returns the original URL when it is empty', () => {
    expect(applyAutoplay('', true)).toBe('');
  });

  it('appends autoplay=1 and mute=1 for YouTube embed URLs', () => {
    const url = 'https://www.youtube.com/embed/abc123';
    expect(applyAutoplay(url, true)).toBe(
      'https://www.youtube.com/embed/abc123?autoplay=1&mute=1'
    );
  });

  it('appends autoplay=1 and mute=1 for bare youtube.com', () => {
    const url = 'https://youtube.com/embed/xyz';
    expect(applyAutoplay(url, true)).toBe(
      'https://youtube.com/embed/xyz?autoplay=1&mute=1'
    );
  });

  it('appends autoplay=1 for Google Drive preview URLs (no mute)', () => {
    const url = 'https://drive.google.com/file/d/fileId123/preview';
    expect(applyAutoplay(url, true)).toBe(
      'https://drive.google.com/file/d/fileId123/preview?autoplay=1'
    );
  });

  it('appends autoplay=1 for Google Vids preview URLs (no mute)', () => {
    const url = 'https://vids.google.com/vids/vidId456/preview';
    expect(applyAutoplay(url, true)).toBe(
      'https://vids.google.com/vids/vidId456/preview?autoplay=1'
    );
  });

  it('does not append autoplay for unsupported hosts', () => {
    const url = 'https://example.com/video';
    expect(applyAutoplay(url, true)).toBe(url);
  });

  it('does not match lookalike domains like notyoutube.com', () => {
    const url = 'https://notyoutube.com/embed/abc';
    expect(applyAutoplay(url, true)).toBe(url);
  });

  it('preserves existing query parameters', () => {
    const url = 'https://www.youtube.com/embed/abc123?rel=0';
    const result = applyAutoplay(url, true);
    expect(result).toContain('rel=0');
    expect(result).toContain('autoplay=1');
    expect(result).toContain('mute=1');
  });

  it('returns original URL for malformed URLs', () => {
    const url = 'not-a-valid-url';
    expect(applyAutoplay(url, true)).toBe(url);
  });
});
