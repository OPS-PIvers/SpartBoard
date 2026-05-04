import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  attemptChunkReload,
  isChunkLoadError,
  neverResolvingPromise,
} from './chunkLoadError';

describe('chunkLoadError', () => {
  describe('isChunkLoadError', () => {
    it('matches errors named ChunkLoadError', () => {
      const err = new Error('whatever');
      err.name = 'ChunkLoadError';
      expect(isChunkLoadError(err)).toBe(true);
    });

    it('matches Vite dynamic-import failure messages', () => {
      const err = new TypeError(
        'Failed to fetch dynamically imported module: https://example.com/assets/Widget-abc123.js'
      );
      expect(isChunkLoadError(err)).toBe(true);
    });

    it('matches the lowercase Vite error variant', () => {
      const err = new Error(
        'error loading dynamically imported module: /assets/Widget-abc123.js'
      );
      expect(isChunkLoadError(err)).toBe(true);
    });

    it('matches the Safari-style import failure', () => {
      const err = new Error('Importing a module script failed.');
      expect(isChunkLoadError(err)).toBe(true);
    });

    it('matches the MIME-type / text/html surface that Firebase SPA rewrites produce', () => {
      const err = new Error(
        'Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html".'
      );
      expect(isChunkLoadError(err)).toBe(true);
    });

    it('matches webpack-style "Loading chunk N failed"', () => {
      const err = new Error('Loading chunk 42 failed.');
      expect(isChunkLoadError(err)).toBe(true);
    });

    it('matches CSS chunk failures', () => {
      const err = new Error('Loading CSS chunk 3 failed.');
      expect(isChunkLoadError(err)).toBe(true);
    });

    it('does not match unrelated errors', () => {
      expect(isChunkLoadError(new Error('Network request failed'))).toBe(false);
      expect(isChunkLoadError(new TypeError('foo is not a function'))).toBe(
        false
      );
      expect(isChunkLoadError(new RangeError('Invalid index'))).toBe(false);
    });

    it('returns false for non-error values', () => {
      expect(isChunkLoadError(null)).toBe(false);
      expect(isChunkLoadError(undefined)).toBe(false);
      expect(isChunkLoadError('a string')).toBe(false);
      expect(isChunkLoadError(42)).toBe(false);
      expect(isChunkLoadError({})).toBe(false);
    });
  });

  describe('attemptChunkReload', () => {
    let reloadSpy: ReturnType<typeof vi.fn>;
    let originalLocation: Location;

    beforeEach(() => {
      window.sessionStorage.clear();
      reloadSpy = vi.fn();
      originalLocation = window.location;
      // jsdom's location.reload is non-configurable; replace the whole object.
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: { ...originalLocation, reload: reloadSpy },
      });
    });

    afterEach(() => {
      window.sessionStorage.clear();
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: originalLocation,
      });
    });

    it('reloads the page on first call and returns true', () => {
      expect(attemptChunkReload()).toBe(true);
      expect(reloadSpy).toHaveBeenCalledTimes(1);
    });

    it('does not reload twice in the same session', () => {
      attemptChunkReload();
      reloadSpy.mockClear();

      expect(attemptChunkReload()).toBe(false);
      expect(reloadSpy).not.toHaveBeenCalled();
    });
  });

  describe('neverResolvingPromise', () => {
    it('returns a promise that never settles', async () => {
      const p = neverResolvingPromise<number>();
      const settled = await Promise.race([
        p.then(() => 'resolved').catch(() => 'rejected'),
        new Promise((resolve) => setTimeout(() => resolve('timeout'), 20)),
      ]);
      expect(settled).toBe('timeout');
    });
  });
});
