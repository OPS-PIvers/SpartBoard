/**
 * sessionViewsMocks — fixture builders for SessionViewsDevHarness.
 *
 * Each builder returns an object typed as the REAL data type from `@/types`
 * (no `any` casts), so the harness exercises the live monitor/results views
 * against representative data without a Firestore round-trip. The fixtures
 * deliberately span the interesting per-student states the views branch on:
 *   - completed responses across the score spectrum (high / mid / low)
 *   - an in-progress attempt
 *   - a joined-only attempt (no answers yet)
 *   - a response carrying tab-switch warnings
 *   - a locked / auto-submitted response
 *
 * Keep these as plain data — no React, no Firestore. They must satisfy every
 * REQUIRED field on the underlying interfaces (`pnpm run type-check` is the
 * gate); optional fields are filled only where a view reads them.
 */

import {
  QuizSession,
  QuizSessionStatus,
  QuizResponse,
  QuizData,
  QuizConfig,
  QuizPublicQuestion,
  VideoActivitySession,
  VideoActivityResponse,
  VideoActivityQuestion,
} from '@/types';

const QUIZ_ID = 'dev-quiz-1';
const QUIZ_SESSION_ID = 'dev-quiz-session-1';
const VA_ID = 'dev-va-1';
const VA_SESSION_ID = 'dev-va-session-1';

// Current time so relative-time formatting in the views reads realistically
// ("5 minutes ago", not "2 years ago"). Date.now() is fine in source files —
// the restriction is specific to workflow scripts.
export const NOW = Date.now();

/* ─── Quiz quiz data ─────────────────────────────────────────────────────── */

const QUIZ_Q1_ID = 'q1';
const QUIZ_Q2_ID = 'q2';

export function makeQuizData(): QuizData {
  return {
    id: QUIZ_ID,
    title: 'Fractions Review',
    createdAt: NOW - 86_400_000,
    updatedAt: NOW - 3_600_000,
    questions: [
      {
        id: QUIZ_Q1_ID,
        type: 'MC',
        text: 'What is 1/2 + 1/4?',
        timeLimit: 30,
        correctAnswer: '3/4',
        incorrectAnswers: ['1/4', '2/6', '1/8'],
        points: 1,
      },
      {
        id: QUIZ_Q2_ID,
        type: 'FIB',
        text: 'Simplify 4/8 to lowest terms.',
        timeLimit: 0,
        correctAnswer: '1/2',
        incorrectAnswers: [],
        points: 1,
      },
    ],
  };
}

function quizPublicQuestions(): QuizPublicQuestion[] {
  return [
    {
      id: QUIZ_Q1_ID,
      type: 'MC',
      text: 'What is 1/2 + 1/4?',
      timeLimit: 30,
      choices: ['3/4', '1/4', '2/6', '1/8'],
    },
    {
      id: QUIZ_Q2_ID,
      type: 'FIB',
      text: 'Simplify 4/8 to lowest terms.',
      timeLimit: 0,
    },
  ];
}

export function makeQuizSession(
  status: QuizSessionStatus = 'active'
): QuizSession {
  return {
    id: QUIZ_SESSION_ID,
    assignmentId: QUIZ_SESSION_ID,
    quizId: QUIZ_ID,
    quizTitle: 'Fractions Review',
    teacherUid: 'mock-user-id',
    status,
    sessionMode: 'teacher',
    currentQuestionIndex:
      status === 'waiting' ? -1 : status === 'ended' ? 1 : 0,
    startedAt: status === 'waiting' ? null : NOW - 600_000,
    endedAt: status === 'ended' ? NOW - 60_000 : null,
    code: 'ABC123',
    totalQuestions: 2,
    publicQuestions: quizPublicQuestions(),
    periodNames: ['Period 3'],
    tabWarningsEnabled: true,
    // Keeps the harness's raised-hand fixture reachable under the new gate.
    handRaiseEnabled: true,
  };
}

export function makeQuizConfig(): QuizConfig {
  return {
    view: 'monitor',
    selectedQuizId: QUIZ_ID,
    selectedQuizTitle: 'Fractions Review',
    activeAssignmentId: QUIZ_SESSION_ID,
    activeLiveSessionCode: 'ABC123',
    resultsSessionId: QUIZ_SESSION_ID,
    periodNames: ['Period 3'],
  };
}

/* ─── Quiz responses ─────────────────────────────────────────────────────── */

// Minimal Timestamp stand-in so mocks stay free of the Firestore SDK.
function fakeTimestamp(ms: number): import('firebase/firestore').Timestamp {
  return {
    toMillis: () => ms,
    seconds: Math.floor(ms / 1000),
    nanoseconds: (ms % 1000) * 1_000_000,
  } as import('firebase/firestore').Timestamp;
}

function quizCompleted(
  key: string,
  pin: string,
  q1Answer: string,
  q2Answer: string,
  warnings = 0
): QuizResponse {
  return {
    _responseKey: key,
    studentUid: key,
    pin,
    joinedAt: NOW - 540_000,
    status: 'completed',
    answers: [
      { questionId: QUIZ_Q1_ID, answer: q1Answer, answeredAt: NOW - 480_000 },
      { questionId: QUIZ_Q2_ID, answer: q2Answer, answeredAt: NOW - 420_000 },
    ],
    score: null,
    submittedAt: NOW - 400_000,
    classPeriod: 'Period 3',
    completedAttempts: 1,
    ...(warnings > 0 ? { tabSwitchWarnings: warnings } : {}),
  };
}

/** Saved earlier attempts for the harness attempt picker: student 1001 missed both the first time. */
export function makeQuizAttemptCopies(
  responseKey: string
): (Partial<QuizResponse> & { n: number; closed?: boolean })[] {
  if (responseKey !== 'pin-Period 3-1001') return [];
  return [
    {
      n: 1,
      closed: true,
      studentUid: responseKey,
      submittedAt: NOW - 3_600_000,
      answers: [
        { questionId: QUIZ_Q1_ID, answer: '1/4', answeredAt: NOW - 3_700_000 },
        { questionId: QUIZ_Q2_ID, answer: '4/8', answeredAt: NOW - 3_650_000 },
      ],
    },
  ];
}

export function makeQuizResponses(): QuizResponse[] {
  return [
    // High score — both correct.
    {
      ...quizCompleted('pin-Period 3-1001', '1001', '3/4', '1/2'),
      completedAttempts: 2,
    },
    // Mid score — first correct, second wrong.
    quizCompleted('pin-Period 3-1002', '1002', '3/4', '2/4'),
    // Low score — both wrong, plus a tab-switch warning.
    quizCompleted('pin-Period 3-1003', '1003', '1/4', '4/8', 2),
    // In-progress — one answer submitted, not finished.
    {
      _responseKey: 'pin-Period 3-1004',
      studentUid: 'pin-Period 3-1004',
      pin: '1004',
      joinedAt: NOW - 300_000,
      status: 'in-progress',
      answers: [
        { questionId: QUIZ_Q1_ID, answer: '3/4', answeredAt: NOW - 200_000 },
      ],
      score: null,
      submittedAt: null,
      classPeriod: 'Period 3',
    },
    // Joined only — no answers yet.
    {
      _responseKey: 'pin-Period 3-1005',
      studentUid: 'pin-Period 3-1005',
      pin: '1005',
      joinedAt: NOW - 120_000,
      status: 'joined',
      answers: [],
      score: null,
      submittedAt: null,
      classPeriod: 'Period 3',
    },
    // In-progress with a raised hand (fake Timestamp keeps mocks SDK-free).
    {
      _responseKey: 'pin-Period 3-1007',
      studentUid: 'pin-Period 3-1007',
      pin: '1007',
      joinedAt: NOW - 400_000,
      status: 'in-progress',
      answers: [
        { questionId: QUIZ_Q1_ID, answer: '1/4', answeredAt: NOW - 100_000 },
      ],
      score: null,
      submittedAt: null,
      classPeriod: 'Period 3',
      handRaisedAt: fakeTimestamp(NOW - 90_000),
    },
    // In-progress and stuck — last write well past the 120s threshold.
    {
      _responseKey: 'pin-Period 3-1008',
      studentUid: 'pin-Period 3-1008',
      pin: '1008',
      joinedAt: NOW - 600_000,
      status: 'in-progress',
      answers: [
        { questionId: QUIZ_Q1_ID, answer: '3/4', answeredAt: NOW - 300_000 },
      ],
      score: null,
      submittedAt: null,
      classPeriod: 'Period 3',
      lastWriteAt: fakeTimestamp(NOW - 300_000),
    },
    // Locked / auto-submitted attempt.
    {
      _responseKey: 'pin-Period 3-1006',
      studentUid: 'pin-Period 3-1006',
      pin: '1006',
      joinedAt: NOW - 500_000,
      status: 'completed',
      answers: [
        { questionId: QUIZ_Q1_ID, answer: '1/8', answeredAt: NOW - 470_000 },
      ],
      score: null,
      submittedAt: NOW - 450_000,
      classPeriod: 'Period 3',
      completedAttempts: 1,
      autoSubmitted: true,
      tabSwitchWarnings: 3,
    },
  ];
}

/* ─── Video Activity data ────────────────────────────────────────────────── */

const VA_Q1_ID = 'vq1';
const VA_Q2_ID = 'vq2';

function vaQuestions(): VideoActivityQuestion[] {
  return [
    {
      id: VA_Q1_ID,
      type: 'MC',
      text: 'What gas do plants absorb during photosynthesis?',
      timeLimit: 0,
      timestamp: 45,
      correctAnswer: 'Carbon dioxide',
      incorrectAnswers: ['Oxygen', 'Nitrogen', 'Hydrogen'],
      points: 1,
    },
    {
      id: VA_Q2_ID,
      type: 'FIB',
      text: 'Photosynthesis happens in the ____ of the cell.',
      timeLimit: 0,
      timestamp: 120,
      correctAnswer: 'chloroplast',
      incorrectAnswers: [],
      points: 1,
    },
  ];
}

export function makeVaSession(
  status: VideoActivitySession['status'] = 'active'
): VideoActivitySession {
  return {
    id: VA_SESSION_ID,
    activityId: VA_ID,
    activityTitle: 'Photosynthesis Explained',
    assignmentName: 'Photosynthesis — Period 1',
    teacherUid: 'mock-user-id',
    youtubeUrl: 'https://www.youtube.com/watch?v=dev-mock',
    questions: vaQuestions(),
    status,
    allowedPins: [],
    createdAt: NOW - 7_200_000,
    endedAt: status === 'ended' ? NOW - 60_000 : undefined,
    periodNames: ['Period 1'],
  };
}

/* ─── Video Activity responses ───────────────────────────────────────────── */

function vaResponse(
  key: string,
  pin: string,
  answers: { questionId: string; answer: string }[],
  completed: boolean,
  warnings = 0
): VideoActivityResponse {
  return {
    _responseKey: key,
    studentUid: key,
    pin,
    joinedAt: NOW - 540_000,
    answers: answers.map((a, i) => ({
      questionId: a.questionId,
      answer: a.answer,
      answeredAt: NOW - 480_000 + i * 30_000,
    })),
    completedAt: completed ? NOW - 400_000 : null,
    score: null,
    classPeriod: 'Period 1',
    ...(completed ? { completedAttempts: 1 } : {}),
    ...(warnings > 0 ? { tabSwitchWarnings: warnings } : {}),
  };
}

export function makeVaResponses(): VideoActivityResponse[] {
  return [
    // Both correct.
    vaResponse(
      'pin-Period 1-2001',
      '2001',
      [
        { questionId: VA_Q1_ID, answer: 'Carbon dioxide' },
        { questionId: VA_Q2_ID, answer: 'chloroplast' },
      ],
      true
    ),
    // One correct, one wrong.
    vaResponse(
      'pin-Period 1-2002',
      '2002',
      [
        { questionId: VA_Q1_ID, answer: 'Carbon dioxide' },
        { questionId: VA_Q2_ID, answer: 'nucleus' },
      ],
      true
    ),
    // Both wrong, with tab warnings.
    vaResponse(
      'pin-Period 1-2003',
      '2003',
      [
        { questionId: VA_Q1_ID, answer: 'Oxygen' },
        { questionId: VA_Q2_ID, answer: 'mitochondria' },
      ],
      true,
      2
    ),
    // In-progress — one answer so far.
    vaResponse(
      'pin-Period 1-2004',
      '2004',
      [{ questionId: VA_Q1_ID, answer: 'Carbon dioxide' }],
      false
    ),
    // Joined only — no answers.
    vaResponse('pin-Period 1-2005', '2005', [], false),
  ];
}

/* ─── Timed (overall time limit) fixtures ─────────────────────────────────── */

const TIMED_STARTS: Record<string, number> = {
  'pin-Period 3-1004': NOW - 17 * 60_000 - 48_000,
  'pin-Period 3-1005': NOW - 4 * 60_000,
  'pin-Period 3-1007': NOW - 29 * 60_000 - 20_000,
  'pin-Period 3-1008': NOW - 22 * 60_000,
};

/** A self-paced session with a 30 minute limit. */
export function makeTimedQuizSession(
  status: QuizSessionStatus = 'active'
): QuizSession {
  return {
    ...makeQuizSession(status),
    sessionMode: 'student',
    timeLimitMinutes: 30,
  };
}

/** Responses with server-stamped attempt starts; 1006 ran out of time. */
export function makeTimedQuizResponses(): QuizResponse[] {
  return makeQuizResponses().map((r) => {
    const key = r._responseKey ?? r.studentUid;
    const start = TIMED_STARTS[key];
    if (start != null) return { ...r, attemptStartedAt: fakeTimestamp(start) };
    if (key === 'pin-Period 3-1006')
      return {
        ...r,
        autoSubmitted: undefined,
        tabSwitchWarnings: 0,
        timeUp: true,
      };
    return r;
  });
}

/** The student's own in-progress response with `remainingMs` left on the clock. */
export function makeTimedStudentResponse(remainingMs: number): QuizResponse {
  return {
    _responseKey: 'pin-Period 3-1004',
    studentUid: 'pin-Period 3-1004',
    pin: '1004',
    joinedAt: NOW - 30 * 60_000 + remainingMs,
    status: 'in-progress',
    answers: [],
    score: null,
    submittedAt: null,
    classPeriod: 'Period 3',
    attemptStartedAt: fakeTimestamp(NOW - 30 * 60_000 + remainingMs),
    lastWriteAt: fakeTimestamp(NOW - 30_000),
  };
}

/* ─── Review game results ────────────────────────────────────────────────── */

export function makeReviewGameSession(): QuizSession {
  return {
    ...makeQuizSession('ended'),
    sessionMode: 'game',
    widgetKind: 'review',
    speedBonusEnabled: true,
    streakBonusEnabled: true,
  };
}

// First tries live in `answers`; `game` holds every try's points (plan D25).
function reviewPlayer(
  pin: string,
  q1: string,
  q2: string,
  points: number,
  answered: number
): QuizResponse {
  const q1Right = q1 === '3/4';
  const q2Right = q2 === '1/2';
  return {
    ...quizCompleted(`pin-Period 3-${pin}`, pin, q1, q2),
    answers: [
      {
        questionId: QUIZ_Q1_ID,
        answer: q1,
        answeredAt: NOW - 480_000,
        isCorrect: q1Right,
      },
      {
        questionId: QUIZ_Q2_ID,
        answer: q2,
        answeredAt: NOW - 470_000,
        isCorrect: q2Right,
      },
    ],
    game: {
      points,
      streak: 0,
      answered,
      correct: Math.round(answered * 0.7),
      firstTry: { [QUIZ_Q1_ID]: q1Right, [QUIZ_Q2_ID]: q2Right },
      lastCorrect: { [QUIZ_Q1_ID]: true, [QUIZ_Q2_ID]: true },
      last: null,
    },
  };
}

export function makeReviewGameResponses(): QuizResponse[] {
  return [
    reviewPlayer('1001', '3/4', '1/2', 18.4, 22),
    reviewPlayer('1002', '3/4', '2/4', 15.25, 19),
    reviewPlayer('1003', '1/4', '1/2', 15.25, 18),
    reviewPlayer('1007', '1/4', '4/8', 9.8, 14),
    reviewPlayer('1008', '3/4', '1/2', 21.05, 24),
  ];
}

/** Two-page PDF of small print, as a data URL, so zoom sharpness is easy to judge. */
function smallPrintPdfDataUrl(): string {
  const page = (n: number) =>
    `BT /F1 8 Tf 72 740 Td 11 TL ${Array.from(
      { length: 50 },
      (_, i) =>
        `(Page ${n}, line ${i + 1}: small print should stay sharp at 400% zoom.) '`
    ).join(' ')} ET`;
  const objs = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R 4 0 R]/Count 2>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 5 0 R/Resources<</Font<</F1 7 0 R>>>>>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 6 0 R/Resources<</Font<</F1 7 0 R>>>>>>',
    `<</Length ${page(1).length}>>stream\n${page(1)}\nendstream`,
    `<</Length ${page(2).length}>>stream\n${page(2)}\nendstream`,
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj${o}endobj\n`;
  });
  const xref = body.length;
  const rows = offsets
    .map((o) => `${String(o).padStart(10, '0')} 00000 n \n`)
    .join('');
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${rows}`;
  body += `trailer<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF`;
  return `data:application/pdf;base64,${btoa(body)}`;
}

/** A 2000px-wide raster with fine print, drawn at runtime. */
function finePrintImageDataUrl(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 2000;
  canvas.height = 1200;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 2000, 1200);
  ctx.fillStyle = '#1e293b';
  ctx.font = '14px sans-serif';
  for (let y = 30; y < 1200; y += 22) {
    ctx.fillText(
      `Row ${Math.round(y / 22)}: fine print in a 2000px image is readable when zoomed.`,
      30,
      y
    );
  }
  return canvas.toDataURL('image/png');
}

/** Self-paced written question with image, passage and PDF stimuli, quoting on. */
export function makeStimulusQuizSession(): QuizSession {
  const base = makeTimedQuizSession('active');
  const [first, ...rest] = base.publicQuestions;
  return {
    ...base,
    stimuli: [
      {
        id: 'dev-stim-image',
        type: 'image',
        url: finePrintImageDataUrl(),
        label: 'Fine print image',
      },
      {
        id: 'dev-stim-passage',
        type: 'text',
        url: '',
        label: 'Passage',
        text: 'Researchers pooled results from many studies of group therapy for chronic pain. The difference in the means between the group that received group therapy and the group that did not was not large.',
      },
      {
        id: 'dev-stim-pdf',
        type: 'pdf',
        url: smallPrintPdfDataUrl(),
        label: 'Small print PDF',
      },
    ],
    allowStimulusQuotes: true,
    publicQuestions: [
      {
        ...first,
        type: 'free-response',
        timeLimit: 0,
        text: 'Describe the effect size reported in the study. Quote the passage.',
        choices: undefined,
        stimulusIds: ['dev-stim-image', 'dev-stim-passage', 'dev-stim-pdf'],
      },
      ...rest,
    ],
  };
}

/** A self-paced session whose first question is a whiteboard response. */
export function makeWhiteboardQuizSession(): QuizSession {
  const base = makeTimedQuizSession('active');
  const [first, ...rest] = base.publicQuestions;
  return {
    ...base,
    mediaResponseEnabled: true,
    whiteboardResponseEnabled: true,
    publicQuestions: [
      {
        ...first,
        type: 'free-response',
        timeLimit: 0,
        text: 'What keeps the planets moving in orbits around the Sun instead of flying off into space or falling into the Sun? Draw it and explain.',
        choices: undefined,
        recording: {
          mode: 'whiteboard',
          prepSeconds: 0,
          limitSeconds: 180,
          prepExpiry: 'armed',
          takeLimit: 2,
          explainAloud: true,
          review: true,
          startingPage: { pattern: { kind: 'grid' } },
        },
      },
      ...rest,
    ],
  };
}

/** Self-paced math question with a Desmos graphing calculator beside it. */
export function makeCalculatorQuizSession(): QuizSession {
  const base = makeTimedQuizSession('active');
  const [first, ...rest] = base.publicQuestions;
  return {
    ...base,
    stimuli: [
      {
        id: 'dev-stim-calc',
        type: 'calculator',
        url: '',
        label: '',
        calculator: 'graphing',
      },
    ],
    publicQuestions: [
      {
        ...first,
        timeLimit: 0,
        type: 'MC',
        text: 'Where does y = 2x + 3 cross the x-axis?',
        choices: ['x = -1.5', 'x = 1.5', 'x = 3', 'x = -3'],
        stimulusIds: ['dev-stim-calc'],
      },
      ...rest,
    ],
  };
}

/** Self-paced quiz with a Stop after Part 1, split across two class periods. */
export function makeStopQuizSession(
  status: QuizSessionStatus = 'active'
): QuizSession {
  return {
    ...makeQuizSession(status),
    sessionMode: 'student',
    periodNames: ['Period 3', 'Period 5'],
    sections: [
      {
        id: 'sec-1',
        title: 'Part 1',
        questionIds: [QUIZ_Q1_ID],
        stopAfter: true,
      },
      { id: 'sec-2', title: 'Part 2', questionIds: [QUIZ_Q2_ID] },
    ],
  };
}

export function makeStopQuizResponses(): QuizResponse[] {
  const held = (pin: string, period: string): QuizResponse => ({
    _responseKey: `pin-${period}-${pin}`,
    studentUid: `pin-${period}-${pin}`,
    pin,
    joinedAt: NOW - 900_000,
    status: 'in-progress',
    answers: [
      { questionId: QUIZ_Q1_ID, answer: '3/4', answeredAt: NOW - 600_000 },
    ],
    score: null,
    submittedAt: null,
    classPeriod: period,
    partsDone: 1,
    partHeld: true,
  });
  return [
    held('1001', 'Period 3'),
    held('1002', 'Period 3'),
    held('1003', 'Period 3'),
    held('2001', 'Period 5'),
    held('2002', 'Period 5'),
    ...makeQuizResponses().filter((r) => r.status !== 'completed'),
  ];
}
