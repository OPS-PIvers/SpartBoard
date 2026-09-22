import { describe, it, expect } from 'vitest';
import { parseSubsDeepLink, subsDeepLinkPath } from './subsDeepLink';

describe('parseSubsDeepLink', () => {
  it('reads a share link', () => {
    expect(parseSubsDeepLink('/subs/s/share-1')).toEqual({
      shareId: 'share-1',
    });
  });

  it('reads a share link pinned to one board', () => {
    expect(parseSubsDeepLink('/subs/s/share-1/board-9')).toEqual({
      shareId: 'share-1',
      boardId: 'board-9',
    });
  });

  it('tolerates a trailing slash', () => {
    expect(parseSubsDeepLink('/subs/s/share-1/')).toEqual({
      shareId: 'share-1',
    });
  });

  // The portal itself and the pre-deep-link paths have to fall through to the
  // building picker rather than being read as a share id.
  it.each(['/subs', '/subs/', '/subs/s', '/subs/s/', '/', '/boards'])(
    'returns null for %s',
    (path) => {
      expect(parseSubsDeepLink(path)).toBeNull();
    }
  );

  it('returns null for a path with segments past the board', () => {
    expect(parseSubsDeepLink('/subs/s/share-1/board-9/extra')).toBeNull();
  });

  it('decodes percent-escaped ids', () => {
    expect(parseSubsDeepLink('/subs/s/share%20one')).toEqual({
      shareId: 'share one',
    });
  });

  // A half-written escape would otherwise throw out of the router on mount.
  it('returns null for a malformed escape rather than throwing', () => {
    expect(parseSubsDeepLink('/subs/s/%E0%A4%A')).toBeNull();
  });

  // `.` and `..` are not addressable Firestore document ids, and a decoded
  // slash would silently change which document is read.
  it.each(['/subs/s/.', '/subs/s/..', '/subs/s/a%2Fb'])(
    'returns null for the unusable id in %s',
    (path) => {
      expect(parseSubsDeepLink(path)).toBeNull();
    }
  );
});

describe('subsDeepLinkPath', () => {
  it('builds a share link and a board link', () => {
    expect(subsDeepLinkPath('share-1')).toBe('/subs/s/share-1');
    expect(subsDeepLinkPath('share-1', 'board-9')).toBe(
      '/subs/s/share-1/board-9'
    );
  });

  it('round-trips an id needing escaping', () => {
    const path = subsDeepLinkPath('share one', 'board two');
    expect(path).toBe('/subs/s/share%20one/board%20two');
    expect(parseSubsDeepLink(path)).toEqual({
      shareId: 'share one',
      boardId: 'board two',
    });
  });

  // An id carrying a slash escapes to %2F, which the parser then refuses
  // rather than reading a different document than the link named. No real
  // Firestore id contains one, so there is nothing to round-trip here.
  it('does not round-trip an id containing a slash', () => {
    expect(parseSubsDeepLink(subsDeepLinkPath('a/b'))).toBeNull();
  });
});
