import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  downloadDataUrl,
  exportAllPagesPng,
  exportPagePng,
  exportPdf,
} from '@/components/widgets/DrawingWidget/exportCanvas';
import type { DrawingPage, PathObject } from '@/types';

// Stub `toDataURL` on every HTMLCanvasElement so jsdom-allocated canvases
// produce a deterministic PNG data URL. The renderer's actual paint calls are
// already mocked by `tests/setup.ts`.
const STUB_PNG = 'data:image/png;base64,STUBPNG==';
HTMLCanvasElement.prototype.toDataURL = vi.fn(() => STUB_PNG);

const pathObject = (overrides: Partial<PathObject> = {}): PathObject => ({
  id: 'p1',
  kind: 'path',
  z: 0,
  points: [
    { x: 0, y: 0 },
    { x: 10, y: 10 },
  ],
  color: '#000',
  width: 2,
  ...overrides,
});

const page = (
  id: string,
  objects: PathObject[] = [],
  background?: DrawingPage['background']
): DrawingPage => ({
  id,
  objects,
  background,
});

describe('exportPagePng', () => {
  it('returns a PNG data URL for the given page', async () => {
    const target = page('p1', [pathObject({ id: 'a' })], 'grid');
    const out = await exportPagePng(target, { w: 800, h: 600 });
    expect(out).toBe(STUB_PNG);
    expect(out.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('handles an empty page without throwing', async () => {
    const out = await exportPagePng(page('empty', []), { w: 800, h: 600 });
    expect(out).toBe(STUB_PNG);
  });
});

describe('exportAllPagesPng', () => {
  it('returns one PNG data URL per page', async () => {
    const pages: DrawingPage[] = [
      page('a', [pathObject({ id: 'a1' })]),
      page('b', [pathObject({ id: 'b1', z: 1 })], 'grid'),
      page('c', []),
    ];
    const out = await exportAllPagesPng(pages, { w: 800, h: 600 });
    expect(out).toHaveLength(3);
    expect(out.every((s) => s === STUB_PNG)).toBe(true);
  });

  it('resolves with an empty array when given no pages', async () => {
    const out = await exportAllPagesPng([], { w: 800, h: 600 });
    expect(out).toEqual([]);
  });
});

describe('downloadDataUrl', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('creates a download link with the right href and filename', () => {
    // Spy on anchor.click so we don't trigger a real navigation in jsdom.
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {
        // No-op: prevent jsdom from following the synthetic anchor.
      });
    downloadDataUrl('data:image/png;base64,XYZ', 'Whiteboard.png');
    expect(clickSpy).toHaveBeenCalledOnce();
    clickSpy.mockRestore();
  });
});

describe('exportPdf', () => {
  it('opens a print window, writes one <img> per page, and calls print()', async () => {
    const writeSpy = vi.fn();
    const printSpy = vi.fn();
    const focusSpy = vi.fn();
    const openSpy = vi.fn().mockImplementation(() => {
      // Fake window: just a doc.open/write/close trio + print/focus. Images
      // are flagged `complete=true, naturalWidth=1` so the waiter resolves
      // immediately without needing `load` events.
      const doc = {
        open: vi.fn(),
        write: writeSpy,
        close: vi.fn(),
        images: [
          { complete: true, naturalWidth: 1, addEventListener: vi.fn() },
          { complete: true, naturalWidth: 1, addEventListener: vi.fn() },
        ] as unknown as HTMLImageElement[],
      };
      const win: Partial<Window> = {
        document: doc as unknown as Document,
        print: printSpy,
        focus: focusSpy,
      };
      return win as Window;
    });
    const pages: DrawingPage[] = [
      page('a', [pathObject({ id: 'a1' })]),
      page('b', [pathObject({ id: 'b1' })]),
    ];

    await exportPdf(pages, { w: 800, h: 600 }, 'Whiteboard.pdf', openSpy);

    expect(openSpy).toHaveBeenCalledOnce();
    // Body HTML should contain exactly N <img> tags (one per page).
    expect(writeSpy).toHaveBeenCalledOnce();
    const html = writeSpy.mock.calls[0][0] as string;
    const imgCount = (html.match(/<img /g) ?? []).length;
    expect(imgCount).toBe(2);
    expect(printSpy).toHaveBeenCalledOnce();
  });

  it('throws when the pop-up blocker prevents window.open', async () => {
    const openSpy = vi.fn().mockReturnValue(null);
    const pages: DrawingPage[] = [page('a', [pathObject({ id: 'a1' })])];
    await expect(
      exportPdf(pages, { w: 800, h: 600 }, 'Whiteboard.pdf', openSpy)
    ).rejects.toThrow(/blocked/i);
  });

  it('is a no-op when there are no pages to export', async () => {
    const openSpy = vi.fn();
    await exportPdf([], { w: 800, h: 600 }, 'Whiteboard.pdf', openSpy);
    expect(openSpy).not.toHaveBeenCalled();
  });
});
