import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  absoluteUrls,
  fontFaceBlocks,
  inlineFontBlocks,
  loadedFaceKeys,
  normalizeRange,
  usedFontFaceBlocks,
} from './snapshotFonts';

const lexendLatin = `@font-face {
  font-family: 'Lexend';
  font-style: normal;
  font-weight: 400;
  src: url(https://fonts.gstatic.com/s/lexend/latin.woff2) format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153;
}`;
const lexendViet = `@font-face {
  font-family: 'Lexend';
  font-weight: 400;
  src: url(https://fonts.gstatic.com/s/lexend/viet.woff2) format('woff2');
  unicode-range: U+0102-0103, U+0110-0111;
}`;
const vt323 = `@font-face {
  font-family: 'VT323';
  src: url(https://fonts.gstatic.com/s/vt323/latin.woff2) format('woff2');
  unicode-range: U+0000-00FF;
}`;
const lexendBold = lexendLatin.replace('font-weight: 400', 'font-weight: 700');
const sheet = `/* latin */\n${lexendLatin}\n${lexendBold}\n/* vietnamese */\n${lexendViet}\n${vt323}`;

const face = (
  family: string,
  unicodeRange: string,
  status = 'loaded',
  weight = '400'
) =>
  ({
    family,
    unicodeRange,
    status,
    weight,
    style: 'normal',
  }) as unknown as FontFace;

describe('snapshotFonts', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads one unicode-range the way the browser rewrites it', () => {
    expect(normalizeRange('U+0000-00FF, U+0131, U+0152-0153')).toBe(
      normalizeRange('U+0-FF, U+131, U+152-153')
    );
    expect(normalizeRange('U+4??')).toBe('400-4ff');
  });

  it('keeps only the faces the page has loaded, by weight', () => {
    const blocks = fontFaceBlocks(sheet);
    expect(blocks).toHaveLength(4);
    const loaded = loadedFaceKeys([
      face('"Lexend"', 'U+0-FF, U+131, U+152-153'),
      face('VT323', 'U+0-FF', 'unloaded'),
    ]);
    expect(usedFontFaceBlocks(blocks, loaded)).toEqual([lexendLatin]);
  });

  it('inlines each font file once and drops a face whose file fails', async () => {
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve(
        url.includes('vt323')
          ? new Response(null, { status: 404 })
          : new Response('abc', { headers: { 'content-type': 'font/woff2' } })
      )
    );
    vi.stubGlobal('fetch', fetchMock);
    const css = await inlineFontBlocks([lexendLatin, lexendLatin, vt323]);
    expect(css).toContain('url(data:font/woff2;base64,YWJj)');
    expect(css).not.toContain('gstatic');
    expect(css).not.toContain('VT323');
    expect(
      fetchMock.mock.calls.filter(([u]) => u.includes('lexend'))
    ).toHaveLength(1);
  });
});

describe('absoluteUrls', () => {
  it("resolves a same-origin sheet's relative font files against the sheet", () => {
    const block =
      "@font-face { font-family: KaTeX_Main; src: url(fonts/KaTeX_Main-Regular.woff2) format('woff2'), url('data:font/woff2;base64,AA'); }";
    expect(
      absoluteUrls(
        block,
        'https://spartboard.web.app/mathlive/mathlive-fonts.css'
      )
    ).toContain(
      'url(https://spartboard.web.app/mathlive/fonts/KaTeX_Main-Regular.woff2)'
    );
    expect(absoluteUrls(block, 'https://x.test/a.css')).toContain(
      "url('data:font/woff2;base64,AA')"
    );
  });
});
