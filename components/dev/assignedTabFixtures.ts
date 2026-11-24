// Fixture rows for the Quiz Assigned tab in /library-managers-dev?view=quiz-assigned (dev only).
import type {
  ClassRoster,
  PeriodAccess,
  QuizAssignment,
  QuizData,
  QuizMetadata,
  QuizResponse,
  VideoActivityAssignment,
  VideoActivityQuestion,
  VideoActivityResponse,
} from '@/types';

const now = Date.now();
const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const WORST = new URLSearchParams(window.location.search).has('worst');

const LABELS = WORST
  ? [
      'Honors Physical Science 9 - Section 03 - Hernandez-Whitfield',
      'P2',
      'Grade 8 Science - Section 01 - Fall',
      'Advisory / Homeroom 8B',
      'P5',
      'P6',
      'P7',
      'Earth and Space Science - Section 02',
      'STEM Exploration Lab - Section 05',
    ]
  : ['Period 1', 'Period 2', 'Period 5'];
const KEYS = LABELS.map((_, i) => `r${i + 1}`);

const LAST = WORST
  ? [
      'Hernandez-Whitfield-Oyelaran',
      'Li',
      'Nguyễn',
      'Abernathy-Castellanos',
      'O',
      'Papadopoulou',
      '张',
    ]
  : [
      'Adams',
      'Brooks',
      'Chen',
      'Diaz',
      'Evans',
      'Garcia',
      'Hughes',
      'Kim',
      'Lopez',
      'Moore',
      'Nguyen',
      'Patel',
      'Reed',
      'Shah',
    ];
const FIRST = WORST
  ? [
      'Maria-Guadalupe Alejandra',
      'B',
      'Thị Minh Khai',
      'Christopher',
      'Jo',
      'Anastasia',
      '伟',
    ]
  : [
      'Ava',
      'Ben',
      'Cora',
      'Dev',
      'Eli',
      'Fay',
      'Gus',
      'Ivy',
      'Jon',
      'Liv',
      'Max',
      'Nia',
      'Owen',
      'Rae',
    ];
const nameFor = (c: number, n: number): [string, string] => [
  LAST[(n + c * 3) % LAST.length],
  FIRST[(Math.floor(n / LAST.length) + n * 5 + c * 2) % FIRST.length],
];

export const ASSIGNED_ROSTERS: ClassRoster[] = KEYS.map((id, i) => ({
  id,
  name: LABELS[i],
  driveFileId: null,
  studentCount: 27,
  createdAt: now,
  students: Array.from({ length: 28 - (i % 2) }, (_, n) => {
    const [lastName, firstName] = nameFor(i, n);
    return {
      id: `${id}-s${n}`,
      firstName,
      lastName,
      pin: String(n).padStart(2, '0'),
      classLinkSourcedId: `${id}-sid${n}`,
    };
  }),
}));

const row = (i: number, over: Partial<PeriodAccess>): PeriodAccess => ({
  state: 'closed',
  openAt: null,
  closeAt: null,
  bellPeriodId: null,
  verified: true,
  label: LABELS[i],
  rosterId: KEYS[i],
  ...over,
});

const rows = (make: (i: number) => Partial<PeriodAccess>) =>
  Object.fromEntries(KEYS.map((k, i) => [k, row(i, make(i))]));

const base = (
  id: string,
  title: string,
  over: Partial<QuizAssignment>
): QuizAssignment => ({
  id,
  quizId: id === 'osmosis' ? 'quiz-grade' : `quiz-${id}`,
  quizTitle: title,
  quizDriveFileId: `drive-${id}`,
  teacherUid: 'mock-user-id',
  code: `QZ${id.length}${id.charCodeAt(0)}`,
  sessionMode: 'student',
  sessionOptions: {},
  status: 'active',
  createdAt: now - DAY,
  updatedAt: now - DAY,
  rosterIds: KEYS,
  ...over,
});

const closed = { closedAt: now - 2 * DAY };
const sid = (c: number, n: number) => ({
  kind: 'classlink' as const,
  sourcedId: `${KEYS[c]}-sid${n}`,
});

export const ASSIGNED_FIXTURES: QuizAssignment[] = [
  base(
    'cells',
    WORST
      ? 'Cells, Organelles and the Very Long Unit Title That Keeps Going Quiz'
      : 'Cells Quiz',
    {
      periodAccess: rows((i) =>
        i === 0 ? closed : i === 1 ? { state: 'open', openedAt: now - DAY } : {}
      ),
    }
  ),
  base('photo', 'Photosynthesis Check', {
    status: 'paused',
    periodAccess: rows((i) =>
      i === 0 ? { state: 'open', closeAt: now - 3 * 60 * MIN } : {}
    ),
  }),
  base('eco', 'Ecosystems Pretest', {
    status: 'paused',
    createdAt: now - MIN,
    periodAccess: rows(() => ({})),
  }),
  base('safety', 'Lab Safety Exit Ticket', {
    periodAccess: rows((i) => ({
      state: 'open',
      openAt: now + DAY + i * 60 * MIN,
    })),
  }),
  base('single', 'Vocabulary Warm-up', {
    rosterIds: [KEYS[1]],
    periodAccess: {
      [KEYS[1]]: row(1, { state: 'open', openedAt: now - DAY }),
    },
  }),
  base('paper', 'Unit 3 Test (paper)', {
    status: 'paused',
    paper: true,
    paperBatchId: 'b1',
    periodAccess: undefined,
    rosterIds: [KEYS[0]],
  }),
  base('share', 'Microscope Diagram', {
    mode: 'view-only',
    periodAccess: undefined,
    rosterIds: [],
  }),
  base(
    'retake',
    WORST
      ? 'Cells, Organelles and the Very Long Unit Title Retake for Picked Students'
      : 'Cells Quiz Retake',
    {
      createdAt: now - 2 * MIN,
      rosterIds: KEYS.slice(0, 2),
      targetMode: 'students',
      targetStudents: [
        ...[3, 7, 12, 20].map((n) => sid(0, n)),
        ...[1, 9].map((n) => sid(1, n)),
        // Picked from a class this run no longer covers.
        sid(2, 4),
        // A student no class list has now.
        { kind: 'classlink', sourcedId: 'gone-1' },
      ],
      periodAccess: Object.fromEntries(
        KEYS.slice(0, 2).map((k, i) => [
          k,
          row(i, i === 0 ? { state: 'open', openedAt: now - 20 * MIN } : {}),
        ])
      ),
    }
  ),
  base('makeup', 'Vocabulary Make-up', {
    createdAt: now - 3 * MIN,
    rosterIds: [KEYS[1]],
    targetMode: 'students',
    targetStudents: [2, 5, 8].map((n) => sid(1, n)),
    periodAccess: {
      [KEYS[1]]: row(1, { state: 'open', openedAt: now - 10 * MIN }),
    },
  }),
  base('osmosis', 'Osmosis Lab Quiz', {
    status: 'inactive',
    createdAt: now - 6 * DAY,
    periodAccess: rows(() => closed),
  }),
  base('micro', 'Microscope Parts Quiz', {
    status: 'inactive',
    createdAt: now - 8 * DAY,
    periodAccess: rows(() => closed),
  }),
  base('atoms', 'Atoms and Elements Quiz', {
    status: 'inactive',
    createdAt: now - 13 * DAY,
    scoreVisibility: 'score-only',
    plc: { id: 'plc-sci', name: 'Grade 7 Science PLC', memberEmails: [] },
    periodAccess: rows(() => closed),
  }),
  base('metric', 'Metric Units Check', {
    status: 'inactive',
    createdAt: now - 20 * DAY,
    periodAccess: rows(() => ({})),
  }),
];

const response = (
  classId: string,
  status: QuizResponse['status'],
  n: number,
  answer = 'B'
): QuizResponse =>
  ({
    studentUid: `${classId}-${n}`,
    joinedAt: now - 30 * MIN,
    status,
    classId,
    answers: [{ questionId: 'q1', answer, answeredAt: now - 10 * MIN }],
    score: null,
  }) as unknown as QuizResponse;

const many = (
  classId: string,
  status: QuizResponse['status'],
  count: number
): QuizResponse[] =>
  Array.from({ length: count }, (_, n) => response(classId, status, n));

export const ASSIGNED_RESPONSES: Record<string, QuizResponse[]> = {
  cells: [
    ...many(KEYS[0], 'completed', 28),
    ...many(KEYS[1], 'completed', 19),
    ...many(KEYS[1], 'in-progress', 5),
  ],
  photo: many(KEYS[0], 'completed', 26),
  eco: [],
  safety: [],
  retake: [
    response(KEYS[0], 'completed', 0),
    response(KEYS[0], 'in-progress', 1),
  ],
  makeup: [response(KEYS[1], 'completed', 0)],
  single: many(KEYS[1], 'completed', 11),
  paper: many(KEYS[0], 'completed', 12),
  osmosis: KEYS.flatMap((k) =>
    Array.from({ length: 4 }, (_, n) =>
      response(k, 'completed', n, 'Water moves in.')
    )
  ),
  micro: KEYS.flatMap((k) => many(k, 'completed', 25)),
  atoms: KEYS.flatMap((k) => many(k, 'completed', 26)),
  metric: [],
};

/** Library rows the fixtures point at, so grading counts load. */
export const ASSIGNED_QUIZZES: QuizMetadata[] = ASSIGNED_FIXTURES.map((a) => ({
  id: a.quizId,
  title: a.quizTitle,
  driveFileId: a.quizDriveFileId,
  questionCount: 1,
  createdAt: now - 30 * DAY,
  updatedAt: now - 30 * DAY,
}));

/** One choice question, except the Osmosis quiz, whose written answer waits for a grade. */
export const loadAssignedQuiz = (meta: QuizMetadata): Promise<QuizData> =>
  Promise.resolve({
    id: meta.id,
    title: meta.title,
    createdAt: 0,
    updatedAt: 0,
    questions: [
      meta.id === 'quiz-grade'
        ? {
            id: 'q1',
            type: 'free-response',
            text: 'Why?',
            timeLimit: 0,
            correctAnswer: '',
            incorrectAnswers: [],
          }
        : {
            id: 'q1',
            type: 'MC',
            text: 'Pick',
            timeLimit: 0,
            correctAnswer: 'B',
            incorrectAnswers: ['A'],
          },
    ],
  } as unknown as QuizData);

/** The same rows as Video Activity assignments, plus a live run (view=video-activity-assigned). */
export const VA_ASSIGNED_FIXTURES: VideoActivityAssignment[] = [
  ...ASSIGNED_FIXTURES.filter((a) => !a.paper).map(
    (a): VideoActivityAssignment => ({
      id: a.id,
      activityId: `va-${a.id}`,
      activityTitle: a.quizTitle.replace(
        /Quiz|Check|Pretest|Exit Ticket/,
        'Video'
      ),
      activityDriveFileId: `drive-${a.id}`,
      teacherUid: a.teacherUid,
      status: a.status,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
      rosterIds: a.rosterIds,
      mode: a.mode,
      scoreVisibility: a.scoreVisibility,
      periodAccess: a.periodAccess,
      sessionSettings: {} as VideoActivityAssignment['sessionSettings'],
      ...(a.closedAt != null ? { closedAt: a.closedAt } : {}),
    })
  ),
  {
    id: 'live',
    activityId: 'va-live',
    activityTitle: 'Plant Cells Live Video',
    activityDriveFileId: 'drive-live',
    teacherUid: 'mock-user-id',
    status: 'active',
    sessionMode: 'teacher',
    createdAt: now - 20 * MIN,
    updatedAt: now - 20 * MIN,
    rosterIds: [KEYS[0]],
    sessionSettings: {} as VideoActivityAssignment['sessionSettings'],
  },
];

const vaResponse = (r: QuizResponse, i: number): VideoActivityResponse =>
  ({
    id: `${r.studentUid}-${i}`,
    classId: r.classId,
    joinedAt: r.joinedAt,
    completedAt: r.status === 'completed' ? now - 5 * MIN : null,
    answers: (r.answers ?? []).map((a) => ({
      questionId: a.questionId,
      answer: a.answer,
    })),
  }) as unknown as VideoActivityResponse;

export const VA_ASSIGNED_RESPONSES: Record<string, VideoActivityResponse[]> = {
  ...Object.fromEntries(
    Object.entries(ASSIGNED_RESPONSES).map(([id, rs]) => [
      id,
      rs.map(vaResponse),
    ])
  ),
  live: many(KEYS[0], 'in-progress', 22).map(vaResponse),
};

/** One choice question, except Osmosis, whose short answer waits for a grade. */
export const VA_ASSIGNED_QUESTIONS: Record<string, VideoActivityQuestion[]> =
  Object.fromEntries(
    VA_ASSIGNED_FIXTURES.map((a) => [
      a.id,
      [
        {
          id: 'q1',
          type: a.id === 'osmosis' ? 'SA' : 'MC',
          text: 'Why?',
          timestamp: 10,
          correctAnswer: a.id === 'osmosis' ? '' : 'B',
          incorrectAnswers: a.id === 'osmosis' ? [] : ['A'],
        } as unknown as VideoActivityQuestion,
      ],
    ])
  );
