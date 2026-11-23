// Finds the inked part of a rendered page, so a printed copy can drop the file's own margins.

/** A channel darker than this is ink; lighter is paper, including a faint page tint. */
const INK_BELOW = 235;

export interface PixelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The smallest rectangle holding every inked pixel of RGBA `data`, padded; null for a blank page. */
export function pageContentBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  padPx: number
): PixelRect | null {
  let top = -1;
  let bottom = -1;
  let left = width;
  let right = -1;
  for (let y = 0; y < height; y += 1) {
    const row = y * width * 4;
    let rowLeft = -1;
    let rowRight = -1;
    for (let x = 0; x < width; x += 1) {
      const i = row + x * 4;
      // Transparent pixels are paper.
      if (data[i + 3] < 16) continue;
      if (
        data[i] < INK_BELOW ||
        data[i + 1] < INK_BELOW ||
        data[i + 2] < INK_BELOW
      ) {
        if (rowLeft < 0) rowLeft = x;
        rowRight = x;
      }
    }
    if (rowLeft < 0) continue;
    if (top < 0) top = y;
    bottom = y;
    if (rowLeft < left) left = rowLeft;
    if (rowRight > right) right = rowRight;
  }
  if (top < 0) return null;
  const x = Math.max(0, left - padPx);
  const y = Math.max(0, top - padPx);
  return {
    x,
    y,
    w: Math.min(width, right + 1 + padPx) - x,
    h: Math.min(height, bottom + 1 + padPx) - y,
  };
}
