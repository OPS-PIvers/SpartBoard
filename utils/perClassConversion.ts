// Turns a whole-quiz gate (session status + openAt/closeAt) into per-class rows, so every quiz runs on one gate.
import type {
  AccessMode,
  PauseSpan,
  PeriodAccess,
  PeriodAccessSessionFields,
} from '@/types';
import {
  periodKeyForRoster,
  rosterIsVerified,
  type PeriodRoster,
} from '@/utils/periodPlan';
import { hasPeriodAccess, studentCanEnter } from '@/utils/periodAccess';
import { appendPauseSpan, hasOpenPause } from '@/utils/quizTimeLimit';

export interface WholeQuizSession extends PeriodAccessSessionFields {
  status?: string;
  sessionMode?: string;
  openAt?: number | null;
  closeAt?: number | null;
  pauseSpans?: PauseSpan[];
  classIds?: string[];
  rosterIds?: string[];
  classPeriodByClassId?: Record<string, string>;
}

export interface PerClassConversion {
  accessMode: AccessMode;
  periodAccess: Record<string, PeriodAccess>;
  /** A paused run becomes a running one whose classes are paused, so only the rows gate it. */
  resume: { pauseSpans: PauseSpan[] | null } | null;
}

/** Whether this session can move to per-class rows: a student-paced quiz with classes that is not ended. */
export function canConvertToPerClass(
  session: WholeQuizSession | null | undefined
): boolean {
  return (
    !!session &&
    !hasPeriodAccess(session) &&
    session.sessionMode === 'student' &&
    (session.status === 'active' || session.status === 'paused') &&
    [...(session.classIds ?? []), ...(session.rosterIds ?? [])].some(
      (c) => typeof c === 'string' && c !== ''
    )
  );
}

/** The per-class rows a whole-quiz session gets: its window on each class, its pause on each class. */
export function perClassConversion(
  session: WholeQuizSession,
  rosters: readonly PeriodRoster[],
  nowMs: number
): PerClassConversion | null {
  if (!canConvertToPerClass(session)) return null;
  const running = session.status === 'active';
  const openAt = session.openAt ?? null;
  const closeAt = session.closeAt ?? null;
  const paused = hasOpenPause(session.pauseSpans, session.pausedAt);
  const state: PeriodAccess['state'] = running
    ? 'open'
    : paused
      ? 'paused'
      : 'closed';
  const periodAccess: Record<string, PeriodAccess> = {};
  const add = (key: string, roster: PeriodRoster | undefined) => {
    if (key === '' || key in periodAccess) return;
    periodAccess[key] = {
      state,
      openAt,
      closeAt,
      bellPeriodId: roster?.bellPeriod?.periodId ?? null,
      verified: roster ? rosterIsVerified(roster) : true,
      label: roster?.name ?? session.classPeriodByClassId?.[key] ?? key,
      ...(roster ? { rosterId: roster.id } : {}),
      ...(state === 'paused' && typeof session.pausedAt === 'number'
        ? { pausedAt: session.pausedAt }
        : {}),
    };
  };
  // Each assigned roster keys its row as a new assign would; class ids no roster explains keep their own.
  for (const id of session.rosterIds ?? []) {
    const roster = rosters.find((r) => r.id === id);
    if (roster) add(periodKeyForRoster(roster), roster);
  }
  for (const classId of session.classIds ?? []) {
    if (typeof classId !== 'string') continue;
    add(
      classId,
      rosters.find((r) => periodKeyForRoster(r) === classId)
    );
  }
  if (Object.keys(periodAccess).length === 0) return null;
  return {
    // Assignment mode keeps PIN joins working; rows that are not open still wait for Start.
    accessMode: 'assignment',
    periodAccess,
    resume: running
      ? null
      : {
          pauseSpans: appendPauseSpan(
            session.pauseSpans,
            session.pausedAt,
            nowMs
          ),
        },
  };
}

/** The class row a response without one follows: its period name, else a signed-in student's first class (all start with the same gate). */
export function backfillClassId(
  periodAccess: Record<string, PeriodAccess>,
  response: { classId?: unknown; classPeriod?: unknown; pin?: unknown }
): string | null {
  // Only a missing class can be filled in; one already set stays.
  if (typeof response.classId === 'string' && response.classId !== '')
    return null;
  const keys = Object.keys(periodAccess);
  const byLabel = keys.find(
    (k) =>
      typeof response.classPeriod === 'string' &&
      periodAccess[k].label === response.classPeriod
  );
  if (byLabel) return byLabel;
  if (typeof response.pin === 'string' && response.pin !== '') return null;
  return keys.find((k) => periodAccess[k].verified) ?? null;
}

/** Whether a student can work now, reading a whole-quiz session as the per-class rows it would move to. */
export function studentCanEnterAnyGate(
  session: WholeQuizSession,
  periodKeys: readonly string[],
  uid: string | null | undefined,
  nowMs: number
): boolean {
  if (hasPeriodAccess(session))
    return studentCanEnter(session, periodKeys, uid, nowMs);
  const view = perClassConversion(session, [], nowMs);
  if (!view) return true;
  const gated = { ...session, periodAccess: view.periodAccess };
  const keys =
    periodKeys.length > 0 ? periodKeys : Object.keys(view.periodAccess);
  return studentCanEnter(gated, keys, uid, nowMs);
}
