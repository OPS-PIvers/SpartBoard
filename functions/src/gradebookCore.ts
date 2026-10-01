// Server mirror of utils/gradebook/gradebookCore.ts; utils/gradebook/gradebookCore.test.ts fails if the body below drifts.
// ---- shared body ----

export type GradebookKind =
  | 'quiz'
  | 'video-activity'
  | 'guided-learning'
  | 'flashcards'
  | 'projects'
  | 'mini-app'
  | 'activity-wall';

export const GRADEBOOK_KINDS: readonly GradebookKind[] = [
  'quiz',
  'video-activity',
  'guided-learning',
  'flashcards',
  'projects',
  'mini-app',
  'activity-wall',
];

/** D6: columns that only show a check when work exists and never count. */
export const COMPLETION_ONLY_KINDS: readonly GradebookKind[] = [
  'mini-app',
  'activity-wall',
];

/** Session collection per kind; every one carries `teacherUid`. */
export const GRADEBOOK_SESSION_COLLECTIONS: Record<GradebookKind, string> = {
  quiz: 'quiz_sessions',
  'video-activity': 'video_activity_sessions',
  'guided-learning': 'guided_learning_sessions',
  flashcards: 'flashcard_sessions',
  projects: 'project_runs',
  'mini-app': 'mini_app_sessions',
  'activity-wall': 'activity_wall_sessions',
};

/** RR-06 grade state: awaiting-grade is never shown or pushed as 0. */
export type GradeState = 'scored' | 'awaiting-grade' | 'not-attempted';

export type AttemptPolicy = 'latest' | 'highest' | 'average';

export type ProficiencyMethod = 'mean' | 'recent' | 'highest' | 'decaying';

export type TargetKind = 'standard' | 'plc' | 'personal';

/** Structural copy of `QuestionTargetTag` so the server mirror needs no root import. */
export interface GradebookTargetTag {
  id: string;
  kind: TargetKind;
  ownerId?: string;
  code?: string;
  label: string;
  standardIds?: string[];
  parentId?: string;
}

export interface GradeAttempt {
  /** Epoch ms the attempt was submitted. */
  at: number;
  points: number | null;
  max: number | null;
  state: GradeState;
}

/** One target's share of a row's score; `earned`/`possible` are points. */
export interface TargetEvidence {
  targetId: string;
  kind: TargetKind;
  code?: string;
  label?: string;
  standardIds?: string[];
  parentId?: string;
  earned: number;
  possible: number;
}

/** D10 `grade_index/{sessionId}__{studentUid}`, server-written only. Times are epoch ms. */
export interface GradeIndexRow {
  kind: GradebookKind;
  sessionId: string;
  studentUid: string;
  ownerUid: string;
  editorUids: string[];
  rosterIds: string[];
  classIds: string[];
  /** Assignment title, so the grid can build columns from rows alone. */
  title: string;
  rawPct: number | null;
  points: number | null;
  max: number | null;
  state: GradeState;
  submittedAt: number | null;
  dueAt: number | null;
  openAt: number | null;
  closeAt: number | null;
  createdAt: number;
  attempts: GradeAttempt[];
  targetEvidence: TargetEvidence[];
  published: boolean;
  /** False when the student is outside the assignment's targeting (D25). */
  assigned: boolean;
  updatedAt: number;
}

export interface GradebookOverride {
  points: number;
  at: number;
}

export interface GradebookComment {
  text: string;
  shared: boolean;
  at: number;
}

/** D9 overlay `gradebook_marks/{sessionId}__{studentUid}`, teacher-written. */
export interface GradebookMark {
  kind: GradebookKind;
  sessionId: string;
  studentUid: string;
  ownerUid: string;
  editorUids: string[];
  /** Copied from the index row so a class query can find its marks. */
  rosterIds: string[];
  override: GradebookOverride | null;
  comment: GradebookComment | null;
  /** Flag ids set by hand. */
  flags: string[];
  /** Auto flag ids the teacher cleared (D15). */
  suppressedAuto: string[];
  /** Per-student publish (D7); null follows the session. */
  publishOverride: 'published' | 'unpublished' | null;
  updatedAt: number;
}

export type GradebookHistoryField =
  | 'override'
  | 'comment'
  | 'flags'
  | 'publish'
  | 'fill';

/** D24 `gradebook_marks/{id}/history/{autoId}`, append-only. */
export interface GradebookHistoryEntry {
  ownerUid: string;
  byUid: string;
  at: number;
  field: GradebookHistoryField;
  before: unknown;
  after: unknown;
  /** Shared by every entry of one bulk action so it undoes as one. */
  batchId: string | null;
}

/** D22 `gradebook_columns/{sessionId}`, teacher-written. */
export interface GradebookColumnConfig {
  kind: GradebookKind;
  sessionId: string;
  ownerUid: string;
  editorUids: string[];
  /** Category id from the class's settings; null means the first category. */
  category: string | null;
  countsTowardOverall: boolean;
  maxPointsOverride: number | null;
  attemptPolicy: AttemptPolicy;
  /** Column-level tags: the column's percent counts as evidence (D29). */
  targets: GradebookTargetTag[];
  hiddenInRosterIds: string[];
  updatedAt: number;
}

export type FlagVisibility = 'off' | 'teacher' | 'students';

/** Built-in ids that auto flags and Excused depend on (D14). */
export type BuiltInFlagId = 'missing' | 'excused' | 'late';

/** Whether a numeric flag value sets an unscored cell's percent or takes points off a scored one. */
export type FlagValueMode = 'score' | 'deduct';

export interface GradebookFlagDef {
  /** Stable id; built-ins use their name, custom flags a generated id. */
  id: string;
  name: string;
  /** One uppercase letter; never P (privacy shortcut). */
  key: string;
  color: string;
  /** Percent given to an unscored cell, 'excluded' (Excused only), or null for no effect. */
  value: number | 'excluded' | null;
  /** Missing means 'score'. */
  mode?: FlagValueMode;
  /** Drop the flag once the cell has a score; missing means false. */
  removeWhenScored?: boolean;
  visibility: FlagVisibility;
  builtIn: boolean;
}

export interface GradebookCategory {
  id: string;
  name: string;
  /** Percent, 0-100. */
  weight: number;
}

export interface ProficiencyScale {
  proficient: number;
  approaching: number;
  /** Top, middle, bottom. */
  levelNames: [string, string, string];
}

export type GradebookScaleChoice =
  | { source: 'district' }
  | { source: 'plc'; plcId: string }
  | { source: 'custom'; scale: ProficiencyScale };

export interface StudentVisibility {
  scores: boolean;
  flags: boolean;
  comments: boolean;
  standards: boolean;
}

/** D16 settings configuration body, shared by personal, PLC and district docs. */
export interface GradebookSettingsBody {
  name: string;
  flags: GradebookFlagDef[];
  categoriesEnabled: boolean;
  categories: GradebookCategory[];
  scale: GradebookScaleChoice;
  method: ProficiencyMethod;
  studentVisibility: StudentVisibility;
  autoFlags: boolean;
}

export const DEFAULT_DECAY_WEIGHT = 0.65;

export const DEFAULT_PROFICIENCY_SCALE: ProficiencyScale = {
  proficient: 80,
  approaching: 60,
  levelNames: ['Proficient', 'Approaching', 'Beginning'],
};

export const DEFAULT_GRADEBOOK_FLAGS: GradebookFlagDef[] = [
  {
    id: 'missing',
    name: 'Missing',
    key: 'M',
    color: 'rose',
    value: 0,
    removeWhenScored: true,
    visibility: 'students',
    builtIn: true,
  },
  {
    id: 'excused',
    name: 'Excused',
    key: 'X',
    color: 'slate',
    value: 'excluded',
    visibility: 'students',
    builtIn: true,
  },
  {
    id: 'late',
    name: 'Late',
    key: 'L',
    color: 'amber',
    value: null,
    mode: 'deduct',
    visibility: 'teacher',
    builtIn: true,
  },
  {
    id: 'incomplete',
    name: 'Incomplete',
    key: 'I',
    color: 'orange',
    value: null,
    visibility: 'teacher',
    builtIn: false,
  },
  {
    id: 'absent',
    name: 'Absent',
    key: 'A',
    color: 'sky',
    value: null,
    visibility: 'teacher',
    builtIn: false,
  },
];

export const DEFAULT_GRADEBOOK_CATEGORIES: GradebookCategory[] = [
  { id: 'achievement', name: 'Academic Achievement', weight: 60 },
  { id: 'practice', name: 'Academic Practice', weight: 40 },
];

export const DEFAULT_GRADEBOOK_SETTINGS: GradebookSettingsBody = {
  name: 'My settings',
  flags: DEFAULT_GRADEBOOK_FLAGS,
  categoriesEnabled: false,
  categories: DEFAULT_GRADEBOOK_CATEGORIES,
  scale: { source: 'district' },
  method: 'decaying',
  studentVisibility: {
    scores: true,
    flags: true,
    comments: true,
    standards: false,
  },
  autoFlags: true,
};

export const DEFAULT_ATTEMPT_POLICY: AttemptPolicy = 'latest';

export function gradebookDocId(sessionId: string, studentUid: string): string {
  return `${sessionId}__${studentUid}`;
}

export function isCompletionOnly(kind: GradebookKind): boolean {
  return COMPLETION_ONLY_KINDS.includes(kind);
}

export interface ActiveFlag {
  id: string;
  auto: boolean;
}

/** D15: manual flags plus auto Late/Missing, minus suppressed and switched-off flags. */
export function activeFlags(
  row: GradeIndexRow | null,
  mark: GradebookMark | null,
  flagDefs: GradebookFlagDef[],
  autoFlagsOn: boolean,
  now: number
): ActiveFlag[] {
  const on = new Set(
    flagDefs.filter((f) => f.visibility !== 'off').map((f) => f.id)
  );
  const out: ActiveFlag[] = [];
  const seen = new Set<string>();
  for (const id of mark?.flags ?? []) {
    if (on.has(id) && !seen.has(id)) {
      out.push({ id, auto: false });
      seen.add(id);
    }
  }
  if (!autoFlagsOn || !row || !row.assigned) return out;
  const suppressed = new Set(mark?.suppressedAuto ?? []);
  const addAuto = (id: BuiltInFlagId): void => {
    if (on.has(id) && !seen.has(id) && !suppressed.has(id)) {
      out.push({ id, auto: true });
      seen.add(id);
    }
  };
  if (
    row.submittedAt !== null &&
    row.dueAt !== null &&
    row.submittedAt > row.dueAt
  ) {
    addAuto('late');
  }
  const deadline = row.dueAt ?? row.closeAt;
  if (row.submittedAt === null && deadline !== null && now > deadline) {
    addAuto('missing');
  }
  return out;
}

export type FinalScoreStatus =
  | 'scored'
  | 'excluded'
  | 'awaiting'
  | 'empty'
  | 'complete'
  | 'not-assigned';

export interface FinalScore {
  status: FinalScoreStatus;
  /** Null unless status is 'scored'. */
  points: number | null;
  max: number | null;
  pct: number | null;
  /** Where a scored value came from. */
  source: 'raw' | 'override' | 'flag' | null;
  /** The flag whose value produced the score, when source is 'flag'. */
  flagId: string | null;
  /** The computed score an override replaced (shown struck through, D21). */
  rawPoints: number | null;
  flags: ActiveFlag[];
  /** False for anything that must not enter an average. */
  counts: boolean;
}

export interface ResolveContext {
  flagDefs: GradebookFlagDef[];
  autoFlags: boolean;
  now: number;
}

function pctOf(points: number | null, max: number | null): number | null {
  if (points === null || max === null || max <= 0) return null;
  return (points / max) * 100;
}

/** D11: the row's points under the column's attempt policy. */
export function policyPoints(
  row: GradeIndexRow,
  policy: AttemptPolicy
): number | null {
  const scored = row.attempts.filter(
    (a) =>
      a.state === 'scored' && a.points !== null && a.max !== null && a.max > 0
  );
  if (policy === 'latest' || scored.length === 0 || row.max === null) {
    return row.points;
  }
  const pcts = scored.map((a) => (a.points as number) / (a.max as number));
  const frac =
    policy === 'highest'
      ? Math.max(...pcts)
      : pcts.reduce((s, p) => s + p, 0) / pcts.length;
  return frac * row.max;
}

/** D9: the one resolver every consumer uses for a cell's final score. */
export function resolveFinalScore(
  raw: GradeIndexRow | null,
  mark: GradebookMark | null,
  column: GradebookColumnConfig | null,
  ctx: ResolveContext
): FinalScore {
  const kind = raw?.kind ?? column?.kind ?? mark?.kind;
  const max = column?.maxPointsOverride ?? raw?.max ?? null;
  const policy = column?.attemptPolicy ?? DEFAULT_ATTEMPT_POLICY;
  const computed =
    raw && raw.state === 'scored' ? policyPoints(raw, policy) : null;
  const rawPoints =
    computed !== null && raw?.max && max !== null && max !== raw.max
      ? (computed / raw.max) * max
      : computed;
  const scored = !!mark?.override || rawPoints !== null;
  const defs = new Map(ctx.flagDefs.map((f) => [f.id, f]));
  const flags = activeFlags(
    raw,
    mark,
    ctx.flagDefs,
    ctx.autoFlags,
    ctx.now
  ).filter((f) => !(scored && defs.get(f.id)?.removeWhenScored));
  const base: FinalScore = {
    status: 'empty',
    points: null,
    max: null,
    pct: null,
    source: null,
    flagId: null,
    rawPoints: null,
    flags,
    counts: false,
  };
  if (raw && !raw.assigned) return { ...base, status: 'not-assigned' };
  if (kind && isCompletionOnly(kind)) {
    const done = raw !== null && raw.submittedAt !== null;
    return { ...base, status: done ? 'complete' : 'empty' };
  }
  const flagDefsOn = flags
    .map((f) => defs.get(f.id))
    .filter((f): f is GradebookFlagDef => f !== undefined);
  if (flagDefsOn.some((f) => f.value === 'excluded')) {
    return { ...base, status: 'excluded' };
  }
  const earned = mark?.override ? mark.override.points : rawPoints;
  if (earned !== null) {
    const deduct = flagDefsOn.reduce(
      (sum, f) =>
        f.mode === 'deduct' && typeof f.value === 'number'
          ? sum + f.value
          : sum,
      0
    );
    const points =
      deduct > 0 && max !== null && max > 0
        ? Math.max(0, earned - (deduct / 100) * max)
        : earned;
    return {
      ...base,
      status: 'scored',
      points,
      max,
      pct: pctOf(points, max),
      source: mark?.override ? 'override' : 'raw',
      rawPoints,
      counts: max !== null && max > 0,
    };
  }
  if (raw?.state === 'awaiting-grade') return { ...base, status: 'awaiting' };
  let lowest: GradebookFlagDef | null = null;
  for (const f of flagDefsOn) {
    if (typeof f.value !== 'number' || f.mode === 'deduct') continue;
    if (!lowest || f.value < (lowest.value as number)) lowest = f;
  }
  if (lowest && max !== null && max > 0) {
    const points = ((lowest.value as number) / 100) * max;
    return {
      ...base,
      status: 'scored',
      points,
      max,
      pct: lowest.value as number,
      source: 'flag',
      flagId: lowest.id,
      counts: true,
    };
  }
  return base;
}

/** Manual flags a new score removes (the flags marked Remove when scored). */
export function flagsRemovedByScore(
  mark: Pick<GradebookMark, 'flags'>,
  flagDefs: GradebookFlagDef[]
): string[] {
  const ids = new Set(
    flagDefs.filter((f) => f.removeWhenScored).map((f) => f.id)
  );
  return mark.flags.filter((id) => ids.has(id));
}

export interface OverallCell {
  final: FinalScore;
  /** Resolved category id, or null for the first category. */
  category: string | null;
  countsTowardOverall: boolean;
}

export interface OverallResult {
  pct: number | null;
  points: number;
  max: number;
}

/** D13: total points, or weighted categories renormalized over those with counted work. */
export function computeOverall(
  cells: OverallCell[],
  categoriesEnabled: boolean,
  categories: GradebookCategory[]
): OverallResult {
  const counted = cells.filter(
    (c) =>
      c.countsTowardOverall &&
      c.final.counts &&
      c.final.points !== null &&
      c.final.max !== null
  );
  let points = 0;
  let max = 0;
  for (const c of counted) {
    points += c.final.points as number;
    max += c.final.max as number;
  }
  if (!categoriesEnabled || categories.length === 0) {
    return { pct: max > 0 ? (points / max) * 100 : null, points, max };
  }
  const firstId = categories[0].id;
  const known = new Set(categories.map((c) => c.id));
  const sums = new Map<string, { p: number; m: number }>();
  for (const c of counted) {
    const id = c.category && known.has(c.category) ? c.category : firstId;
    const s = sums.get(id) ?? { p: 0, m: 0 };
    s.p += c.final.points as number;
    s.m += c.final.max as number;
    sums.set(id, s);
  }
  let weighted = 0;
  let weightTotal = 0;
  for (const cat of categories) {
    const s = sums.get(cat.id);
    if (!s || s.m <= 0 || cat.weight <= 0) continue;
    weighted += (s.p / s.m) * cat.weight;
    weightTotal += cat.weight;
  }
  return {
    pct: weightTotal > 0 ? (weighted / weightTotal) * 100 : null,
    points,
    max,
  };
}

export interface EvidencePoint {
  targetId: string;
  pct: number;
  at: number;
}

/** D17: evidence a cell contributes; flag-valued, excused, awaiting and empty cells give none. */
export function evidenceForCell(
  row: GradeIndexRow | null,
  final: FinalScore,
  column: GradebookColumnConfig | null
): EvidencePoint[] {
  if (!row || final.status !== 'scored' || final.source === 'flag') return [];
  const at = row.submittedAt ?? row.updatedAt;
  const out: EvidencePoint[] = [];
  if (final.source === 'raw') {
    for (const e of row.targetEvidence) {
      if (e.possible > 0) {
        out.push({
          targetId: e.targetId,
          pct: (e.earned / e.possible) * 100,
          at,
        });
      }
    }
  }
  if (final.pct !== null) {
    for (const t of column?.targets ?? []) {
      out.push({ targetId: t.id, pct: final.pct, at });
    }
  }
  return out;
}

/** D17: combine one target's evidence with the chosen method. */
export function combineEvidence(
  points: { pct: number; at: number }[],
  method: ProficiencyMethod,
  decayWeight: number = DEFAULT_DECAY_WEIGHT
): number | null {
  if (points.length === 0) return null;
  const sorted = [...points].sort((a, b) => a.at - b.at);
  switch (method) {
    case 'mean':
      return sorted.reduce((s, p) => s + p.pct, 0) / sorted.length;
    case 'recent':
      return sorted[sorted.length - 1].pct;
    case 'highest':
      return Math.max(...sorted.map((p) => p.pct));
    case 'decaying': {
      let v = sorted[0].pct;
      for (let i = 1; i < sorted.length; i++) {
        v = decayWeight * sorted[i].pct + (1 - decayWeight) * v;
      }
      return v;
    }
  }
}

export type ProficiencyLevel = 0 | 1 | 2;

/** 0 = top level, 1 = middle, 2 = bottom; null with no evidence. */
export function proficiencyLevel(
  pct: number | null,
  scale: ProficiencyScale
): ProficiencyLevel | null {
  if (pct === null) return null;
  if (pct >= scale.proficient) return 0;
  if (pct >= scale.approaching) return 1;
  return 2;
}

/** D17: the scale a configuration names, falling back to the district scale. */
export function resolveScale(
  choice: GradebookScaleChoice,
  district: ProficiencyScale,
  plcCutoffs: { proficient: number; approaching: number } | null
): ProficiencyScale {
  if (choice.source === 'custom') return choice.scale;
  if (choice.source === 'plc' && plcCutoffs) {
    return { ...district, ...plcCutoffs };
  }
  return district;
}

/** D7: per-student publish wins over the session's publish state. */
export function isPublishedFor(
  row: GradeIndexRow,
  mark: GradebookMark | null
): boolean {
  if (mark?.publishOverride === 'published') return true;
  if (mark?.publishOverride === 'unpublished') return false;
  return row.published;
}

export interface StudentGradeFlag {
  id: string;
  name: string;
  key: string;
  color: string;
}

export interface StudentGradeEntry {
  kind: GradebookKind;
  title: string;
  dueAt: number | null;
  /** 'hidden' until published, or when the section is switched off. */
  status: FinalScoreStatus | 'hidden';
  points: number | null;
  max: number | null;
  pct: number | null;
  flags: StudentGradeFlag[];
  comment: string | null;
}

export interface StudentStandardEntry {
  targetId: string;
  code?: string;
  label?: string;
  pct: number;
  level: ProficiencyLevel;
  /** Oldest first, from published work. */
  evidence: StudentStandardEvidence[];
}

export interface StudentStandardEvidence {
  sessionId: string;
  pct: number;
  at: number;
}

export interface StudentStandardInput {
  row: GradeIndexRow;
  mark: GradebookMark | null;
  column: GradebookColumnConfig | null;
}

/** D35: per-target proficiency from one student's published work in one class. */
export function buildStudentStandards(
  inputs: StudentStandardInput[],
  settings: GradebookSettingsBody,
  scale: ProficiencyScale,
  now: number
): StudentStandardEntry[] {
  const byTarget = new Map<string, StudentStandardEvidence[]>();
  const names = new Map<string, { code?: string; label?: string }>();
  for (const { row, mark, column } of inputs) {
    for (const e of row.targetEvidence) {
      if (e.label && !names.has(e.targetId))
        names.set(e.targetId, { code: e.code, label: e.label });
    }
    for (const t of column?.targets ?? []) {
      if (!names.has(t.id)) names.set(t.id, { code: t.code, label: t.label });
    }
    if (!row.assigned || !isPublishedFor(row, mark)) continue;
    const final = resolveFinalScore(row, mark, column, {
      flagDefs: settings.flags,
      autoFlags: settings.autoFlags,
      now,
    });
    for (const e of evidenceForCell(row, final, column)) {
      const list = byTarget.get(e.targetId) ?? [];
      list.push({ sessionId: row.sessionId, pct: e.pct, at: e.at });
      byTarget.set(e.targetId, list);
    }
  }
  const out: StudentStandardEntry[] = [];
  for (const [targetId, points] of byTarget) {
    const pct = combineEvidence(points, settings.method);
    const level = proficiencyLevel(pct, scale);
    if (pct === null || level === null) continue;
    const name = names.get(targetId);
    out.push({
      targetId,
      ...(name?.code ? { code: name.code } : {}),
      ...(name?.label ? { label: name.label } : {}),
      pct: Math.round(pct * 100) / 100,
      level,
      evidence: points
        .map((p) => ({ ...p, pct: Math.round(p.pct * 100) / 100 }))
        .sort((a, b) => a.at - b.at),
    });
  }
  return out.sort((a, b) => (a.targetId < b.targetId ? -1 : 1));
}

/** D37 `student_grades/{studentUid}/classes/{classId}`, server-written, read by that student only. */
export interface StudentGradesDoc {
  studentUid: string;
  classId: string;
  ownerUid: string;
  /** Keyed by sessionId. */
  entries: Record<string, StudentGradeEntry>;
  /** Null unless the class's settings show standards. */
  standards: StudentStandardEntry[] | null;
  levelNames: [string, string, string];
  /** The scale's cutoffs; absent on docs written before the Learning targets view. */
  cutoffs?: { proficient: number; approaching: number };
  updatedAt: number;
}

/** D35-D37: what one cell may show its student; null when the student is not assigned. */
export function buildStudentGradeEntry(
  row: GradeIndexRow,
  mark: GradebookMark | null,
  column: GradebookColumnConfig | null,
  settings: GradebookSettingsBody,
  now: number
): StudentGradeEntry | null {
  if (!row.assigned) return null;
  const final = resolveFinalScore(row, mark, column, {
    flagDefs: settings.flags,
    autoFlags: settings.autoFlags,
    now,
  });
  const vis = settings.studentVisibility;
  const defs = new Map(settings.flags.map((f) => [f.id, f]));
  const flags: StudentGradeFlag[] = [];
  if (vis.flags) {
    for (const f of final.flags) {
      const d = defs.get(f.id);
      if (d && d.visibility === 'students') {
        flags.push({ id: d.id, name: d.name, key: d.key, color: d.color });
      }
    }
  }
  const published = isPublishedFor(row, mark);
  const showScore = published && vis.scores;
  const excusedShown = flags.some((f) => defs.get(f.id)?.value === 'excluded');
  let status: StudentGradeEntry['status'] = showScore ? final.status : 'hidden';
  if (status === 'excluded' && !excusedShown) status = 'hidden';
  const scored = status === 'scored';
  return {
    kind: row.kind,
    title: row.title,
    dueAt: row.dueAt,
    status,
    points: scored ? final.points : null,
    max: scored ? final.max : null,
    pct: scored ? final.pct : null,
    flags,
    comment:
      published && vis.comments && mark?.comment?.shared
        ? mark.comment.text
        : null,
  };
}

export const GRADEBOOK_COLLECTIONS = {
  index: 'grade_index',
  marks: 'gradebook_marks',
  history: 'history',
  columns: 'gradebook_columns',
  userSettings: 'gradebook_settings',
  userClasses: 'gradebook_classes',
  districtConfigs: 'gradebook_district_configs',
  periodSets: 'grading_period_sets',
  studentGrades: 'student_grades',
  studentClasses: 'classes',
} as const;

/** `plcs/{plcId}/meta/{id}` and `admin_settings/{id}` doc ids. */
export const PLC_GRADEBOOK_META_ID = 'gradebookSettings';
export const ORG_GRADEBOOK_SETTINGS_ID = 'gradebook';

/** `users/{uid}/gradebook_settings/{configId}`. */
export interface GradebookSettingsDoc extends GradebookSettingsBody {
  ownerUid: string;
  editorUids: string[];
  /** The configuration new classes start on. */
  isDefault?: boolean;
  updatedAt: number;
}

/** `plcs/{plcId}/meta/gradebookSettings`; cutoffs stay on `meta/learningTargets`. */
export interface PlcGradebookSettingsDoc extends GradebookSettingsBody {
  updatedAt: number;
  updatedBy: string;
}

/** `gradebook_district_configs/{configId}`, admin-written. */
export interface DistrictGradebookConfigDoc extends GradebookSettingsBody {
  orgId: string;
  buildingIds: string[];
  isDefault: boolean;
  updatedAt: number;
}

export type GradebookConfigRef =
  | { source: 'personal'; configId: string }
  | { source: 'district'; configId: string }
  | { source: 'plc'; plcId: string };

export type GradebookSortKey =
  | 'last'
  | 'first'
  | 'overall'
  | 'column'
  | 'missing'
  | 'flag'
  | 'group';

export interface GradebookSort {
  key: GradebookSortKey;
  dir: 'asc' | 'desc';
  /** sessionId, flag id or group id when the key needs one. */
  ref: string | null;
}

/** `users/{uid}/gradebook_classes/{rosterId}`: per-class view state. */
export interface GradebookClassStateDoc {
  rosterId: string;
  ownerUid: string;
  editorUids: string[];
  /** Null uses the built-in defaults. */
  configRef: GradebookConfigRef | null;
  sort: GradebookSort | null;
  nameFormat: 'last-first' | 'first-last' | 'last-only' | 'first-only';
  cellFormat: 'percent' | 'points';
  /** Card ids in order, per surface ('student', 'analysis'). */
  cardLayouts: Record<string, string[]>;
  updatedAt: number;
}

export interface GradingPeriod {
  id: string;
  label: string;
  /** Inclusive local dates, YYYY-MM-DD. */
  start: string;
  end: string;
}

/** `grading_period_sets/{setId}`, admin-written (D18). */
export interface GradingPeriodSetDoc {
  name: string;
  orgId: string;
  buildingIds: string[];
  periods: GradingPeriod[];
  updatedAt: number;
}

/** `admin_settings/gradebook`: the organization's district scale (D17). */
export interface GradebookOrgSettingsDoc extends ProficiencyScale {
  updatedAt: number;
}
