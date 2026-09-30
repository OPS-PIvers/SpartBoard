// D9 resolver, server side: the final score a gradebook cell, export or student projection shows.
import type {
  AttemptPolicy,
  GradeAttempt,
  GradeIndexRow,
  GradebookColumnMirror,
  GradebookConfigMirror,
  GradebookFlagMirror,
  GradebookMarkMirror,
} from './types';

export const MISSING_FLAG_ID = 'missing';
export const LATE_FLAG_ID = 'late';
export const EXCUSED_FLAG_ID = 'excused';

export const DEFAULT_FLAGS: GradebookFlagMirror[] = [
  {
    id: MISSING_FLAG_ID,
    key: 'M',
    name: 'Missing',
    color: 'rose',
    value: 0,
    excludes: false,
    visibility: 'students',
  },
  {
    id: EXCUSED_FLAG_ID,
    key: 'X',
    name: 'Excused',
    color: 'slate',
    value: null,
    excludes: true,
    visibility: 'students',
  },
  {
    id: LATE_FLAG_ID,
    key: 'L',
    name: 'Late',
    color: 'amber',
    value: null,
    excludes: false,
    visibility: 'teacher',
  },
  {
    id: 'incomplete',
    key: 'I',
    name: 'Incomplete',
    color: 'orange',
    value: null,
    excludes: false,
    visibility: 'teacher',
  },
  {
    id: 'absent',
    key: 'A',
    name: 'Absent',
    color: 'sky',
    value: null,
    excludes: false,
    visibility: 'teacher',
  },
];

export const DEFAULT_CONFIG: GradebookConfigMirror = {
  flags: DEFAULT_FLAGS,
  autoFlags: true,
  studentVisibility: {
    scores: true,
    flags: true,
    comments: true,
    standards: false,
  },
};

export const DEFAULT_COLUMN: GradebookColumnMirror = {
  maxPointsOverride: null,
  attemptPolicy: 'latest',
  countsTowardOverall: true,
};

export const EMPTY_MARK: GradebookMarkMirror = {
  override: null,
  comment: null,
  flags: [],
  suppressedAuto: [],
  publishOverride: null,
};

export type FinalStatus = 'scored' | 'excluded' | 'awaiting-grade' | 'empty';

export interface FinalScore {
  status: FinalStatus;
  pct: number | null;
  points: number | null;
  max: number | null;
  source: 'override' | 'raw' | 'flag' | null;
  /** Active flag ids, manual and automatic, visibility 'off' removed. */
  flags: string[];
  autoFlags: string[];
}

export type RawForResolve = Pick<
  GradeIndexRow,
  | 'rawPct'
  | 'points'
  | 'max'
  | 'state'
  | 'submittedAt'
  | 'dueAt'
  | 'closeAt'
  | 'late'
  | 'attempts'
  | 'assigned'
  | 'completionOnly'
>;

/** The attempt the column's retake policy counts; null when no attempt carries a score. */
export function pickAttemptPct(
  attempts: readonly GradeAttempt[],
  policy: AttemptPolicy
): number | null {
  const scored = attempts.filter((a) => typeof a.pct === 'number');
  if (scored.length === 0) return null;
  const pcts = scored.map((a) => a.pct as number);
  if (policy === 'highest') return Math.max(...pcts);
  if (policy === 'average')
    return (
      Math.round((pcts.reduce((s, p) => s + p, 0) / pcts.length) * 100) / 100
    );
  return [...scored].sort((a, b) => b.n - a.n)[0].pct;
}

/** D15 auto flags: Late after the due date, Missing once the deadline passes with nothing in. */
export function autoFlagsFor(raw: RawForResolve, now: number): string[] {
  if (!raw.assigned) return [];
  const out: string[] = [];
  if (raw.late) out.push(LATE_FLAG_ID);
  const deadline = raw.dueAt ?? raw.closeAt;
  if (raw.submittedAt === null && deadline !== null && deadline < now)
    out.push(MISSING_FLAG_ID);
  return out;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Final score under D9, D14 and D15; a real score or override always beats a flag's value. */
export function resolveFinalScore(
  raw: RawForResolve | null,
  mark: GradebookMarkMirror | null,
  column: GradebookColumnMirror | null,
  config: GradebookConfigMirror = DEFAULT_CONFIG,
  now: number = Date.now()
): FinalScore {
  const m = mark ?? EMPTY_MARK;
  const col = column ?? DEFAULT_COLUMN;
  const flagById = new Map(config.flags.map((f) => [f.id, f]));
  const on = (id: string): boolean => {
    const f = flagById.get(id);
    return f !== undefined && f.visibility !== 'off';
  };
  const auto =
    raw && config.autoFlags
      ? autoFlagsFor(raw, now).filter(
          (id) => on(id) && !m.suppressedAuto.includes(id)
        )
      : [];
  const manual = m.flags.filter(on);
  const flags = [...new Set([...manual, ...auto])];
  const max = col.maxPointsOverride ?? raw?.max ?? null;
  const base = { flags, autoFlags: auto.filter((id) => !manual.includes(id)) };

  if (flags.some((id) => flagById.get(id)?.excludes === true))
    return {
      ...base,
      status: 'excluded',
      pct: null,
      points: null,
      max,
      source: null,
    };

  if (m.override) {
    const points = m.override.points;
    const pct = max && max > 0 ? round2((points / max) * 100) : null;
    return { ...base, status: 'scored', pct, points, max, source: 'override' };
  }

  // A retake in progress still shows the earlier attempts under the column's policy.
  const retaking = raw?.state === 'in-progress' && raw.attempts.length > 0;
  if (raw && (raw.state === 'scored' || retaking) && !raw.completionOnly) {
    const pct =
      raw.attempts.length > 0
        ? (pickAttemptPct(raw.attempts, col.attemptPolicy) ?? raw.rawPct)
        : raw.rawPct;
    if (pct !== null) {
      const points = max !== null ? round2((pct / 100) * max) : raw.points;
      return { ...base, status: 'scored', pct, points, max, source: 'raw' };
    }
  }

  if (raw && raw.state === 'awaiting-grade')
    return {
      ...base,
      status: 'awaiting-grade',
      pct: null,
      points: null,
      max,
      source: null,
    };

  const values = flags
    .map((id) => flagById.get(id)?.value)
    .filter((v): v is number => typeof v === 'number');
  if (values.length > 0) {
    const pct = Math.min(...values);
    const points = max !== null ? round2((pct / 100) * max) : null;
    return { ...base, status: 'scored', pct, points, max, source: 'flag' };
  }
  return {
    ...base,
    status: 'empty',
    pct: null,
    points: null,
    max,
    source: null,
  };
}
