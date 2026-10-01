import {
  proficiencyLevel,
  type ProficiencyLevel,
  type ProficiencyScale,
} from '@/utils/gradebook/gradebookCore';
import {
  SCALE_COLOR_STYLES,
  type ScaleColorStyle,
} from '@/utils/gradebook/scaleColors';

export type BandLevel = ProficiencyLevel;

export interface BandStyle extends ScaleColorStyle {
  level: BandLevel;
  name: string;
}

export function bandStyle(
  level: BandLevel,
  scale: ProficiencyScale
): BandStyle {
  const l = scale.levels[Math.min(level, scale.levels.length - 1)];
  return { level, name: l.name, ...SCALE_COLOR_STYLES[l.color] };
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
  const n = scale.levels.length;
  return scale.levels.map((l, i) => ({
    style: bandStyle(i, scale),
    range:
      i === 0
        ? `${l.min}+`
        : i === n - 1
          ? `below ${scale.levels[i - 1].min}`
          : `${l.min}–${scale.levels[i - 1].min - 1}`,
  }));
}

/** Every cutoff between levels, low to high. */
export function scaleCutoffs(scale: ProficiencyScale): number[] {
  return scale.levels
    .slice(0, -1)
    .map((l) => l.min)
    .reverse();
}
