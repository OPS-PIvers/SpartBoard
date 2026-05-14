// Shared color palette for Scoreboard team chips and Randomizer group
// headers. Roughly hue-ordered so the picker reads as a rainbow strip.
export const SCOREBOARD_COLORS = [
  'bg-sky-500',
  'bg-blue-500',
  'bg-indigo-500',
  'bg-violet-500',
  'bg-purple-500',
  'bg-fuchsia-500',
  'bg-pink-500',
  'bg-rose-500',
  'bg-red-500',
  'bg-orange-500',
  'bg-amber-500',
  'bg-yellow-500',
  'bg-lime-500',
  'bg-green-500',
  'bg-emerald-500',
  'bg-teal-600',
  'bg-cyan-500',
  'bg-slate-600',
] as const;

export type ScoreboardColor = (typeof SCOREBOARD_COLORS)[number];

export const DEFAULT_SCOREBOARD_COLOR: ScoreboardColor = 'bg-blue-500';

const KNOWN_SCOREBOARD_COLORS = new Set<string>(SCOREBOARD_COLORS);

// Module-level "already warned" set so a corrupted-data session that
// renders 30 teams with the same unknown color value only emits one
// console.warn instead of 30. Resets across page loads.
const warnedUnknownColors = new Set<string>();

/**
 * Normalize a persisted color string to a known Scoreboard palette value.
 * Unknown values fall back to the default and emit a one-time
 * `console.warn` so a palette rename / migration miss / third-party
 * import lands on the developer console instead of silently rendering
 * white text on no background.
 */
export function normalizeScoreboardColor(
  color: string | null | undefined
): ScoreboardColor {
  if (color && KNOWN_SCOREBOARD_COLORS.has(color)) {
    return color as ScoreboardColor;
  }
  if (color && !warnedUnknownColors.has(color)) {
    warnedUnknownColors.add(color);
    console.warn(
      `[scoreboard] Unknown team color "${color}" — falling back to ${DEFAULT_SCOREBOARD_COLOR}. This is almost certainly stale persisted data; check for a palette change.`
    );
  }
  return DEFAULT_SCOREBOARD_COLOR;
}
