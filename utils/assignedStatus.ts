import type {
  AssignmentKind,
  PeriodAccess,
  QuizAssignment,
  QuizAssignmentStatus,
  QuizResponse,
} from '@/types';
import { effectivePeriodState } from '@/utils/periodAccess';
import type { EpochWindow } from '@/utils/periodPlan';

/** D2: one class's access, as the Assigned tab shows it. */
export type ClassStatus = 'ready' | 'scheduled' | 'open' | 'paused' | 'closed';

/** D5: where the row sits on the Assigned tab. */
export type AssignedBucket = 'active' | 'done';

/** D4: the per-assignment grading and publishing track. */
export type GradingTrack =
  | 'needs-grading'
  | 'scores-unpublished'
  | 'scores-published'
  | 'no-scores'
  /** Responses not loaded yet: never read as nothing to grade, so the row stays Active. */
  | 'unknown';

type GateFields = Pick<PeriodAccess, 'state' | 'openAt' | 'closeAt'> & {
  closedAt?: number | null;
  openedAt?: number | null;
};

/** One class of an assignment, normalized across kinds. */
export interface AssignedClassInput {
  /** The `periodAccess` key; '' for a single-line assignment with no `periodAccess`. */
  key: string;
  label: string;
  /** The stored gate; null on a single-line assignment, whose status and window drive it. */
  access: GateFields | null;
  /** Responses from this class that have begun work; a join asking to be let in does not count. */
  started: number;
  submitted: number;
  /** Students expected, when the roster size is known. */
  total: number | null;
  /** Today's bell window for the class, when its roster has a tagged bell. */
  bell: EpochWindow | null;
}

/** An assignment of any kind, normalized for the Assigned tab. */
export interface AssignedInput {
  id: string;
  kind: AssignmentKind;
  title: string;
  status: QuizAssignmentStatus;
  createdAt: number;
  /** True when `classes` come from `periodAccess`; false is one whole-assignment line (D15, D20). */
  perClass: boolean;
  classes: readonly AssignedClassInput[];
  /** Assignment-level close mark: a single-line Close, a sub End or a paper import end (D24). */
  closedAt: number | null;
  /** Move to Done by hand (D5); counts only while the assignment is ended. */
  doneAt: number | null;
  /** Whole-assignment window, read only on a single-line assignment. */
  openAt: number | null;
  /** D11: when a single line was last opened from the Assigned tab. */
  openedAt?: number | null;
  closeAt: number | null;
  /** D16: a view-only share has no grading and is Done once closed. */
  viewOnly: boolean;
  /** Responses awaiting a grade; null while responses are still loading. */
  needsGrading: number | null;
  /** False where the kind or mode never publishes scores. */
  publishesScores: boolean;
  scoresPublished: boolean;
}

export interface AssignedClass {
  key: string;
  label: string;
  status: ClassStatus;
  /** Closed by the teacher (D24), by its close time passing, or by the whole assignment ending. */
  closedBy: 'teacher' | 'clock' | 'ended' | null;
  /** When it closed or will close by the clock, when known. */
  closedAt: number | null;
  closesAt: number | null;
  opensAt: number | null;
  /** Its bell period is under way now (D8). */
  inSession: boolean;
  /** D11: open by hand past its period (or since an earlier day); when it was opened. */
  leftOpenSince: number | null;
  submitted: number;
  total: number | null;
}

/** D14's status line as data; the UI words it. */
export type AssignedStatusLine =
  | {
      kind: 'open';
      /** Null on a single line (D15). */
      classLabel: string | null;
      submitted: number;
      total: number | null;
      /** Classes not yet closed besides the one named. */
      classesToGo: number;
      /** Other classes open at the same time. */
      otherOpen: number;
    }
  | {
      kind: 'paused';
      classLabel: string | null;
      submitted: number;
      total: number | null;
      classesToGo: number;
    }
  | {
      kind: 'scheduled';
      classLabel: string | null;
      opensAt: number;
      classCount: number;
    }
  | {
      kind: 'ready';
      readyCount: number;
      scheduledCount: number;
      closedCount: number;
    }
  | { kind: 'needs-grading'; count: number }
  | { kind: 'grading-unknown' }
  | { kind: 'scores-unpublished'; submitted: number }
  | { kind: 'view-only'; closed: boolean }
  | { kind: 'done'; scoresPublished: boolean; legacy: boolean };

export type AssignedActionKind =
  | 'open'
  | 'resume'
  | 'monitor'
  | 'grade'
  | 'publish'
  | 'results'
  | 'choose-class';

/** D8's main button; `classKey` names the class it acts on, null for the whole row. */
export interface AssignedMainAction {
  kind: AssignedActionKind;
  classKey: string | null;
  classLabel: string | null;
}

export interface AssignedStatus {
  id: string;
  bucket: AssignedBucket;
  /** D20: ended before the Assigned tab handled it, so Done whatever its grading. */
  legacyDone: boolean;
  /** Moved to Done by hand while still ended. */
  movedToDone: boolean;
  /** D15: one class or code-only, shown as one line with nothing to expand. */
  singleLine: boolean;
  classes: AssignedClass[];
  grading: GradingTrack;
  line: AssignedStatusLine;
  action: AssignedMainAction;
  /** D13 order; compare with `compareAssigned`. */
  sortKey: { group: number; at: number };
}

/** D24/D21: the class is finished, by a teacher Close or its close time; Ready is not. */
export function isClassClosed(access: GateFields, nowMs: number): boolean {
  const eff = effectivePeriodState(access, nowMs);
  return (
    eff === 'ended' || (access.state === 'closed' && access.closedAt != null)
  );
}

function classOf(
  item: AssignedInput,
  cls: AssignedClassInput,
  nowMs: number
): AssignedClass {
  const inSession =
    !!cls.bell && cls.bell.openAt <= nowMs && nowMs < cls.bell.closeAt;
  const base = {
    key: cls.key,
    label: cls.label,
    inSession,
    leftOpenSince: null,
    submitted: cls.submitted,
    total: cls.total,
  };
  const gate: GateFields = cls.access ?? {
    state: item.status === 'paused' ? 'paused' : 'open',
    openAt: item.openAt,
    closeAt: item.closeAt,
    openedAt: item.openedAt,
  };
  const closesAt = gate.closeAt ?? null;
  const opensAt = gate.openAt ?? null;
  const markedAt = cls.access
    ? (cls.access.closedAt ??
      (item.status === 'inactive' ? item.closedAt : null))
    : item.closedAt;
  if (item.status === 'inactive')
    return {
      ...base,
      status: 'closed',
      closedBy: markedAt != null ? 'teacher' : 'ended',
      closedAt: markedAt,
      closesAt: null,
      opensAt: null,
    };
  const eff = effectivePeriodState(gate, nowMs);
  const out = (
    status: ClassStatus,
    closedBy: AssignedClass['closedBy'] = null,
    closedAt: number | null = null
  ): AssignedClass => ({
    ...base,
    status,
    closedBy,
    closedAt,
    closesAt: status === 'closed' ? null : closesAt,
    opensAt,
  });
  switch (eff) {
    case 'open':
      if (item.status === 'paused') return out('paused');
      return {
        ...out('open'),
        leftOpenSince: leftOpenSince(item, cls, gate, nowMs),
      };
    case 'scheduled':
      return out('scheduled');
    case 'paused':
      return out('paused');
    case 'ended':
      return out('closed', 'clock', closesAt);
    case 'closed':
      if (markedAt != null) return out('closed', 'teacher', markedAt);
      // A class closed before D24 that has work in it is closed, not Ready.
      return cls.started > 0 ? out('closed', 'teacher') : out('ready');
  }
}

/** D11: an open class with no close time whose bell rang since it opened, or opened before today. */
function leftOpenSince(
  item: AssignedInput,
  cls: AssignedClassInput,
  gate: GateFields,
  nowMs: number
): number | null {
  if (item.viewOnly || gate.closeAt != null) return null;
  // The latest start that has passed: a stamped open or a scheduled window start.
  const starts = [gate.openedAt, gate.openAt].filter(
    (t): t is number => t != null && t <= nowMs
  );
  const stamped = starts.length > 0;
  const since = stamped ? Math.max(...starts) : item.createdAt;
  const today = new Date(nowMs).setHours(0, 0, 0, 0);
  const bellRang =
    !!cls.bell && cls.bell.closeAt <= nowMs && since < cls.bell.closeAt;
  // Without a stamp, only a bell that has rung today says it was left open.
  return (stamped && since < today) || bellRang ? since : null;
}

const RANK: Record<ClassStatus, number> = {
  open: 0,
  paused: 1,
  ready: 2,
  scheduled: 2,
  closed: 3,
};
const DONE_GROUP = 4;

const pick = <T extends AssignedClass>(
  classes: readonly T[],
  test: (c: T) => boolean
): T | undefined =>
  classes.find((c) => test(c) && c.inSession) ?? classes.find(test);

/** Derives the Assigned tab's view of one assignment (ASSIGNED_TAB.md slice 1). */
export function deriveAssignedStatus(
  item: AssignedInput,
  nowMs: number
): AssignedStatus {
  const classes = item.classes.map((c) => classOf(item, c, nowMs));
  const singleLine = !item.perClass || classes.length <= 1;
  const named = (c: AssignedClass | undefined) =>
    c && !singleLine ? c.label : null;
  const count = (s: ClassStatus) =>
    classes.filter((c) => c.status === s).length;
  const allClosed = classes.every((c) => c.status === 'closed');
  const submitted = classes.reduce((n, c) => n + c.submitted, 0);
  const marked =
    item.closedAt != null ||
    item.classes.some((c) => c.access?.closedAt != null);
  const legacyDone = item.status === 'inactive' && !marked;
  const movedToDone = item.status === 'inactive' && item.doneAt != null;

  const grading: GradingTrack = item.viewOnly
    ? 'no-scores'
    : item.needsGrading == null
      ? 'unknown'
      : item.needsGrading > 0
        ? 'needs-grading'
        : !item.publishesScores || submitted === 0
          ? 'no-scores'
          : item.scoresPublished
            ? 'scores-published'
            : 'scores-unpublished';
  const gradingDone = grading === 'no-scores' || grading === 'scores-published';
  const bucket: AssignedBucket =
    legacyDone || movedToDone || (allClosed && gradingDone) ? 'done' : 'active';

  const open = pick(classes, (c) => c.status === 'open');
  const paused = pick(classes, (c) => c.status === 'paused');
  const notClosedBesides = (c: AssignedClass) =>
    classes.filter((o) => o !== c && o.status !== 'closed').length;

  let line: AssignedStatusLine;
  if (item.viewOnly) line = { kind: 'view-only', closed: allClosed };
  else if (open)
    line = {
      kind: 'open',
      classLabel: named(open),
      submitted: open.submitted,
      total: open.total,
      classesToGo: notClosedBesides(open),
      otherOpen: count('open') - 1,
    };
  else if (paused)
    line = {
      kind: 'paused',
      classLabel: named(paused),
      submitted: paused.submitted,
      total: paused.total,
      classesToGo: notClosedBesides(paused),
    };
  else if (!allClosed) {
    const scheduled = classes
      .filter((c) => c.status === 'scheduled')
      .sort((a, b) => (a.opensAt ?? 0) - (b.opensAt ?? 0));
    line =
      count('ready') === 0 && scheduled.length > 0
        ? {
            kind: 'scheduled',
            classLabel: scheduled.length === 1 ? named(scheduled[0]) : null,
            opensAt: scheduled[0].opensAt ?? 0,
            classCount: scheduled.length,
          }
        : {
            kind: 'ready',
            readyCount: count('ready'),
            scheduledCount: scheduled.length,
            closedCount: count('closed'),
          };
  } else if (bucket === 'done')
    line = {
      kind: 'done',
      scoresPublished: grading === 'scores-published',
      legacy: legacyDone,
    };
  else if (grading === 'unknown') line = { kind: 'grading-unknown' };
  else if (grading === 'needs-grading')
    line = { kind: 'needs-grading', count: item.needsGrading ?? 0 };
  else line = { kind: 'scores-unpublished', submitted };

  const act = (
    kind: AssignedActionKind,
    c?: AssignedClass
  ): AssignedMainAction => ({
    kind,
    classKey: c ? c.key : null,
    classLabel: named(c),
  });
  const current = classes.find((c) => c.inSession && c.status !== 'closed');
  let action: AssignedMainAction;
  if (legacyDone || movedToDone) action = act('results');
  else if (current)
    action =
      current.status === 'open'
        ? act('monitor', current)
        : current.status === 'paused'
          ? act('resume', current)
          : act('open', current);
  else if (open) action = act('monitor', open);
  else if (paused)
    action = singleLine ? act('resume', paused) : act('monitor', paused);
  else if (grading === 'needs-grading') action = act('grade');
  else if (allClosed)
    action = act(grading === 'scores-unpublished' ? 'publish' : 'results');
  else {
    const waiting = classes.filter((c) => c.status !== 'closed');
    action =
      waiting.length === 1 ? act('open', waiting[0]) : act('choose-class');
  }

  const lastClosed = Math.max(
    item.createdAt,
    ...classes.map((c) => c.closedAt ?? 0),
    item.closedAt ?? 0,
    item.doneAt ?? 0
  );
  const sortKey =
    bucket === 'done'
      ? { group: DONE_GROUP, at: lastClosed }
      : {
          group: Math.min(
            DONE_GROUP - 1,
            ...classes.map((c) => RANK[c.status])
          ),
          at: item.createdAt,
        };

  return {
    id: item.id,
    bucket,
    legacyDone,
    movedToDone,
    singleLine,
    classes,
    grading,
    line,
    action,
    sortKey,
  };
}

/** D13: Open first, then Paused, Ready or Scheduled, Closed; newest first within a group. */
export function compareAssigned(a: AssignedStatus, b: AssignedStatus): number {
  return a.sortKey.group - b.sortKey.group || b.sortKey.at - a.sortKey.at;
}

/** A response belongs to a class by its classId, else (anonymous PIN joiners) by the class label. */
export function responseInClass(
  r: { classId?: string; classPeriod?: string },
  key: string,
  label: string
): boolean {
  return r.classId ? r.classId === key : r.classPeriod === label;
}

/** A stored status of any kind (ended, archived, inactive) read as Quiz's three. */
export function runStatus(status: string): QuizAssignmentStatus {
  return status === 'active' || status === 'paused' ? status : 'inactive';
}

/** One response of any kind, reduced to what the row counts. */
export interface AssignedResponse {
  classId?: string;
  classPeriod?: string;
  /** Has begun work; a join asking to be let in has not. */
  started: boolean;
  submitted: boolean;
}

/** What every adapter reads beyond the assignment doc; pass null responses while they load. */
export interface AssignedExtras {
  responses: readonly AssignedResponse[] | null;
  /** Responses awaiting a teacher grade. */
  needsGrading: number | null;
  /** Students expected per class key; key '' for a single-line assignment. */
  classSizes?: Readonly<Record<string, number>>;
  /** Today's bell window for a roster (`todaysBell` from `hooks/usePeriodAccess`). */
  bellFor?: (access: Pick<PeriodAccess, 'rosterId'>) => EpochWindow | null;
}

/** The assignment doc fields every kind shares, as the core builder reads them. */
export interface AssignedRunFields {
  id: string;
  status: string;
  createdAt: number;
  periodAccess?: Record<string, PeriodAccess>;
  closedAt?: number | null;
  doneAt?: number | null;
  openAt?: number | null;
  closeAt?: number | null;
  openedAt?: number | null;
  rosterIds?: string[];
  className?: string;
  periodNames?: string[];
}

/** The kind-specific half of an `AssignedInput`. */
export interface AssignedKindFields {
  kind: AssignmentKind;
  title: string;
  viewOnly: boolean;
  publishesScores: boolean;
  scoresPublished: boolean;
}

/** Builds an `AssignedInput` from any kind's doc; D20 legacy reading lives in `deriveAssignedStatus`. */
export function buildAssignedInput(
  run: AssignedRunFields,
  fields: AssignedKindFields,
  extras: AssignedExtras
): AssignedInput {
  const responses = extras.responses ?? [];
  const pa = run.periodAccess;
  const perClass = !!pa && Object.keys(pa).length > 0;
  const tally = (match: (r: AssignedResponse) => boolean) => {
    const mine = responses.filter(match);
    return {
      started: mine.filter((r) => r.started).length,
      submitted: mine.filter((r) => r.submitted).length,
    };
  };
  const classes: AssignedClassInput[] = perClass
    ? Object.entries(pa).map(([key, access]) => ({
        key,
        label: access.label,
        access,
        ...tally((r) => responseInClass(r, key, access.label)),
        total: extras.classSizes?.[key] ?? null,
        bell: extras.bellFor?.({ rosterId: access.rosterId ?? key }) ?? null,
      }))
    : [
        {
          key: '',
          label: run.className?.trim()
            ? run.className
            : (run.periodNames ?? []).join(', '),
          access: null,
          ...tally(() => true),
          total: extras.classSizes?.[''] ?? null,
          bell:
            run.rosterIds?.length === 1
              ? (extras.bellFor?.({ rosterId: run.rosterIds[0] }) ?? null)
              : null,
        },
      ];
  return {
    id: run.id,
    kind: fields.kind,
    title: fields.title,
    status: runStatus(run.status),
    createdAt: run.createdAt,
    perClass,
    classes,
    closedAt: run.closedAt ?? null,
    doneAt: run.doneAt ?? null,
    openAt: run.openAt ?? null,
    closeAt: run.closeAt ?? null,
    openedAt: run.openedAt ?? null,
    viewOnly: fields.viewOnly,
    needsGrading: extras.responses == null ? null : extras.needsGrading,
    publishesScores: fields.publishesScores,
    scoresPublished: fields.scoresPublished,
  };
}

/** A published score level of any kind; absent or 'none' is unpublished. */
export const scoresShown = (visibility: string | null | undefined): boolean =>
  !!visibility && visibility !== 'none';

/** What the quiz adapter reads beyond the assignment doc; pass null while responses load. */
export interface QuizAssignedExtras extends Omit<AssignedExtras, 'responses'> {
  responses:
    readonly Pick<QuizResponse, 'status' | 'classId' | 'classPeriod'>[] | null;
}

/** A quiz response as the row counts it. */
export const quizAssignedResponse = (
  r: Pick<QuizResponse, 'status' | 'classId' | 'classPeriod'>
): AssignedResponse => ({
  classId: r.classId,
  classPeriod: r.classPeriod,
  started: r.status !== 'joined',
  submitted: r.status === 'completed',
});

/** Normalizes a quiz assignment and its responses for `deriveAssignedStatus`. */
export function quizAssignedInput(
  a: QuizAssignment,
  extras: QuizAssignedExtras
): AssignedInput {
  const viewOnly = a.mode === 'view-only';
  return buildAssignedInput(
    a,
    {
      kind: 'quiz',
      title: a.quizTitle,
      viewOnly,
      publishesScores: !viewOnly,
      scoresPublished: scoresShown(a.scoreVisibility),
    },
    {
      ...extras,
      responses: extras.responses?.map(quizAssignedResponse) ?? null,
    }
  );
}
