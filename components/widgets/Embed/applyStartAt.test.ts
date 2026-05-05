import { describe, it, expect } from 'vitest';
import { applyStartAt } from './applyStartAt';

describe('applyStartAt', () => {
  it('returns the original URL when startAtSeconds is undefined', () => {
    const url = 'https://www.youtube.com/embed/abc123';
    expect(applyStartAt(url, undefined)).toBe(url);
  });

  it('returns the original URL when startAtSeconds is 0', () => {
    const url = 'https://www.youtube.com/embed/abc123';
    expect(applyStartAt(url, 0)).toBe(url);
  });

  it('returns the original URL when startAtSeconds is negative', () => {
    const url = 'https://www.youtube.com/embed/abc123';
    expect(applyStartAt(url, -5)).toBe(url);
  });

  it('returns the original URL when it is empty', () => {
    expect(applyStartAt('', 30)).toBe('');
  });

  it('appends start=30 for YouTube embed URLs', () => {
    const url = 'https://www.youtube.com/embed/abc123';
    expect(applyStartAt(url, 30)).toBe(
      'https://www.youtube.com/embed/abc123?start=30'
    );
  });

  it('appends start=N for bare youtube.com', () => {
    const url = 'https://youtube.com/embed/xyz';
    expect(applyStartAt(url, 90)).toBe(
      'https://youtube.com/embed/xyz?start=90'
    );
  });

  it('floors fractional seconds', () => {
    const url = 'https://www.youtube.com/embed/abc';
    expect(applyStartAt(url, 12.7)).toBe(
      'https://www.youtube.com/embed/abc?start=12'
    );
  });

  it('does not modify Google Drive preview URLs', () => {
    const url = 'https://drive.google.com/file/d/fileId123/preview';
    expect(applyStartAt(url, 30)).toBe(url);
  });

  it('does not modify Google Vids preview URLs', () => {
    const url = 'https://vids.google.com/vids/vidId456/preview';
    expect(applyStartAt(url, 30)).toBe(url);
  });

  it('does not modify unsupported hosts', () => {
    const url = 'https://example.com/video';
    expect(applyStartAt(url, 30)).toBe(url);
  });

  it('does not match lookalike domains like notyoutube.com', () => {
    const url = 'https://notyoutube.com/embed/abc';
    expect(applyStartAt(url, 30)).toBe(url);
  });

  it('preserves existing query parameters', () => {
    const url = 'https://www.youtube.com/embed/abc123?autoplay=1&mute=1';
    const result = applyStartAt(url, 45);
    expect(result).toContain('autoplay=1');
    expect(result).toContain('mute=1');
    expect(result).toContain('start=45');
  });

  it('overwrites an existing start parameter', () => {
    const url = 'https://www.youtube.com/embed/abc?start=10';
    expect(applyStartAt(url, 60)).toBe(
      'https://www.youtube.com/embed/abc?start=60'
    );
  });

  it('returns the original string for malformed URLs', () => {
    const url = 'not-a-valid-url';
    expect(applyStartAt(url, 30)).toBe(url);
  });
});
