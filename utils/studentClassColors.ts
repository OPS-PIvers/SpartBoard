/**
 * Deterministic class color assignment for the student `/my-assignments`
 * sidebar. Hashes the ClassLink `sourcedId` (or test-class id) into a small
 * brand-aligned palette so a given class always paints the same color across
 * sessions and devices, without any persisted state.
 *
 * The palette is hand-picked to keep visual differentiation high while
 * staying in the SpartBoard / Orono Technology brand range — anchored on
 * the brand blue (`#2D3F89`) and brand red (`#AD2122`), with subject-style
 * hues filling out the spread.
 */
export interface ClassColor {
  /** Solid color for the 4px sidebar bar. */
  bar: string;
  /** Soft tint for hover/active surfaces (≈8% alpha equivalent, opaque). */
  soft: string;
  /** High-contrast ink for text rendered on `soft`. */
  ink: string;
}

const PALETTE: readonly ClassColor[] = [
  { bar: '#2D3F89', soft: '#EAECF5', ink: '#1D2A5D' }, // brand blue
  { bar: '#AD2122', soft: '#F7E3E3', ink: '#7A1718' }, // brand red
  { bar: '#0F6B3A', soft: '#DCEFE2', ink: '#0A4D2A' }, // forest
  { bar: '#7A1718', soft: '#F0DADB', ink: '#561011' }, // brand red dark
  { bar: '#4356A0', soft: '#E1E5F1', ink: '#2D3F89' }, // brand blue light
  { bar: '#B8860B', soft: '#F4EAD0', ink: '#7C5B07' }, // amber
  { bar: '#2A6F8F', soft: '#DBE8EF', ink: '#1A4A60' }, // teal blue
  { bar: '#6B3FA0', soft: '#E5DCEF', ink: '#4A2C70' }, // muted violet
];

/**
 * 32-bit FNV-1a hash. Compact, dependency-free, and good enough for
 * "spread N classIds across 8 buckets without obvious clumping". Same
 * implementation a teacher's color picker would use — switching the input
 * string but not the algorithm yields a stable assignment.
 */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // 32-bit FNV prime multiply, kept in unsigned 32-bit range.
    hash =
      (hash +
        ((hash << 1) +
          (hash << 4) +
          (hash << 7) +
          (hash << 8) +
          (hash << 24))) >>>
      0;
  }
  return hash >>> 0;
}

/**
 * Returns the palette entry for a given classId. Stable across calls;
 * different classIds spread across the palette via FNV-1a modulo.
 */
export function getClassColor(classId: string): ClassColor {
  if (!classId) return PALETTE[0];
  const idx = fnv1a(classId) % PALETTE.length;
  return PALETTE[idx];
}

/** Exposed for tests — kept stable as part of the public contract. */
export const CLASS_COLOR_PALETTE = PALETTE;
