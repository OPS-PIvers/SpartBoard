import { describe, expect, it, vi } from 'vitest';
import {
  PDF_SCALE,
  SCAN_RASTER_DPI,
  rasterizeScan,
  type PdfDocumentLike,
  type RasterDeps,
  type RasterSurface,
} from './paperScanRaster';

const fakeSurface = (
  width: number,
  height: number
): RasterSurface & { released: boolean } => {
  const surface = {
    width,
    height,
    released: false,
    getImageData: () => ({
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4),
    }),
    drawImage: vi.fn(),
    renderPdf: vi.fn(() => Promise.resolve()),
    toDataUrl: vi.fn(() => 'data:image/png;base64,x'),
    release: () => {
      surface.released = true;
    },
  };
  return surface;
};

const deps = (
  pdf: PdfDocumentLike,
  surfaces: ReturnType<typeof fakeSurface>[]
): RasterDeps => ({
  createSurface: (w, h) => {
    const s = fakeSurface(w, h);
    surfaces.push(s);
    return s;
  },
  loadPdf: () => Promise.resolve(pdf),
  loadImage: () =>
    Promise.resolve({
      width: 300,
      height: 400,
      close: vi.fn(),
    } as unknown as ImageBitmap),
});

const pdfFile = () =>
  new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'scan.pdf', {
    type: 'application/pdf',
  });

describe('rasterizeScan', () => {
  it('rasterizes each PDF page at the reader dpi and releases it before the next', async () => {
    const destroy = vi.fn();
    const pdf: PdfDocumentLike = {
      numPages: 3,
      getPage: (n) =>
        Promise.resolve({
          getViewport: ({ scale }) => ({
            width: 612 * scale,
            height: 792 * scale + n,
          }),
          render: () => ({ promise: Promise.resolve() }),
        }),
      destroy,
    };
    const surfaces: ReturnType<typeof fakeSurface>[] = [];
    const seen: number[] = [];
    for await (const page of rasterizeScan(pdfFile(), deps(pdf, surfaces))) {
      seen.push(page.pageNumber);
      expect(page.page.width).toBe(Math.round(612 * PDF_SCALE));
      expect(surfaces.filter((s) => !s.released)).toHaveLength(1);
      expect(page.crop({ x: 0, y: 0, w: 10, h: 10 })).toMatch(
        /^data:image\/png/
      );
    }
    expect(seen).toEqual([1, 2, 3]);
    expect(surfaces.every((s) => s.released)).toBe(true);
    expect(destroy).toHaveBeenCalledOnce();
    expect(SCAN_RASTER_DPI / 72).toBe(PDF_SCALE);
  });

  it('treats an image as a single page', async () => {
    const surfaces: ReturnType<typeof fakeSurface>[] = [];
    const pages = [];
    const png = new File([new Uint8Array(4)], 'scan.png', {
      type: 'image/png',
    });
    for await (const page of rasterizeScan(
      png,
      deps(
        { numPages: 0, getPage: () => Promise.reject(new Error('not a pdf')) },
        surfaces
      )
    )) {
      pages.push(page);
    }
    expect(pages).toHaveLength(1);
    expect(pages[0].page.width).toBe(300);
    expect(surfaces[0].drawImage).toHaveBeenCalledOnce();
    expect(surfaces[0].released).toBe(true);
  });

  it('recognises a PDF by extension when the type is missing', async () => {
    const pdf: PdfDocumentLike = {
      numPages: 1,
      getPage: () =>
        Promise.resolve({
          getViewport: () => ({ width: 10, height: 10 }),
          render: () => ({ promise: Promise.resolve() }),
        }),
    };
    const untyped = new File([new Uint8Array(4)], 'Scan_0001.PDF');
    const pages = [];
    for await (const page of rasterizeScan(untyped, deps(pdf, [])))
      pages.push(page);
    expect(pages).toHaveLength(1);
  });
});
