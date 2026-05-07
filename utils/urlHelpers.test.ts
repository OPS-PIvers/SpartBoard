import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  getOriginUrl,
  getJoinUrl,
  convertToEmbedUrl,
  extractGoogleFileId,
} from './urlHelpers';

describe('urlHelpers', () => {
  const originalWindow = global.window;

  afterEach(() => {
    // Restore window after each test
    global.window = originalWindow;
    vi.restoreAllMocks();
  });

  describe('extractGoogleFileId', () => {
    it('extracts ID from Google Docs URL', () => {
      const url = 'https://docs.google.com/document/d/1abc123_XYZ/edit';
      expect(extractGoogleFileId(url)).toBe('1abc123_XYZ');
    });

    it('extracts ID from Google Sheets URL', () => {
      const url = 'https://docs.google.com/spreadsheets/d/sheet-id/edit';
      expect(extractGoogleFileId(url)).toBe('sheet-id');
    });

    it('extracts ID from Google Slides URL', () => {
      const url = 'https://docs.google.com/presentation/d/preso-id/preview';
      expect(extractGoogleFileId(url)).toBe('preso-id');
    });

    it('extracts ID from Google Vids URL', () => {
      const url = 'https://vids.google.com/vids/vid-id/preview';
      expect(extractGoogleFileId(url)).toBe('vid-id');
    });

    it('extracts ID from Google Drive file URL', () => {
      const url = 'https://drive.google.com/file/d/drive-id/view';
      expect(extractGoogleFileId(url)).toBe('drive-id');
    });

    it('extracts ID from Google Drive open?id= URL', () => {
      const url = 'https://drive.google.com/open?id=open-id';
      expect(extractGoogleFileId(url)).toBe('open-id');
    });

    it('returns null for non-Google URLs', () => {
      expect(extractGoogleFileId('https://example.com')).toBeNull();
    });

    it('returns null for empty input', () => {
      expect(extractGoogleFileId('')).toBeNull();
    });
  });

  describe('getOriginUrl', () => {
    it('returns window.location.origin when window is defined', () => {
      // Setup window mock
      Object.defineProperty(global, 'window', {
        value: {
          location: {
            origin: 'https://myschool.com',
          },
        },
        writable: true,
      });

      expect(getOriginUrl()).toBe('https://myschool.com');
    });

    it('returns empty string when window is undefined', () => {
      // @ts-expect-error - Simulating SSR environment
      delete global.window;

      expect(getOriginUrl()).toBe('');
    });
  });

  describe('getJoinUrl', () => {
    it('returns full join URL when window is defined', () => {
      Object.defineProperty(global, 'window', {
        value: {
          location: {
            origin: 'https://myschool.com',
          },
        },
        writable: true,
      });

      expect(getJoinUrl()).toBe('https://myschool.com/join');
    });

    it('returns relative join path when window is undefined', () => {
      // @ts-expect-error - Simulating SSR environment
      delete global.window;

      expect(getJoinUrl()).toBe('/join');
    });
  });

  describe('convertToEmbedUrl', () => {
    it('handles empty or null URLs', () => {
      expect(convertToEmbedUrl('')).toBe('');
      expect(convertToEmbedUrl('   ')).toBe('');
    });

    it('converts YouTube watch URLs to embed URLs', () => {
      expect(
        convertToEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
      ).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
      expect(convertToEmbedUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(
        'https://www.youtube.com/embed/dQw4w9WgXcQ'
      );
    });

    it('converts YouTube Live URLs to embed URLs', () => {
      expect(
        convertToEmbedUrl('https://www.youtube.com/live/dQw4w9WgXcQ')
      ).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
      expect(
        convertToEmbedUrl(
          'https://www.youtube.com/live/dQw4w9WgXcQ?feature=share'
        )
      ).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
    });

    describe('Google Drive', () => {
      const fileId = 'abc123XYZ_file-id';

      it('converts file view links to preview links', () => {
        expect(
          convertToEmbedUrl(`https://drive.google.com/file/d/${fileId}/view`)
        ).toBe(`https://drive.google.com/file/d/${fileId}/preview`);
      });

      it('handles file edit links', () => {
        expect(
          convertToEmbedUrl(`https://drive.google.com/file/d/${fileId}/edit`)
        ).toBe(`https://drive.google.com/file/d/${fileId}/preview`);
      });

      it('converts open?id= links to preview links', () => {
        expect(
          convertToEmbedUrl(`https://drive.google.com/open?id=${fileId}`)
        ).toBe(`https://drive.google.com/file/d/${fileId}/preview`);
      });
    });

    describe('Google Docs', () => {
      const docId = '1abc123_XYZ';

      it('converts /edit URLs to /edit?rm=minimal', () => {
        const url = `https://docs.google.com/document/d/${docId}/edit`;
        expect(convertToEmbedUrl(url)).toBe(
          `https://docs.google.com/document/d/${docId}/edit?rm=minimal`
        );
      });

      it('handles URLs with user segments (e.g., /u/0/)', () => {
        const url = `https://docs.google.com/document/u/0/d/${docId}/edit`;
        expect(convertToEmbedUrl(url)).toBe(
          `https://docs.google.com/document/d/${docId}/edit?rm=minimal`
        );
      });

      it('preserves other query parameters and fragments', () => {
        const url = `https://docs.google.com/document/d/${docId}/edit?foo=bar#heading=h.123`;
        const result = convertToEmbedUrl(url);
        expect(result).toContain('rm=minimal');
        expect(result).toContain('foo=bar');
        expect(result).toContain('#heading=h.123');
      });

      it('handles URLs with existing tab parameters', () => {
        const url = `https://docs.google.com/document/d/${docId}/edit?tab=t.0`;
        const result = convertToEmbedUrl(url);
        expect(result).toContain('rm=minimal');
        expect(result).toContain('tab=t.0');
      });

      it('handles bare document URLs', () => {
        const url = `https://docs.google.com/document/d/${docId}`;
        expect(convertToEmbedUrl(url)).toBe(
          `https://docs.google.com/document/d/${docId}/edit?rm=minimal`
        );
      });
    });

    describe('Google Slides', () => {
      it('converts edit URLs to /preview and clears other params', () => {
        const url =
          'https://docs.google.com/presentation/d/preso-id/edit?delayms=3000';
        const result = convertToEmbedUrl(url);
        expect(result).toBe(
          'https://docs.google.com/presentation/d/preso-id/preview'
        );
      });

      it('handles user segments', () => {
        const url = 'https://docs.google.com/presentation/u/0/d/preso-id/edit';
        expect(convertToEmbedUrl(url)).toBe(
          'https://docs.google.com/presentation/d/preso-id/preview'
        );
      });
    });

    describe('Google Sheets', () => {
      it('converts edit URLs to /preview and preserves other params', () => {
        const url =
          'https://docs.google.com/spreadsheets/d/sheet-id/edit?gid=0';
        const result = convertToEmbedUrl(url);
        expect(result).toBe(
          'https://docs.google.com/spreadsheets/d/sheet-id/preview?gid=0'
        );
      });
    });

    describe('Google Forms', () => {
      it('adds embedded=true and preserves others', () => {
        const url =
          'https://docs.google.com/forms/d/form-id/viewform?usp=sf_link';
        const result = convertToEmbedUrl(url);
        expect(result).toContain('embedded=true');
        expect(result).toContain('usp=sf_link');
      });
    });

    describe('Google Vids', () => {
      const vidId = 'some_vids_id-123';

      it('converts vids.google.com/vids/{id} to preview URL', () => {
        const url = `https://vids.google.com/vids/${vidId}`;
        expect(convertToEmbedUrl(url)).toBe(
          `https://vids.google.com/vids/${vidId}/preview`
        );
      });

      it('converts vids.google.com/u/0/vids/{id} to preview URL', () => {
        const url = `https://vids.google.com/u/0/vids/${vidId}`;
        expect(convertToEmbedUrl(url)).toBe(
          `https://vids.google.com/vids/${vidId}/preview`
        );
      });
    });

    it('returns original URL for non-Google/YouTube links', () => {
      const url = 'https://example.com';
      expect(convertToEmbedUrl(url)).toBe(url);
    });
    it('returns original URL if URL parsing fails for Google Docs-like strings', () => {
      const invalidUrl = 'https://docs.google.com:999999/%%';
      expect(convertToEmbedUrl(invalidUrl)).toBe(invalidUrl);
    });
  });
});
