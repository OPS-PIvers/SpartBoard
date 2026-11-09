// Shared sizes for markup over step pictures, used by the read-only layer and the editor.
/** Line width, number size and arrowhead as fractions of the picture's longer side. */
export const MARKUP_STROKE = 0.005;
export const MARKUP_BADGE = 0.022;
export const MARKUP_HEAD = 0.025;

/** An arrowhead's three corners, pointing from (x1, y1) to (x2, y2), in picture pixels. */
export function arrowHead(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  size: number
): string {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const at = (a: number) =>
    `${x2 - size * Math.cos(angle + a)},${y2 - size * Math.sin(angle + a)}`;
  return `${x2},${y2} ${at(Math.PI / 7)} ${at(-Math.PI / 7)}`;
}
