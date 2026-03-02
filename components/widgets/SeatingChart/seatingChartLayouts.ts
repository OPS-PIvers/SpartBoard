import { FurnitureItem } from '@/types';

const DESK_W = 80;
const DESK_H = 65;

// Named layout constants — keeps geometry calculations self-documenting
// and ensures a single place to adjust spacing if desk sizes change.
const ROWS_MARGIN = 40; // canvas edge margin for rows layout
const PODS_MARGIN = 30; // canvas edge margin for pods layout
const PODS_HEADER_OFFSET = 40; // extra top offset so pods don't crowd the top edge

function snapToGrid(val: number, gridSize: number): number {
  return Math.round(val / gridSize) * gridSize;
}

// Columns layout: the teacher's "rows" input is really a column count.
// Each column is a vertical stack of desks; numColumns controls how many
// side-by-side columns are placed across the canvas.
export function generateColumnsLayout(
  numStudents: number,
  numColumns: number,
  canvasW: number,
  canvasH: number,
  gridSize: number
): FurnitureItem[] {
  if (numStudents <= 0 || numColumns <= 0) return [];

  const desksPerColumn = Math.ceil(numStudents / numColumns);

  // Count actual columns that will have at least one desk
  const actualColumns = Math.min(
    numColumns,
    Math.ceil(numStudents / desksPerColumn)
  );

  const availW = canvasW - ROWS_MARGIN * 2;
  const availH = canvasH - ROWS_MARGIN * 2;

  // Spacing between desk top-left corners along each axis.
  // Base spacing on actual columns placed so the grid fills the canvas evenly.
  const colSpacing =
    actualColumns > 1 ? (availW - DESK_W) / (actualColumns - 1) : availW / 2;
  const rowSpacing =
    desksPerColumn > 1 ? (availH - DESK_H) / (desksPerColumn - 1) : availH / 2;

  const items: FurnitureItem[] = [];
  let count = 0;

  // Outer loop = columns (x-axis); inner loop = desks within each column (y-axis).
  for (let col = 0; col < numColumns && count < numStudents; col++) {
    const x = snapToGrid(
      actualColumns === 1
        ? canvasW / 2 - DESK_W / 2
        : ROWS_MARGIN + col * colSpacing,
      gridSize
    );
    for (let row = 0; row < desksPerColumn && count < numStudents; row++) {
      const y = snapToGrid(
        desksPerColumn === 1
          ? canvasH / 2 - DESK_H / 2
          : ROWS_MARGIN + row * rowSpacing,
        gridSize
      );
      items.push({
        id: crypto.randomUUID(),
        type: 'desk',
        x,
        y,
        width: DESK_W,
        height: DESK_H,
        rotation: 0,
      });
      count++;
    }
  }

  return items;
}

// Horseshoe layout: outer U + inner U, both opening upward toward the teacher.
//
// Rotation geometry for 90°/270° rotated desks (CSS rotates around the element
// centre, not the top-left corner):
//   A desk at CSS (cssX, cssY) with width=W, height=H, rotated 90° CW has:
//     visual_left   = cssX + (W − H) / 2      visual_right  = cssX + (W + H) / 2
//     visual_top    = cssY − (W − H) / 2      visual_bottom = cssY + (W + H) / 2
//
// So for our 80 × 65 desk  (ROT_HALF = 7.5):
//   Visual width  = H = 65, visual height = W = 80.
//   To place a rotated desk with its visual left at VL and visual top at VT:
//     cssX = VL − ROT_HALF      cssY = VT + ROT_HALF
//
// All layout arithmetic below is done in visual-space to avoid placement bugs.
export function generateHorseshoeLayout(
  _numStudents: number,
  canvasW: number,
  canvasH: number,
  gridSize: number
): FurnitureItem[] {
  const ROT_HALF = (DESK_W - DESK_H) / 2; // 7.5 px
  const VIS_W = DESK_H; // 65 – visual width  of a 90°-rotated desk
  const VIS_H = DESK_W; // 80 – visual height of a 90°-rotated desk

  const EDGE = 20; // canvas edge margin
  const TOP_SPACE = 60; // reserved above the first arm desk (teacher area)
  const GAP = 14; // visual edge-to-edge gap between adjacent desks
  const BETWEEN = 24; // visual gap between outer and inner arm columns

  // Outer U desk counts
  const N_OUTER_ARM = 4;
  const N_OUTER_BOT = 6;
  // Inner U desk counts
  const N_INNER_ARM = 3;
  const N_INNER_BOT = 3;

  const items: FurnitureItem[] = [];
  const snap = (v: number) => Math.round(v / gridSize) * gridSize;

  // ── Helpers ─────────────────────────────────────────────────────────────────

  // Place N desks in a vertical arm.
  //   vLeft  = visual left edge of the arm column.
  //   armVTop / armVBot = visual top of first desk / visual BOTTOM of last desk.
  function placeArm(
    n: number,
    vLeft: number,
    armVTop: number,
    armVBot: number,
    rotation: number
  ) {
    if (n <= 0) return;
    const cssX = snap(vLeft - ROT_HALF);
    // arm_span = visual distance from top-of-first to bottom-of-last desk
    const span = armVBot - armVTop;
    // step between successive visual tops  (step = VIS_H means desks touch edge-to-edge)
    const step = n > 1 ? (span - VIS_H) / (n - 1) : 0;
    for (let i = 0; i < n; i++) {
      const vt = n === 1 ? armVTop + (span - VIS_H) / 2 : armVTop + i * step;
      items.push({
        id: crypto.randomUUID(),
        type: 'desk',
        x: cssX,
        y: snap(vt + ROT_HALF),
        width: DESK_W,
        height: DESK_H,
        rotation,
      });
    }
  }

  // Place N desks in a horizontal row.
  //   vTop   = visual / CSS top (rotation 0° – no vertical offset).
  //   xFirst = visual left of the first desk.
  //   xLast  = visual left of the last  desk.
  function placeRow(
    n: number,
    vTop: number,
    xFirst: number,
    xLast: number,
    rotation: number
  ) {
    if (n <= 0) return;
    const cssY = snap(vTop);
    const step = n > 1 ? (xLast - xFirst) / (n - 1) : 0;
    for (let i = 0; i < n; i++) {
      const x = n === 1 ? snap((xFirst + xLast) / 2) : snap(xFirst + i * step);
      items.push({
        id: crypto.randomUUID(),
        type: 'desk',
        x,
        y: cssY,
        width: DESK_W,
        height: DESK_H,
        rotation,
      });
    }
  }

  // ── Outer U ──────────────────────────────────────────────────────────────────

  const oArmL_vLeft = EDGE; // outer-left arm visual left
  const oArmR_vLeft = canvasW - EDGE - VIS_W; // outer-right arm visual left

  // Bottom row sits flush with the canvas bottom edge
  const outerRowVTop = canvasH - EDGE - DESK_H;
  // Arms run from TOP_SPACE to just above the outer bottom row
  const outerArmVTop = EDGE + TOP_SPACE;
  const outerArmVBot = outerRowVTop - GAP; // visual BOTTOM of last arm desk

  // Bottom row extends between the two arm columns (with a gap on each side)
  const outerRowXFirst = oArmL_vLeft + VIS_W + GAP;
  const outerRowXLast = oArmR_vLeft - GAP - DESK_W;

  placeArm(N_OUTER_ARM, oArmL_vLeft, outerArmVTop, outerArmVBot, 90);
  placeArm(N_OUTER_ARM, oArmR_vLeft, outerArmVTop, outerArmVBot, 270);
  placeRow(N_OUTER_BOT, outerRowVTop, outerRowXFirst, outerRowXLast, 0);

  // ── Inner U ──────────────────────────────────────────────────────────────────

  // Inner arms are BETWEEN px inward from the outer arms
  const iArmL_vLeft = oArmL_vLeft + VIS_W + BETWEEN;
  const iArmR_vLeft = oArmR_vLeft - VIS_W - BETWEEN;

  // Inner bottom row sits BETWEEN px above the outer bottom row
  const innerRowVTop = outerRowVTop - DESK_H - BETWEEN;
  // Inner arms start at the same height as outer arms
  const innerArmVTop = outerArmVTop;
  const innerArmVBot = innerRowVTop - GAP;

  const innerRowXFirst = iArmL_vLeft + VIS_W + GAP;
  const innerRowXLast = iArmR_vLeft - GAP - DESK_W;

  placeArm(N_INNER_ARM, iArmL_vLeft, innerArmVTop, innerArmVBot, 90);
  placeArm(N_INNER_ARM, iArmR_vLeft, innerArmVTop, innerArmVBot, 270);
  placeRow(N_INNER_BOT, innerRowVTop, innerRowXFirst, innerRowXLast, 0);

  return items;
}

export function generatePodsLayout(
  numStudents: number,
  canvasW: number,
  canvasH: number,
  gridSize: number
): FurnitureItem[] {
  if (numStudents <= 0) return [];

  const fullPods = Math.floor(numStudents / 4);
  const remainder = numStudents % 4;
  const numPods = fullPods + (remainder > 0 ? 1 : 0);

  // Pod is 2x2 arrangement of desks
  const podGapInner = 10; // gap between desks within a pod
  const podW = DESK_W * 2 + podGapInner;
  const podH = DESK_H * 2 + podGapInner;
  const podGapOuter = 40; // gap between pods

  const availW = canvasW - PODS_MARGIN * 2;

  const podsPerRow = Math.max(
    1,
    Math.floor((availW + podGapOuter) / (podW + podGapOuter))
  );

  // Centre the pod grid horizontally
  const totalGridW = podsPerRow * podW + (podsPerRow - 1) * podGapOuter;
  const startX = Math.max(PODS_MARGIN, (canvasW - totalGridW) / 2);
  const startY = PODS_MARGIN + PODS_HEADER_OFFSET;

  // 2x2 desk offsets: top-left, top-right, bottom-left, bottom-right
  const podDeskOffsets = [
    { dx: 0, dy: 0 },
    { dx: DESK_W + podGapInner, dy: 0 },
    { dx: 0, dy: DESK_H + podGapInner },
    { dx: DESK_W + podGapInner, dy: DESK_H + podGapInner },
  ];

  const items: FurnitureItem[] = [];

  for (let pi = 0; pi < numPods; pi++) {
    const podRow = Math.floor(pi / podsPerRow);
    const podCol = pi % podsPerRow;
    const podX = startX + podCol * (podW + podGapOuter);
    const podY = startY + podRow * (podH + podGapOuter);

    const isLast = pi === numPods - 1 && remainder > 0;
    const desksInThisPod = isLast ? remainder : 4;

    for (let di = 0; di < desksInThisPod; di++) {
      items.push({
        id: crypto.randomUUID(),
        type: 'desk',
        x: snapToGrid(podX + podDeskOffsets[di].dx, gridSize),
        y: snapToGrid(podY + podDeskOffsets[di].dy, gridSize),
        width: DESK_W,
        height: DESK_H,
        rotation: 0,
      });
    }
  }

  return items;
}
