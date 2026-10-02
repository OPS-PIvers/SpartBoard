// The student landing v2 page on fixture data at /student-landing-dev (dev and auth-bypass builds only), for layout checks.

import React, { useMemo, useState } from 'react';
import type {
  AssignmentSummary,
  SessionKind,
} from '@/hooks/useStudentAssignments';
import type { TurnInMap } from '@/hooks/useStudentTurnIns';
import type { StudentGradesState } from '@/hooks/useStudentGrades';
import { DEFAULT_PROFICIENCY_SCALE } from '@/utils/gradebook/gradebookCore';
import {
  seenMarksFor,
  studentGradeRows,
  type StudentGradesData,
} from '@/utils/gradebook/studentGrades';
import type { TurnInState } from '@/utils/studentTurnIn';
import { CLASS_COLOR_PALETTE } from '@/utils/studentClassColors';
import { partitionLanding } from '@/utils/studentLanding';
import { StudentLandingLayout } from '@/components/student/landing/StudentLandingLayout';
import type {
  LandingClass,
  LandingTab,
} from '@/components/student/landing/types';

const DAY = 24 * 60 * 60 * 1000;
// Fri Oct 2 2026, 3:40 PM local.
const AFTER_SCHOOL = new Date(2026, 9, 2, 15, 40).getTime();
const IN_CLASS = new Date(2026, 9, 2, 10, 12).getTime();
const at = (days: number, hour = 23, minute = 59): number =>
  new Date(2026, 9, 2 + days, hour, minute).getTime();

const CLASSES: LandingClass[] = [
  ['bio', 'Biology 9', '1', '1st Period', 'Ms. Hanson', 2],
  ['alg', 'Algebra II', '2', '2nd Period', 'Mr. Dahl', 6],
  ['eng', 'English 9 Honors', '3', '3rd Period', 'Ms. Ortiz & Mr. Lee', 0],
  ['his', 'World History', '4', '4th Period', 'Mr. Brandt', 5],
  ['spa', 'Spanish II', '6', '6th Period', 'Sra. Molina', 1],
  ['art', 'Studio Art', '7', '7th Period', 'Ms. Kerr', 4],
].map(([classId, name, square, periodLabel, teachers, color]) => ({
  classId: classId as string,
  name: name as string,
  square: square as string,
  periodLabel: periodLabel as string,
  teachers: teachers as string,
  color: CLASS_COLOR_PALETTE[color as number],
}));

interface Fixture {
  id: string;
  cls: string;
  kind: SessionKind;
  title: string;
  resource?: boolean;
  turnIn?: TurnInState;
  dueAt?: number;
  closeAt?: number;
  openAt?: number;
  ended?: boolean;
  graded?: boolean;
  flashcardKind?: 'check' | 'study';
  live?: boolean;
}

function fixtures(inClass: boolean): Fixture[] {
  return [
    inClass
      ? {
          id: 'e1',
          cls: 'eng',
          kind: 'quiz',
          title: 'Of Mice and Men: Ch. 3 check',
          live: true,
        }
      : {
          id: 'e1',
          cls: 'eng',
          kind: 'quiz',
          title: 'Of Mice and Men: Ch. 3 check',
          turnIn: 'turned-in',
          dueAt: at(0, 10),
          graded: true,
        },
    {
      id: 'e2',
      cls: 'eng',
      kind: 'video-activity',
      title: 'Steinbeck and the Dust Bowl',
      turnIn: 'in-progress',
      dueAt: at(0),
    },
    {
      id: 'e3',
      cls: 'eng',
      kind: 'guided-learning',
      title: 'Thesis statement practice',
      dueAt: at(3),
    },
    {
      id: 'e4',
      cls: 'eng',
      kind: 'projects',
      title: 'Literary analysis essay',
      dueAt: at(6),
    },
    {
      id: 'e5',
      cls: 'eng',
      kind: 'flashcards',
      flashcardKind: 'study',
      title: 'Of Mice and Men vocabulary',
      resource: true,
      closeAt: at(14),
    },
    {
      id: 'e6',
      cls: 'eng',
      kind: 'guided-learning',
      title: 'How to annotate a passage',
      resource: true,
    },
    {
      id: 'e7',
      cls: 'eng',
      kind: 'activity-wall',
      title: 'Character mood boards',
      resource: true,
      closeAt: at(7),
    },
    {
      id: 'e8',
      cls: 'eng',
      kind: 'quiz',
      title: 'Ch. 1-2 reading quiz',
      turnIn: 'turned-in',
      dueAt: at(-8),
      ended: true,
      graded: true,
    },
    {
      id: 'e9',
      cls: 'eng',
      kind: 'video-activity',
      title: 'Who was John Steinbeck?',
      turnIn: 'turned-in',
      dueAt: at(-10),
      ended: true,
    },
    {
      id: 'e10',
      cls: 'eng',
      kind: 'flashcards',
      flashcardKind: 'check',
      title: 'Unit 1 vocabulary check',
      turnIn: 'turned-in',
      dueAt: at(-12),
      ended: true,
      graded: true,
    },
    {
      id: 'e11',
      cls: 'eng',
      kind: 'quiz',
      title: 'Poetry warm-up',
      turnIn: 'not-started',
      dueAt: at(-4),
      ended: true,
    },
    {
      id: 'b1',
      cls: 'bio',
      kind: 'video-activity',
      title: 'Cell organelles tour',
      turnIn: 'not-started',
      dueAt: at(-2),
      closeAt: at(7),
    },
    {
      id: 'b2',
      cls: 'bio',
      kind: 'quiz',
      title: 'Cell membrane quiz',
      dueAt: at(4),
      openAt: at(3, 8, 0),
    },
    {
      id: 'b3',
      cls: 'bio',
      kind: 'mini-app',
      title: 'Osmosis simulator',
      resource: true,
    },
    {
      id: 'b4',
      cls: 'bio',
      kind: 'flashcards',
      flashcardKind: 'study',
      title: 'Cell vocabulary',
      resource: true,
      closeAt: at(21),
    },
    {
      id: 'b5',
      cls: 'bio',
      kind: 'quiz',
      title: 'Microscope lab quiz',
      turnIn: 'turned-in',
      dueAt: at(-6),
      ended: true,
      graded: true,
    },
    {
      id: 'a1',
      cls: 'alg',
      kind: 'quiz',
      title: 'Quadratics practice set',
      turnIn: 'not-started',
      dueAt: at(3),
    },
    {
      id: 'a2',
      cls: 'alg',
      kind: 'flashcards',
      flashcardKind: 'check',
      title: 'Formula check',
      turnIn: 'not-started',
      dueAt: at(7),
    },
    {
      id: 'a3',
      cls: 'alg',
      kind: 'guided-learning',
      title: 'Factoring walkthrough',
      resource: true,
    },
    {
      id: 'a4',
      cls: 'alg',
      kind: 'quiz',
      title: 'Unit 2 exit ticket',
      turnIn: 'not-started',
      dueAt: at(-3),
      ended: true,
    },
    {
      id: 'a5',
      cls: 'alg',
      kind: 'quiz',
      title: 'Linear systems quiz',
      turnIn: 'turned-in',
      dueAt: at(-9),
      ended: true,
      graded: true,
    },
    {
      id: 'h1',
      cls: 'his',
      kind: 'video-activity',
      title: 'The fall of Rome',
      turnIn: 'not-started',
      dueAt: at(5),
    },
    {
      id: 'h2',
      cls: 'his',
      kind: 'activity-wall',
      title: 'Primary source gallery',
      resource: true,
    },
    {
      id: 'h4',
      cls: 'his',
      kind: 'quiz',
      title: 'Unit 3 test',
      turnIn: 'not-started',
      dueAt: at(13),
    },
    {
      id: 's1',
      cls: 'spa',
      kind: 'flashcards',
      flashcardKind: 'check',
      title: 'Vocabulario 3B check',
      turnIn: 'not-started',
      dueAt: at(0, 15, 5),
    },
    {
      id: 's2',
      cls: 'spa',
      kind: 'flashcards',
      flashcardKind: 'study',
      title: 'Vocabulario 3B',
      resource: true,
      closeAt: at(10),
    },
  ];
}

function toSummary(f: Fixture, nowMs: number): AssignmentSummary {
  return {
    compositeId: `${f.kind}:${f.id}`,
    kind: f.kind,
    sessionId: f.id,
    title: f.title,
    openHref: `#${f.id}`,
    channel: f.ended ? 'ended' : 'active',
    classIds: [f.cls],
    createdAt: nowMs - 20 * DAY,
    endedAt: f.ended ? (f.dueAt ?? nowMs) : undefined,
    gradingState: f.graded ? 'graded' : 'not-graded',
    openAt: f.openAt,
    closeAt: f.closeAt,
    dueAt: f.dueAt,
    flashcardKind: f.flashcardKind,
    workKind: f.resource ? 'resource' : 'work',
    live: f.live,
  };
}

type GradeFixture = [
  id: string,
  cls: string,
  kind: SessionKind,
  title: string,
  dueDays: number,
  points: number | null,
  max: number,
  flags?: ('late' | 'missing')[],
  comment?: string,
];

const GRADE_FIXTURES: GradeFixture[] = [
  ['e1', 'eng', 'quiz', 'Of Mice and Men: Ch. 3 check', 0, 9, 10],
  [
    'e8',
    'eng',
    'quiz',
    'Ch. 1-2 reading quiz',
    -8,
    18,
    20,
    [],
    'Strong evidence in #4. Re-read the bunkhouse scene for #2.',
  ],
  [
    'e10',
    'eng',
    'flashcards',
    'Unit 1 vocabulary check',
    -12,
    23,
    25,
    ['late'],
  ],
  ['e11', 'eng', 'quiz', 'Poetry warm-up', -4, 0, 10, ['missing']],
  ['e12', 'eng', 'video-activity', 'Summer reading recap', -30, 10, 10],
  ['b5', 'bio', 'quiz', 'Microscope lab quiz', -6, 14, 15],
  ['a4', 'alg', 'quiz', 'Unit 2 exit ticket', -3, 0, 10, ['missing']],
  ['a5', 'alg', 'quiz', 'Linear systems quiz', -9, 16, 20],
];

const FLAG_DEFS = {
  late: { id: 'late', name: 'Late', key: 'L', color: 'amber' },
  missing: { id: 'missing', name: 'Missing', key: 'M', color: 'rose' },
};

function gradesFor(classId: string): StudentGradesData {
  const entries: StudentGradesData['entries'] = {};
  for (const [
    id,
    cls,
    kind,
    title,
    due,
    points,
    max,
    flags,
    comment,
  ] of GRADE_FIXTURES) {
    if (cls !== classId) continue;
    entries[id] = {
      kind,
      title,
      dueAt: at(due),
      status: points === null ? 'hidden' : 'scored',
      points,
      max: points === null ? null : max,
      pct: points === null ? null : (points / max) * 100,
      flags: (flags ?? []).map((f) => FLAG_DEFS[f]),
      comment: comment ?? null,
      updatedAt: at(due),
    };
  }
  return { entries, standards: null, scale: DEFAULT_PROFICIENCY_SCALE };
}

const readParam = (key: string): string | null =>
  new URLSearchParams(window.location.search).get(key);

export const StudentLandingDevHarness: React.FC = () => {
  const inClass = readParam('time') === 'class';
  const gradesEnabled = readParam('gb') === '1';
  const nowMs = inClass ? IN_CLASS : AFTER_SCHOOL;
  const [selected, setSelected] = useState<string | null>(
    readParam('class') ?? (inClass ? 'eng' : null)
  );
  const [tab, setTab] = useState<LandingTab>(
    (readParam('tab') as LandingTab | null) ?? 'assignments'
  );
  const { assignments, checks } = useMemo(() => {
    const list = fixtures(inClass);
    const map: TurnInMap = {};
    for (const f of list) {
      if (f.turnIn) {
        map[`${f.kind}:${f.id}`] = {
          turnIn: f.turnIn,
          lockedOut: false,
          resultsOverride: null,
        };
      }
    }
    return { assignments: list.map((f) => toSummary(f, nowMs)), checks: map };
  }, [inClass, nowMs]);
  const partition = useMemo(
    () => partitionLanding(assignments, checks, nowMs),
    [assignments, checks, nowMs]
  );
  const grades = useMemo<StudentGradesState | undefined>(
    () =>
      gradesEnabled && selected
        ? { status: 'ready', data: gradesFor(selected) }
        : undefined,
    [gradesEnabled, selected]
  );
  // Everything seen before except the newest score, so one row shows New.
  const initialSeen = useMemo(
    () =>
      seenMarksFor(
        grades?.status === 'ready'
          ? studentGradeRows(grades.data).filter((r) => r.sessionId !== 'e1')
          : []
      ),
    [grades]
  );
  const inSessionIds = useMemo(
    () => new Set(inClass ? ['eng'] : []),
    [inClass]
  );
  return (
    <StudentLandingLayout
      classes={CLASSES}
      partition={partition}
      checks={checks}
      inSessionIds={inSessionIds}
      nowMs={nowMs}
      selectedClassId={selected}
      onSelectClass={(id) => {
        setSelected(id);
        setTab('assignments');
      }}
      tab={tab}
      onTabChange={setTab}
      gradesEnabled={gradesEnabled}
      grades={grades}
      initialSeen={initialSeen}
      firstName="Maya"
      pseudonymUid="dev-student"
      onSignOut={() => undefined}
      onLockedClick={() => undefined}
      onOpenGradeOnly={() => undefined}
    />
  );
};
