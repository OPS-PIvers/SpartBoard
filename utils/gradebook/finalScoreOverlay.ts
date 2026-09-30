import {
  resolveFinalScore,
  type FinalScore,
  type GradeIndexRow,
  type GradeState,
  type GradebookColumnConfig,
  type GradebookFlagDef,
  type GradebookKind,
  type GradebookMark,
} from '@/utils/gradebook/gradebookCore';

/** The teacher's gradebook edits for one session, as the Results views and pushes read them (D9). */
export interface FinalScoreOverlay {
  kind: GradebookKind;
  sessionId: string;
  ownerUid: string;
  marks: ReadonlyMap<string, GradebookMark>;
  column: GradebookColumnConfig | null;
  flagDefs: GradebookFlagDef[];
  autoFlags: boolean;
  dueAt: number | null;
  closeAt: number | null;
}

/** One student's live score as a Results view computes it; `max` is the view's own denominator. */
export interface LiveRawScore {
  points: number | null;
  max: number | null;
  state: GradeState;
  submittedAt: number | null;
}

/** Results views see only the current attempt, so a highest/average policy reads as latest here. */
export function liveRow(
  overlay: FinalScoreOverlay,
  studentUid: string,
  raw: LiveRawScore
): GradeIndexRow {
  return {
    kind: overlay.kind,
    sessionId: overlay.sessionId,
    studentUid,
    ownerUid: overlay.ownerUid,
    editorUids: [],
    rosterIds: overlay.marks.get(studentUid)?.rosterIds ?? [],
    classIds: [],
    title: '',
    rawPct:
      raw.points !== null && raw.max !== null && raw.max > 0
        ? (raw.points / raw.max) * 100
        : null,
    points: raw.points,
    max: raw.max,
    state: raw.state,
    submittedAt: raw.submittedAt,
    dueAt: overlay.dueAt,
    openAt: null,
    closeAt: overlay.closeAt,
    createdAt: 0,
    attempts: [],
    targetEvidence: [],
    published: false,
    assigned: true,
    updatedAt: 0,
  };
}

export function finalScoreFor(
  overlay: FinalScoreOverlay,
  studentUid: string,
  raw: LiveRawScore,
  now: number
): FinalScore {
  return resolveFinalScore(
    liveRow(overlay, studentUid, raw),
    overlay.marks.get(studentUid) ?? null,
    overlay.column,
    { flagDefs: overlay.flagDefs, autoFlags: overlay.autoFlags, now }
  );
}

/** True when the overlay could change any student's score; false keeps every consumer on its legacy path. */
export function overlayHasEdits(overlay: FinalScoreOverlay | null): boolean {
  if (!overlay) return false;
  if (overlay.column?.maxPointsOverride != null) return true;
  for (const mark of overlay.marks.values()) {
    if (mark.override || mark.flags.length > 0) return true;
  }
  return false;
}

interface GradeEntry {
  pseudonymUid: string;
  pointsEarned: number;
}

/** D9 for LMS pushes: legacy students only, Excused dropped, overrides scaled; returns `entries` itself when nothing applies. */
export function applyFinalScoresToEntries<E extends GradeEntry>(
  entries: E[],
  maxPoints: number,
  overlay: FinalScoreOverlay | null,
  rawFor: (studentUid: string) => LiveRawScore | null,
  now: number
): E[] {
  if (!overlay || !overlayHasEdits(overlay)) return entries;
  let changed = false;
  const out: E[] = [];
  for (const entry of entries) {
    const raw = rawFor(entry.pseudonymUid);
    if (!raw) {
      out.push(entry);
      continue;
    }
    const final = finalScoreFor(overlay, entry.pseudonymUid, raw, now);
    if (final.status === 'excluded') {
      changed = true;
      continue;
    }
    if (final.source === 'override' && final.pct !== null) {
      const pointsEarned = Math.max(
        0,
        Math.min(maxPoints, Math.round((final.pct / 100) * maxPoints))
      );
      out.push({ ...entry, pointsEarned });
      changed = true;
      continue;
    }
    out.push(entry);
  }
  return changed ? out : entries;
}

/** Short cell text for a final score in Results and CSV: a percent, "Excused" or "Awaiting grade". */
export function finalScoreLabel(
  final: FinalScore,
  flagName: (id: string) => string
): string {
  switch (final.status) {
    case 'scored':
      if (final.pct === null) return '';
      if (final.source === 'flag' && final.flagId) {
        return `${Math.round(final.pct)}% (${flagName(final.flagId)})`;
      }
      return `${Math.round(final.pct)}%`;
    case 'excluded':
      return 'Excused';
    case 'awaiting':
      return 'Awaiting grade';
    case 'complete':
      return 'Complete';
    default:
      return '';
  }
}

/** Percent the Results pill shows under D9, or null to keep the view's own score. */
export function finalPillPct(final: FinalScore | null): number | null {
  if (!final || final.status !== 'scored' || final.source === 'raw') {
    return null;
  }
  return final.pct;
}
