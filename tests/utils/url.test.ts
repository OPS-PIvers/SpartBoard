import { describe, it, expect } from 'vitest';
import { extractYouTubeId } from '@/utils/url';

describe('url utility', () => {
  describe('extractYouTubeId', () => {
    it('extracts id from standard watch url', () => {
      expect(
        extractYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
      ).toBe('dQw4w9WgXcQ');
    });

    it('extracts id from youtu.be url', () => {
      expect(extractYouTubeId('https://youtu.be/dQw4w9WgXcQ')).toBe(
        'dQw4w9WgXcQ'
      );
    });

    it('extracts id from embed url', () => {
      expect(
        extractYouTubeId('https://www.youtube.com/embed/dQw4w9WgXcQ')
      ).toBe('dQw4w9WgXcQ');
    });

    it('extracts id from url with other parameters', () => {
      expect(
        extractYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s')
      ).toBe('dQw4w9WgXcQ');
    });

    it('extracts id from shortened url with other parameters', () => {
      expect(extractYouTubeId('https://youtu.be/dQw4w9WgXcQ?t=42s')).toBe(
        'dQw4w9WgXcQ'
      );
    });

    it('returns null for empty string', () => {
      expect(extractYouTubeId('')).toBe(null);
    });

    it('returns null for non-youtube url', () => {
      expect(extractYouTubeId('https://example.com')).toBe(null);
    });
  });
});
