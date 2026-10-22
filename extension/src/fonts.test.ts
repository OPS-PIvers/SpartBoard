import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadLexend } from './fonts';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadLexend', () => {
  it('adds each bundled face once, from the extension', () => {
    const added: { family: string; source: string }[] = [];
    vi.stubGlobal(
      'FontFace',
      class {
        constructor(
          public family: string,
          public source: string
        ) {}
        load = () => Promise.resolve(this);
      }
    );
    vi.stubGlobal('chrome', {
      runtime: { getURL: (p: string) => `chrome-extension://id/${p}` },
    });
    const doc = {
      fonts: { add: (f: { family: string; source: string }) => added.push(f) },
    } as unknown as Document;
    loadLexend(doc);
    loadLexend(doc);
    expect(added.map((f) => f.family)).toEqual(['Lexend', 'Lexend']);
    expect(added[0].source).toContain(
      'chrome-extension://id/fonts/lexend-latin.woff2'
    );
  });

  it('does nothing where FontFace is missing', () => {
    vi.stubGlobal('FontFace', undefined);
    const add = vi.fn();
    loadLexend({ fonts: { add } } as unknown as Document);
    expect(add).not.toHaveBeenCalled();
  });
});
