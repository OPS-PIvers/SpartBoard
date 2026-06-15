/**
 * Unified score-color scale shared by the Quiz and Video Activity monitor and
 * results views — the single source of truth for green/amber/red banding so the
 * two widgets never drift apart again.
 *
 * Thresholds: >= 80 success, >= 60 warn, else danger. (Video Activity previously
 * used 70/40; unifying to 80/60 changes only the COLOR shown — never the numeric
 * score, accuracy math, or any grade pushed to Classroom/Schoology.)
 */
export type ScoreTone = 'success' | 'warn' | 'danger';

export interface ScoreColorClasses {
  /** Foreground text color, e.g. a score number. */
  text: string;
  /** Solid fill for a progress/accuracy bar. */
  bar: string;
  /** Soft background + border for a score-band card/row wash. */
  band: string;
}

const TONE_CLASSES: Record<ScoreTone, ScoreColorClasses> = {
  success: {
    text: 'text-emerald-600',
    bar: 'bg-emerald-500',
    band: 'bg-emerald-50 border-emerald-200',
  },
  warn: {
    text: 'text-amber-600',
    bar: 'bg-amber-500',
    band: 'bg-amber-50 border-amber-200',
  },
  danger: {
    text: 'text-brand-red-primary',
    bar: 'bg-brand-red-primary',
    band: 'bg-rose-50 border-rose-200',
  },
};

/** Map a 0–100 score to its tone using the unified 80/60 scale. */
export function scoreTone(score: number): ScoreTone {
  if (score >= 80) return 'success';
  if (score >= 60) return 'warn';
  return 'danger';
}

/** Tailwind class fragments (text / bar / band) for a 0–100 score. */
export function scoreColorClasses(score: number): ScoreColorClasses {
  return TONE_CLASSES[scoreTone(score)];
}
