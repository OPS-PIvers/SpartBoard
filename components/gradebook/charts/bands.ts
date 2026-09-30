import {
  proficiencyLevel,
  type ProficiencyLevel,
  type ProficiencyScale,
} from '@/utils/gradebook/gradebookCore';

export type BandLevel = ProficiencyLevel;

export interface BandStyle {
  level: BandLevel;
  name: string;
  /** Solid fill for a bar. */
  bar: string;
  /** Background and text for a heatmap cell. */
  cell: string;
  /** Text colour for a number. */
  text: string;
  /** Fill for SVG marks. */
  hex: string;
}

const LEVEL_STYLES: Record<BandLevel, Omit<BandStyle, 'level' | 'name'>> = {
  0: {
    bar: 'bg-emerald-600',
    cell: 'bg-emerald-100 text-emerald-800',
    text: 'text-emerald-700',
    hex: '#059669',
  },
  1: {
    bar: 'bg-amber-600',
    cell: 'bg-amber-100 text-amber-800',
    text: 'text-amber-700',
    hex: '#d97706',
  },
  2: {
    bar: 'bg-brand-red-primary',
    cell: 'bg-rose-100 text-rose-800',
    text: 'text-rose-700',
    hex: '#ad2122',
  },
};

export function bandStyle(
  level: BandLevel,
  scale: ProficiencyScale
): BandStyle {
  return { level, name: scale.levelNames[level], ...LEVEL_STYLES[level] };
}

/** The band a percent falls in on the chosen scale; null with no value. */
export function bandFor(
  pct: number | null,
  scale: ProficiencyScale
): BandStyle | null {
  const level = proficiencyLevel(pct, scale);
  return level === null ? null : bandStyle(level, scale);
}

/** Level names with their ranges, top first, for legends and tooltips. */
export function bandRanges(
  scale: ProficiencyScale
): { style: BandStyle; range: string }[] {
  return [
    { style: bandStyle(0, scale), range: `${scale.proficient}+` },
    {
      style: bandStyle(1, scale),
      range: `${scale.approaching}–${scale.proficient - 1}`,
    },
    { style: bandStyle(2, scale), range: `below ${scale.approaching}` },
  ];
}
