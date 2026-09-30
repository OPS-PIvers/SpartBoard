// Gradebook grid on fixture data at /gradebook-dev (auth-bypass builds only), for layout checks.

import React, { useCallback, useMemo, useState } from 'react';
import type { ClassRoster, Student } from '@/types';
import {
  DEFAULT_GRADEBOOK_SETTINGS,
  DEFAULT_PROFICIENCY_SCALE,
  gradebookDocId,
  type GradebookClassStateDoc,
  type GradebookColumnConfig,
  type GradebookKind,
  type GradebookMark,
  type GradeIndexRow,
} from '@/utils/gradebook/gradebookCore';
import type { GradebookSource } from '@/hooks/useGradebookSource';
import { GradebookProvider } from '@/components/gradebook/GradebookProvider';
import { GradebookPage } from '@/components/gradebook/GradebookPage';
import { parseGradebookPath } from '@/utils/gradebookPath';

const NOW = new Date(2026, 9, 8, 12).getTime();
const day = (m: number, d: number): number =>
  new Date(2026, m - 1, d, 23, 59).getTime();

const NAMES: [string, string][] = [
  ['Sofia', 'Aguilar'],
  ['Liam', 'Bennett'],
  ['Grace', 'Chen'],
  ['Owen', 'Dahl'],
  ['Maya', 'Ellison'],
  ['Yusuf', 'Farah'],
  ['Isabella', 'Gomez'],
  ['Ethan', 'Hansen'],
  ['Amina', 'Ibrahim'],
  ['Noah', 'Johnson'],
  ['Ava', 'Kowalski'],
  ['Elias', 'Lindqvist'],
  ['Kalia', 'Moua'],
  ['Priya', 'Nair'],
];
const STUDENTS: Student[] = NAMES.map(([firstName, lastName], i) => ({
  id: `s${i}`,
  firstName,
  lastName,
  pin: String(1000 + i),
}));

const ASSIGN: {
  id: string;
  title: string;
  kind: GradebookKind;
  due: number;
  max: number;
  published: boolean;
}[] = [
  {
    id: 'a1',
    title: 'Unit 1 Pre-check',
    kind: 'quiz',
    due: day(9, 3),
    max: 10,
    published: true,
  },
  {
    id: 'a2',
    title: 'Theme in a Short Film',
    kind: 'video-activity',
    due: day(9, 5),
    max: 8,
    published: true,
  },
  {
    id: 'a3',
    title: 'Unit 1 Vocabulary',
    kind: 'flashcards',
    due: day(9, 9),
    max: 20,
    published: true,
  },
  {
    id: 'a4',
    title: 'Annotating a Text',
    kind: 'guided-learning',
    due: day(9, 11),
    max: 6,
    published: true,
  },
  {
    id: 'a5',
    title: 'Favorite Opening Line',
    kind: 'activity-wall',
    due: day(9, 12),
    max: 0,
    published: true,
  },
  {
    id: 'a6',
    title: 'Character Quiz',
    kind: 'quiz',
    due: day(9, 16),
    max: 15,
    published: true,
  },
  {
    id: 'a7',
    title: 'Symbolism Clip',
    kind: 'video-activity',
    due: day(9, 19),
    max: 8,
    published: true,
  },
  {
    id: 'a8',
    title: 'Plot Diagram Builder',
    kind: 'mini-app',
    due: day(9, 22),
    max: 0,
    published: true,
  },
  {
    id: 'a9',
    title: 'Argument Poster',
    kind: 'projects',
    due: day(9, 24),
    max: 25,
    published: true,
  },
  {
    id: 'a10',
    title: 'Unit 1 Test',
    kind: 'quiz',
    due: day(9, 29),
    max: 30,
    published: false,
  },
  {
    id: 'a11',
    title: 'Evidence Hunt',
    kind: 'guided-learning',
    due: day(10, 6),
    max: 6,
    published: false,
  },
];

const TARGETS: Record<string, string[]> = {
  a1: ['RL.1', 'L.4'],
  a2: ['RL.2'],
  a4: ['RL.1'],
  a6: ['RL.3', 'RL.1'],
  a7: ['RL.2'],
  a9: ['W.1'],
  a10: ['RL.1', 'RL.2', 'RL.3'],
};

function seeded(i: number, j: number): number {
  const x = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function buildRows(): GradeIndexRow[] {
  const rows: GradeIndexRow[] = [];
  STUDENTS.forEach((s, i) => {
    ASSIGN.forEach((a, j) => {
      const r = seeded(i, j);
      const assigned = !(i === 12 && j === 1);
      const missing = r < 0.08 && a.max > 0;
      const awaiting = a.id === 'a10' && (i === 2 || i === 5 || i === 11);
      const late = !missing && r > 0.93;
      const submittedAt = missing ? null : a.due + (late ? 86400000 : -3600000);
      const pct = Math.min(1, 0.45 + seeded(j, i) * 0.6);
      const points = a.max > 0 ? Math.round(pct * a.max * 2) / 2 : null;
      rows.push({
        kind: a.kind,
        sessionId: a.id,
        studentUid: `u${i}`,
        ownerUid: 'mock-user-id',
        editorUids: [],
        rosterIds: ['roster-p2'],
        classIds: ['class-p2'],
        title: a.title,
        rawPct: missing || awaiting || a.max === 0 ? null : pct * 100,
        points: missing || awaiting ? null : points,
        max: a.max > 0 ? a.max : null,
        state: missing
          ? 'not-attempted'
          : awaiting
            ? 'awaiting-grade'
            : 'scored',
        submittedAt,
        dueAt: a.due,
        openAt: a.due - 7 * 86400000,
        closeAt: null,
        createdAt: a.due - 8 * 86400000,
        attempts: [],
        targetEvidence:
          points === null || missing || awaiting
            ? []
            : (TARGETS[a.id] ?? []).map((t, k) => ({
                targetId: t,
                kind: 'standard' as const,
                earned: Math.min(4, Math.round(seeded(i + k, j) * 5)),
                possible: 4,
              })),
        published: a.published,
        assigned,
        updatedAt: NOW,
      });
    });
  });
  return rows;
}

const ROSTERS: ClassRoster[] = [
  {
    id: 'roster-p2',
    name: 'English 8 · Period 2',
    driveFileId: null,
    studentCount: STUDENTS.length,
    createdAt: 0,
    classlinkClassId: 'class-p2',
    students: STUDENTS,
  },
];

const INITIAL_MARKS: GradebookMark[] = [
  { sid: 'a6', u: 'u7', override: 12, comment: null, flags: [] },
  { sid: 'a7', u: 'u4', override: null, comment: null, flags: ['excused'] },
  {
    sid: 'a4',
    u: 'u4',
    override: null,
    comment: { text: 'Great annotations', shared: true, at: NOW },
    flags: [],
  },
  {
    sid: 'a9',
    u: 'u0',
    override: null,
    comment: { text: 'Check sources', shared: false, at: NOW },
    flags: [],
  },
].map((m) => ({
  kind: ASSIGN.find((a) => a.id === m.sid)?.kind ?? 'quiz',
  sessionId: m.sid,
  studentUid: m.u,
  ownerUid: 'mock-user-id',
  editorUids: [],
  rosterIds: ['roster-p2'],
  override: m.override === null ? null : { points: m.override, at: NOW },
  comment: m.comment,
  flags: m.flags,
  suppressedAuto: [],
  publishOverride: null,
  updatedAt: NOW,
}));

export const GradebookDevHarness: React.FC = () => {
  const [rows] = useState(buildRows);
  const [marks, setMarks] = useState<GradebookMark[]>(INITIAL_MARKS);
  const [configs, setConfigs] = useState<GradebookColumnConfig[]>([]);
  const [classState, setClassState] = useState<GradebookClassStateDoc | null>(
    null
  );
  const [toastMsg, setToastMsg] = useState<{
    text: string;
    undo?: () => void;
  } | null>(null);

  const source: GradebookSource = useMemo(
    () => ({
      status: 'ready',
      rows,
      marks,
      columnConfigs: configs,
      classState,
      settings: DEFAULT_GRADEBOOK_SETTINGS,
      scale: DEFAULT_PROFICIENCY_SCALE,
      periods: [
        {
          id: 'q1',
          label: 'Quarter 1',
          start: '2026-08-31',
          end: '2026-10-30',
        },
        {
          id: 'q2',
          label: 'Quarter 2',
          start: '2026-11-02',
          end: '2027-01-22',
        },
      ],
      saveMarks: (saves) => {
        setMarks((prev) => {
          const next = new Map(
            prev.map((m) => [gradebookDocId(m.sessionId, m.studentUid), m])
          );
          for (const s of saves)
            next.set(
              gradebookDocId(s.mark.sessionId, s.mark.studentUid),
              s.mark
            );
          return [...next.values()];
        });
        return Promise.resolve();
      },
      saveColumn: (cfg) => {
        setConfigs((prev) => [
          ...prev.filter((c) => c.sessionId !== cfg.sessionId),
          cfg,
        ]);
        return Promise.resolve();
      },
      saveClassState: (patch) => {
        setClassState((prev) => ({
          rosterId: 'roster-p2',
          ownerUid: 'mock-user-id',
          editorUids: [],
          configRef: null,
          sort: null,
          nameFormat: 'last-first',
          cellFormat: 'percent',
          cardLayouts: {},
          ...prev,
          ...patch,
          updatedAt: Date.now(),
        }));
        return Promise.resolve();
      },
    }),
    [rows, marks, configs, classState]
  );

  const studentByUid = useMemo(
    () => new Map(STUDENTS.map((s, i) => [`u${i}`, s])),
    []
  );
  const toast = useCallback(
    (text: string, undo?: () => void) => setToastMsg({ text, undo }),
    []
  );
  const parsed = parseGradebookPath(
    new URLSearchParams(window.location.search).get('path') ??
      '/gradebook/roster-p2'
  ) ?? {
    rosterId: 'roster-p2',
    view: 'grid' as const,
    studentUid: null,
    sessionId: null,
  };

  return (
    <>
      <GradebookProvider
        uid="mock-user-id"
        source={source}
        roster={ROSTERS[0]}
        rosters={ROSTERS}
        studentByUid={studentByUid}
        toast={toast}
        now={NOW}
      >
        <GradebookPage parsed={parsed} onClose={() => undefined} />
      </GradebookProvider>
      {toastMsg && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-toast flex -translate-x-1/2 items-center gap-3 rounded-lg bg-slate-800 px-4 py-2 text-sm text-white"
        >
          {toastMsg.text}
          {toastMsg.undo && (
            <button
              type="button"
              className="font-semibold underline"
              onClick={toastMsg.undo}
            >
              Undo
            </button>
          )}
        </div>
      )}
    </>
  );
};
