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
