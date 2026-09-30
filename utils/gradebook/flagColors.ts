// Flag chip colors by palette name; click order for the settings color chip (no purples, D14).
export const FLAG_COLOR_PALETTE = [
  'rose',
  'amber',
  'orange',
  'emerald',
  'teal',
  'sky',
  'blue',
  'slate',
] as const;

export type FlagColorName = (typeof FLAG_COLOR_PALETTE)[number];

const SOLID: Record<FlagColorName, string> = {
  rose: 'bg-rose-700 text-white',
  amber: 'bg-amber-600 text-white',
  orange: 'bg-orange-600 text-white',
  emerald: 'bg-emerald-600 text-white',
  teal: 'bg-teal-600 text-white',
  sky: 'bg-sky-600 text-white',
  blue: 'bg-blue-600 text-white',
  slate: 'bg-slate-500 text-white',
};

const OUTLINE: Record<FlagColorName, string> = {
  rose: 'bg-white text-rose-700 ring-[1.5px] ring-inset ring-rose-700',
  amber: 'bg-white text-amber-600 ring-[1.5px] ring-inset ring-amber-600',
  orange: 'bg-white text-orange-600 ring-[1.5px] ring-inset ring-orange-600',
  emerald: 'bg-white text-emerald-600 ring-[1.5px] ring-inset ring-emerald-600',
  teal: 'bg-white text-teal-600 ring-[1.5px] ring-inset ring-teal-600',
  sky: 'bg-white text-sky-600 ring-[1.5px] ring-inset ring-sky-600',
  blue: 'bg-white text-blue-600 ring-[1.5px] ring-inset ring-blue-600',
  slate: 'bg-white text-slate-500 ring-[1.5px] ring-inset ring-slate-500',
};

function asColor(color: string): FlagColorName {
  return (FLAG_COLOR_PALETTE as readonly string[]).includes(color)
    ? (color as FlagColorName)
    : 'slate';
}

/** Tailwind classes for a flag chip; `auto` is the outlined style auto flags use (D15). */
export function flagChipClasses(color: string, auto = false): string {
  const c = asColor(color);
  return auto ? OUTLINE[c] : SOLID[c];
}

export function nextFlagColor(color: string): FlagColorName {
  const i = FLAG_COLOR_PALETTE.indexOf(asColor(color));
  return FLAG_COLOR_PALETTE[(i + 1) % FLAG_COLOR_PALETTE.length];
}
