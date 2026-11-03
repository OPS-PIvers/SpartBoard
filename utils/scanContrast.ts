// Local paper level at or above this share reads as white.
const WHITE_POINT = 0.9;
// The darkest local ink is stretched toward black, but never from a point lighter than this.
const MAX_BLACK_POINT = 0.75;
// Ink darker than this is already readable; clipping it to black keeps a printed box line from muting nearby pencil.
const MIN_BLACK_POINT = 0.45;
// Mild curve that deepens grey pencil without moving white paper or stroke edges much.
const INK_GAMMA = 1.3;

// Long edge cap so a large scan can't stall the page or exhaust canvas memory.
const MAX_EDGE = 2400;

// Cells whose brightest pixel is below this share of the page's paper level count as filled, not paper.
const MIN_PAPER_SHARE = 0.6;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

function rankFilter(
  grid: Float32Array,
  gw: number,
  gh: number,
  radius: number,
  pick: (a: number, b: number) => number
): Float32Array {
  const out = new Float32Array(grid.length);
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      let v = grid[y * gw + x];
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= gh) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= gw) continue;
          v = pick(v, grid[yy * gw + xx]);
        }
      }
      out[y * gw + x] = v;
    }
  }
  return out;
}

function boxBlur(grid: Float32Array, gw: number, gh: number): Float32Array {
  const out = new Float32Array(grid.length);
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      let sum = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= gh) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= gw) continue;
          sum += grid[yy * gw + xx];
          n++;
        }
      }
      out[y * gw + x] = sum / n;
    }
  }
  return out;
}

function sampler(grid: Float32Array, gw: number, gh: number, cell: number) {
  return (px: number, py: number) => {
    const gx = Math.min(Math.max((px + 0.5) / cell - 0.5, 0), gw - 1);
    const gy = Math.min(Math.max((py + 0.5) / cell - 0.5, 0), gh - 1);
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const x1 = Math.min(x0 + 1, gw - 1);
    const y1 = Math.min(y0 + 1, gh - 1);
    const fx = gx - x0;
    const fy = gy - y0;
    const top = grid[y0 * gw + x0] * (1 - fx) + grid[y0 * gw + x1] * fx;
    const bot = grid[y1 * gw + x0] * (1 - fx) + grid[y1 * gw + x1] * fx;
    return top * (1 - fy) + bot * fy;
  };
}

/** Fills cells not marked valid with the mean of valid neighbours, growing inward. */
function inpaint(
  grids: Float32Array[],
  valid: boolean[],
  gw: number,
  gh: number
): void {
  if (!valid.some(Boolean)) return;
  let pending = valid.some((v) => !v);
  while (pending) {
    pending = false;
    const next = valid.slice();
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const i = y * gw + x;
        if (valid[i]) continue;
        const sums = [0, 0, 0];
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= gh) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            const j = yy * gw + xx;
            if (xx < 0 || xx >= gw || !valid[j]) continue;
            for (let c = 0; c < 3; c++) sums[c] += grids[c][j];
            n++;
          }
        }
        if (n) {
          for (let c = 0; c < 3; c++) grids[c][i] = sums[c] / n;
          next[i] = true;
        } else {
          pending = true;
        }
      }
    }
    for (let i = 0; i < valid.length; i++) valid[i] = next[i];
  }
}

/** Whitens uneven paper and stretches ink to full contrast in place, without thickening strokes. */
export function enhanceScanContrast(
  data: Uint8ClampedArray,
  width: number,
  height: number
): void {
  if (width < 1 || height < 1 || data.length < width * height * 4) return;
  const cell = Math.min(
    32,
    Math.max(8, Math.round(Math.max(width, height) / 64))
  );
  const gw = Math.ceil(width / cell);
  const gh = Math.ceil(height / cell);

  // Brightest value per cell and channel.
  const grids = [0, 1, 2].map(() => new Float32Array(gw * gh));
  for (let y = 0; y < height; y++) {
    const row = ((y / cell) | 0) * gw;
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4;
      const i = row + ((x / cell) | 0);
      for (let c = 0; c < 3; c++) {
        if (data[p + c] > grids[c][i]) grids[c][i] = data[p + c];
      }
    }
  }
  // A cell far darker than the page's paper is a filled or shaded area, so its paper level comes from neighbours.
  const cellLum = grids[0].map(
    (r, i) => 0.299 * r + 0.587 * grids[1][i] + 0.114 * grids[2][i]
  );
  const sorted = Float32Array.from(cellLum).sort();
  const pagePaper = sorted[Math.floor((sorted.length - 1) * 0.9)];
  const valid = Array.from(cellLum, (v) => v >= pagePaper * MIN_PAPER_SHARE);
  inpaint(grids, valid, gw, gh);

  // Paper level per channel, spread past wide strokes, then smoothed.
  const paper = grids.map((grid) => {
    const spread = rankFilter(grid, gw, gh, 2, Math.max);
    for (let i = 0; i < spread.length; i++) spread[i] = Math.max(spread[i], 1);
    return sampler(boxBlur(boxBlur(spread, gw, gh), gw, gh), gw, gh, cell);
  });

  const norm = new Float32Array(width * height * 3);
  const inkGrid = new Float32Array(gw * gh).fill(1);
  for (let y = 0; y < height; y++) {
    const row = ((y / cell) | 0) * gw;
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      const r = clamp01(data[p * 4] / paper[0](x, y));
      const g = clamp01(data[p * 4 + 1] / paper[1](x, y));
      const b = clamp01(data[p * 4 + 2] / paper[2](x, y));
      norm[p * 3] = r;
      norm[p * 3 + 1] = g;
      norm[p * 3 + 2] = b;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const i = row + ((x / cell) | 0);
      if (lum < inkGrid[i]) inkGrid[i] = lum;
    }
  }

  // Black point: darkest nearby ink, capped so blank paper noise is never stretched into marks.
  const ink = rankFilter(inkGrid, gw, gh, 2, Math.min);
  for (let i = 0; i < ink.length; i++)
    ink[i] = Math.min(Math.max(ink[i], MIN_BLACK_POINT), MAX_BLACK_POINT);
  const black = sampler(boxBlur(boxBlur(ink, gw, gh), gw, gh), gw, gh, cell);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      const k = black(x, y);
      const span = WHITE_POINT - k;
      const r = clamp01((norm[p * 3] - k) / span) ** INK_GAMMA;
      const g = clamp01((norm[p * 3 + 1] - k) / span) ** INK_GAMMA;
      const b = clamp01((norm[p * 3 + 2] - k) / span) ** INK_GAMMA;
      // Near-white pixels lose any paper tint; ink keeps its colour.
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const keep = 1 - clamp01((lum - 0.7) / 0.3);
      data[p * 4] = Math.round((lum + (r - lum) * keep) * 255);
      data[p * 4 + 1] = Math.round((lum + (g - lum) * keep) * 255);
      data[p * 4 + 2] = Math.round((lum + (b - lum) * keep) * 255);
    }
  }
}

/** Loads an image URL and returns an object URL of its contrast-enhanced copy, or null if the browser can't. */
export async function enhancedScanUrl(src: string): Promise<string | null> {
  try {
    const img = new Image();
    img.src = src;
    await img.decode();
    if (!img.naturalWidth || !img.naturalHeight) return null;
    const scale = Math.min(
      1,
      MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight)
    );
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    // Let the spinner paint before the synchronous pass.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const pixels = ctx.getImageData(0, 0, width, height);
    enhanceScanContrast(pixels.data, width, height);
    ctx.putImageData(pixels, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/png')
    );
    return blob ? URL.createObjectURL(blob) : null;
  } catch {
    return null;
  }
}
