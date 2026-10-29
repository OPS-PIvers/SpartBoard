import type { ClassRoster } from '@/types';
import type {
  FocusSessionDoc,
  FocusSite,
  FocusStudentDoc,
} from '@/utils/focus/contract';
import { HARNESS_UID, defineFixtures } from './types';
import { STRESS, makeRoster, range } from './stress';

// Times are relative to page load, so the seeded session is always mid-run.
const NOW = Date.now();
const MIN = 60_000;

const withClass = (roster: ClassRoster, id: string, classId: string) => ({
  ...roster,
  id,
  classlinkClassId: classId,
});
const PERIOD_3 = withClass(
  makeRoster(24),
  'roster-focus-3',
  'class-p3-science'
);
const PERIOD_5 = withClass(
  makeRoster(28, 'Period 5 Science'),
  'roster-focus-5',
  'class-p5-science'
);
const STRESS_CLASS = withClass(
  makeRoster(STRESS.rosterSize, STRESS.title),
  'roster-focus-stress',
  'class-stress'
);

const TYPICAL_SITES: FocusSite[] = [
  { host: 'desmos.com', path: '' },
  { host: 'docs.google.com', path: '/document/d/1aBcDeFgHiJkLmNoPq' },
  { host: 'khanacademy.org', path: '/science/biology' },
];
const STRESS_SITES: FocusSite[] = range(20, (i) => ({
  host: `${STRESS.word.toLowerCase()}${i}.example.org`,
  path: `/units/${STRESS.word.toLowerCase()}/lesson-${i + 1}`,
}));

const studentState = (i: number): FocusStudentDoc => {
  const base: FocusStudentDoc = {
    status: 'on-task',
    awaySince: null,
    awayMs: 0,
    blockedTries: 0,
    lastReportAt: NOW - 20_000,
    protocol: 9,
    liveHost: null,
    otherSessionEndsAt: null,
  };
  switch (i % 12) {
    case 1:
      return {
        ...base,
        status: 'away',
        awaySince: NOW - 95_000,
        awayMs: 40_000,
      };
    case 4:
      return { ...base, blockedTries: 3, awayMs: 125_000 };
    case 6:
      return { ...base, status: 'waiting', lastReportAt: null, protocol: null };
    case 8:
      return { ...base, status: 'released' };
    case 10:
      return {
        ...base,
        status: 'other-session',
        lastReportAt: null,
        otherSessionEndsAt: NOW + 12 * MIN,
      };
    default:
      return base;
  }
};

/** A running session for `roster`, written to the offline cache the harness reads. */
function liveSession(
  roster: ClassRoster,
  sessionId: string,
  sites: FocusSite[]
) {
  const studentUids = roster.students.map((s) => `uid-${s.id}`);
  const session: FocusSessionDoc = {
    orgId: 'orono',
    classId: roster.classlinkClassId ?? '',
    className: roster.name,
    teacherUid: HARNESS_UID,
    teacherName: 'Mock Teacher',
    teacherUids: [HARNESS_UID],
    level: 'redirect',
    sites,
    studentUids,
    // Started 4 minutes ago, so a student with no report shows Not connected.
    startedAt: NOW - 4 * MIN,
    endsAt: NOW + 21 * MIN + 30_000,
    endedAt: null,
    endReason: null,
  };
  const docs: Record<string, Record<string, unknown>> = {
    [`focus_sessions/${sessionId}`]: { ...session },
  };
  studentUids.forEach((uid, i) => {
    docs[`focus_sessions/${sessionId}/students/${uid}`] = {
      ...studentState(i),
    };
  });
  return docs;
}

/** An ended session from yesterday, collapsed to summaries as the server leaves it (F11). */
function pastSession(
  roster: ClassRoster,
  sessionId: string,
  sites: FocusSite[]
) {
  const startedAt = NOW - 24 * 60 * MIN;
  const studentUids = roster.students.map((s) => `uid-${s.id}`);
  const docs: Record<string, Record<string, unknown>> = {
    [`focus_sessions/${sessionId}`]: {
      orgId: 'orono',
      classId: roster.classlinkClassId ?? '',
      className: roster.name,
      teacherUid: HARNESS_UID,
      teacherName: 'Mock Teacher',
      teacherUids: [HARNESS_UID],
      level: 'lock',
      sites,
      studentUids,
      startedAt,
      endsAt: startedAt + 30 * MIN,
      endedAt: startedAt + 30 * MIN,
      endReason: 'time',
    } satisfies FocusSessionDoc,
  };
  studentUids.forEach((uid, i) => {
    docs[`focus_sessions/${sessionId}/students/${uid}`] = {
      status: 'ended',
      awayMs: i % 5 === 1 ? 65_000 * ((i % 3) + 1) : 0,
      blockedTries: i % 7 === 2 ? 2 : 0,
      connected: i % 11 !== 6,
    };
  });
  return docs;
}

/** Names the harness resolves for the seeded uids, standing in for the ClassLink lookup. */
export const FOCUS_FIXTURE_NAMES: Record<string, string> = Object.fromEntries(
  [PERIOD_3, STRESS_CLASS].flatMap((r) =>
    r.students.map((s) => [`uid-${s.id}`, `${s.firstName} ${s.lastName}`])
  )
);

export const focusFixtures = defineFixtures<'focus'>({
  empty: { config: {} },
  typical: {
    rosters: [PERIOD_3, PERIOD_5],
    config: {
      rosterId: PERIOD_3.id,
      classId: PERIOD_3.classlinkClassId,
      className: PERIOD_3.name,
      level: 'redirect',
      minutes: 25,
      sites: TYPICAL_SITES,
    },
    firestoreDocs: {
      ...liveSession(PERIOD_3, 'focus-typical', TYPICAL_SITES),
      ...pastSession(PERIOD_3, 'focus-typical-past', TYPICAL_SITES),
    },
  },
  stress: {
    customTitle: STRESS.title,
    rosters: [STRESS_CLASS, PERIOD_3, PERIOD_5],
    config: {
      rosterId: STRESS_CLASS.id,
      classId: STRESS_CLASS.classlinkClassId,
      className: STRESS_CLASS.name,
      level: 'lock',
      minutes: 60,
      sites: STRESS_SITES,
    },
    firestoreDocs: liveSession(STRESS_CLASS, 'focus-stress', STRESS_SITES),
  },
});
