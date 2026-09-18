// "Spartron" lockup for printed paper sheets: an 8-bit wordmark plus a bubble-sheet glyph.

const GLYPHS: Record<string, readonly string[]> = {
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
};

export const SPARTRON_WORD = 'SPARTRON';
export const SPARTRON_TAGLINE = 'SpartBoard Responses';

const GLYPH_W = 5;
const GLYPH_H = 7;
const GAP = 1;
const ICON_W = 9;
const ICON_GAP = 2;

/** Total width of the lockup in pixel units, for callers sizing the box. */
export const SPARTRON_UNITS_W =
  ICON_W + ICON_GAP + SPARTRON_WORD.length * (GLYPH_W + GAP) - GAP;
export const SPARTRON_UNITS_H = GLYPH_H;

function pixelRects(): string {
  const out: string[] = [];
  let x0 = ICON_W + ICON_GAP;
  for (const ch of SPARTRON_WORD) {
    const rows = GLYPHS[ch];
    rows.forEach((row, y) => {
      for (let x = 0; x < GLYPH_W; x += 1) {
        if (row[x] === '#') {
          out.push(
            `<rect x="${x0 + x + 0.08}" y="${y + 0.08}" width="0.84" height="0.84"/>`
          );
        }
      }
    });
    x0 += GLYPH_W + GAP;
  }
  return out.join('');
}

/** A tiny answer sheet: three rows of bubbles with one filled per row. */
function iconSvg(): string {
  const bubbles: string[] = [];
  const filled = [0, 2, 1];
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      const cx = 2 + col * 2.5;
      const cy = 1.5 + row * 2;
      bubbles.push(
        `<circle cx="${cx}" cy="${cy}" r="0.75" fill="${filled[row] === col ? '#000' : '#fff'}" stroke="#000" stroke-width="0.25"/>`
      );
    }
  }
  return `<rect x="0.15" y="0.15" width="${ICON_W - 0.3}" height="${GLYPH_H - 0.3}" rx="0.6" fill="#fff" stroke="#000" stroke-width="0.3"/>${bubbles.join('')}`;
}

/**
 * Inline SVG of the wordmark, `heightMm` tall and scaled proportionally.
 * Pure black on white so a 1-bit scan keeps it crisp.
 */
export function spartronLogoSvg(heightMm: number): string {
  const widthMm = (heightMm * SPARTRON_UNITS_W) / SPARTRON_UNITS_H;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SPARTRON_UNITS_W} ${SPARTRON_UNITS_H}" width="${widthMm.toFixed(3)}mm" height="${heightMm.toFixed(3)}mm" role="img" aria-label="${SPARTRON_WORD}" shape-rendering="crispEdges" fill="#000">${iconSvg()}${pixelRects()}</svg>`;
}
