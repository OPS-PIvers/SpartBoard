import { rasterizeScan, type RasterDeps } from './paperScanRaster';

/** Longest edge of a printed worksheet page, about 200 dpi on US Letter. */
export const WORKSHEET_PRINT_EDGE_PX = 2200;

/** Most worksheet pages one print run takes; each page is embedded once. */
export const MAX_WORKSHEET_UPLOAD_PAGES = 12;

export interface WorksheetPages {
  /** Object URLs, one per page; free them with `release`. */
  srcs: string[];
  /** Width over height of each source page. */
  aspects: number[];
  release: () => void;
}

const dataUrlToBlob = async (dataUrl: string): Promise<Blob> =>
  (await fetch(dataUrl)).blob();

/** Rasterize a teacher's worksheet PDF or image into printable page images. */
export async function rasterizeWorksheet(
  file: Blob,
  deps?: RasterDeps
): Promise<WorksheetPages> {
  const srcs: string[] = [];
  const aspects: number[] = [];
  const release = () => srcs.forEach((u) => URL.revokeObjectURL(u));
  try {
    for await (const raster of rasterizeScan(file, deps)) {
      if (srcs.length >= MAX_WORKSHEET_UPLOAD_PAGES) {
        throw new RangeError(
          `A worksheet can have at most ${MAX_WORKSHEET_UPLOAD_PAGES} pages.`
        );
      }
      const { width, height } = raster.page;
      const dataUrl = raster.crop(
        { x: 0, y: 0, w: width, h: height },
        WORKSHEET_PRINT_EDGE_PX
      );
      srcs.push(URL.createObjectURL(await dataUrlToBlob(dataUrl)));
      aspects.push(width / height);
    }
  } catch (error) {
    release();
    throw error;
  }
  if (srcs.length === 0) throw new Error('That file had no pages.');
  return { srcs, aspects, release };
}
