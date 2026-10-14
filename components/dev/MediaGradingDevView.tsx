/**
 * DEV-only fixture wrapper for `FreeResponseGrader`. Mounts the REAL
 * component (no fork) against synthetic responses, with a take resolver that
 * hands back a silent WAV instead of hitting Google Drive.
 */
import React, { useContext, useMemo } from 'react';
import { AuthContext } from '@/context/AuthContextValue';
import {
  PAGE_H,
  PAGE_W,
  paintReplayFrame,
} from '@/components/quiz/whiteboard/replayFrame';
import {
  replayAt,
  whiteboardLogDuration,
  type WhiteboardLog,
} from '@/components/quiz/whiteboard/whiteboardLog';
import {
  renderStartingPageCanvas,
  startingPageId,
} from '@/utils/whiteboard/startingPage';
import { FreeResponseGrader } from '@/components/widgets/QuizWidget/components/FreeResponseGrader';
import type {
  DrawableObject,
  WhiteboardStartingPage,
  ArtifactArchiveEntry,
  QuizQuestion,
  QuizResponse,
  ResponseArtifact,
} from '@/types';
import { type MediaGradingStateKey } from './devViewStates';

// 0.2s of silence — enough for the transport to be real without a fixture file.
const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=';

const RECORDING = {
  prepSeconds: 30,
  limitSeconds: 60,
  prepExpiry: 'armed' as const,
  takeLimit: null,
};

// 1x1 PNG so the grader's attachment toggle has something to expand.
const DEV_STIMULUS = {
  id: 'stim-dev-1',
  type: 'image' as const,
  url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  label: 'Dev stimulus',
};

const TYPED_QUESTION = {
  id: 'q3',
  text: 'In two or three sentences, explain why the experiment failed.',
  type: 'free-response',
  correctAnswer: '',
  incorrectAnswers: [],
  timeLimit: 0,
  points: 5,
  minWords: 40,
  maxWords: 120,
  rubricSnapshot: {
    id: 'dev-rubric',
    title: 'Explanation Rubric',
    createdAt: 0,
    updatedAt: 0,
    criteria: [
      {
        id: 'c1',
        name: 'Identifies the cause',
        description: 'Names what actually went wrong.',
        levels: [
          { id: 'c1l1', label: 'Missing', points: 0 },
          { id: 'c1l2', label: 'Partial', points: 1 },
          { id: 'c1l3', label: 'Clear', points: 3 },
        ],
      },
      {
        id: 'c2',
        name: 'Supports with evidence',
        levels: [
          {
            id: 'c2l1',
            label: 'No',
            points: 0,
            description: 'Assertion only.',
          },
          {
            id: 'c2l2',
            label: 'Yes',
            points: 2,
            description: 'Cites the data.',
          },
        ],
      },
    ],
  },
};

const GUIDE_RUBRIC = {
  id: 'dev-guide',
  title: 'Pain study scoring guide',
  createdAt: 0,
  updatedAt: 0,
  criteria: [
    {
      id: 'g1',
      name: '(A) Research method',
      description:
        'Identifies the research method as a meta-analysis.\nDo not accept "experiment".',
      levels: [
        { id: 'g1l0', label: 'Not earned', points: 0 },
        { id: 'g1l1', label: 'Earned', points: 1 },
      ],
      guide: {
        examples: [
          'The researchers used a meta-analysis.',
          'They combined the results of many earlier studies.',
        ],
      },
    },
    {
      id: 'g2',
      name: '(B) Operational definition',
      description:
        'Defines pain intensity as the self-reported 0 to 10 rating.',
      levels: [
        { id: 'g2l0', label: '0 of 2', points: 0 },
        { id: 'g2l1', label: '1 of 2', points: 1 },
        { id: 'g2l2', label: '2 of 2', points: 2 },
      ],
      guide: { examples: ['Pain was measured on a 0 to 10 scale.'] },
    },
  ],
};

const WB_PAGE: WhiteboardStartingPage = {
  pattern: { kind: 'coordinate-plane', xMin: -8, xMax: 8, yMin: -6, yMax: 6 },
};

// A student plots two points, draws a wrong line, erases it, then draws y = 2x - 1.
function buildWhiteboardLog(): WhiteboardLog {
  const at = (x: number, y: number) => ({ x: 800 + x * 91, y: 600 - y * 88 });
  const path = (
    id: string,
    z: number,
    t: number,
    from: { x: number; y: number },
    to: { x: number; y: number },
    color: string
  ) => {
    const points = Array.from({ length: 41 }, (_, i) => ({
      x: from.x + ((to.x - from.x) * i) / 40,
      y: from.y + ((to.y - from.y) * i) / 40,
    }));
    return {
      t,
      op: 'do' as const,
      cmd: {
        kind: 'add' as const,
        object: { id, kind: 'path' as const, z, points, color, width: 6 },
        pointTimes: points.map((_, i) => i * 40),
      },
    };
  };
  return {
    v: 1,
    page: { w: 1600, h: 1200 },
    startingPageId: startingPageId(WB_PAGE),
    events: [
      path('wrong', 1, 4000, at(-3, -4.5), at(3, 4.5), '#dc2626'),
      { t: 9000, op: 'do', cmd: { kind: 'remove', id: 'wrong' } },
      path('answer', 2, 12000, at(-2, -5), at(3.5, 6), '#1d4ed8'),
    ],
  };
}

function renderWhiteboardPicture(log: WhiteboardLog): string {
  const canvas = document.createElement('canvas');
  canvas.width = PAGE_W * 2;
  canvas.height = PAGE_H * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const objects: DrawableObject[] = replayAt(log, whiteboardLogDuration(log));
  paintReplayFrame(
    ctx,
    renderStartingPageCanvas(WB_PAGE, null, 2),
    document.createElement('canvas'),
    objects,
    2
  );
  return canvas.toDataURL('image/png');
}

// Hands each whiteboard file id its fixture; anything else plays silence.
function whiteboardResolver(): (id: string) => Promise<string> {
  const log = buildWhiteboardLog();
  const picture = renderWhiteboardPicture(log);
  return (id) =>
    Promise.resolve(
      id.endsWith('-pic')
        ? picture
        : id.endsWith('-log')
          ? URL.createObjectURL(
              new Blob([JSON.stringify(log)], { type: 'application/json' })
            )
          : SILENT_WAV
    );
}

function makeQuestions(state: MediaGradingStateKey): QuizQuestion[] {
  const spoken = [
    {
      id: 'q1',
      text: 'Explain, out loud, how you solved problem 4.',
      type: 'free-response',
      correctAnswer: '',
      incorrectAnswers: [],
      timeLimit: 0,
      points: 4,
      recording:
        state === 'device-gated' || state === 'whiteboard'
          ? { ...RECORDING, mode: 'whiteboard' as const, startingPage: WB_PAGE }
          : RECORDING,
    },
    {
      id: 'q2',
      text: 'Read the passage aloud and say what the author means by "drift".',
      type: 'free-response',
      correctAnswer: '',
      incorrectAnswers: [],
      timeLimit: 0,
      points: 3,
      recording: RECORDING,
      stimulusIds: [DEV_STIMULUS.id],
    },
  ];
  if (state === 'typed-guide') {
    return [
      { ...TYPED_QUESTION, points: 3, rubricSnapshot: GUIDE_RUBRIC },
      ...spoken,
    ] as unknown as QuizQuestion[];
  }
  return (state === 'typed'
    ? [TYPED_QUESTION, ...spoken]
    : [...spoken, TYPED_QUESTION]) as unknown as QuizQuestion[];
}

function artifact(id: string, durationMs: number): ResponseArtifact {
  return {
    id,
    slot: 'primary',
    kind: 'audio',
    mimeType: 'audio/mp4',
    bytes: 120_000,
    durationMs,
    uploadState: 'uploaded',
  };
}

const archived = (fileId: string): ArtifactArchiveEntry => ({
  archiveStatus: 'archived',
  driveFileId: fileId,
  archivedAt: 1_700_000_000_000,
});

function makeResponses(state: MediaGradingStateKey): QuizResponse[] {
  const takes = (id: string, count: number) =>
    Array.from({ length: count }, (_, i) => ({
      questionId: 'q1',
      answer: '',
      answeredAt: 1_700_000_000_000 + i * 60_000,
      takeIndex: i + 1,
      ...(state === 'mic-blocked'
        ? { micState: i === 0 ? ('unavailable' as const) : ('denied' as const) }
        : {}),
      artifacts: [artifact(`${id}-take${i + 1}`, 18_000 + i * 5_000)],
    }));

  const ada: QuizResponse = {
    _responseKey: 'r-ada',
    studentUid: 'u-ada',
    pin: '01',
    status: 'completed',
    answers: takes('ada', 3),
    artifactArchive: {
      'ada-take1': archived('drive-ada-1'),
      'ada-take2': archived('drive-ada-2'),
      'ada-take3':
        state === 'archiving'
          ? { archiveStatus: 'syncing', archiveStartedAt: 1 }
          : state === 'deleted'
            ? {
                archiveStatus: 'deleted',
                deletedAt: 2,
                deletedBy: 'admin-uid',
              }
            : archived('drive-ada-3'),
    },
    grading:
      state === 'provisional'
        ? {}
        : { q1: { pointsAwarded: 3, gradedBy: 'teacher', gradedAt: 1 } },
  } as unknown as QuizResponse;

  const grace: QuizResponse = {
    _responseKey: 'r-grace',
    studentUid: 'u-grace',
    pin: '02',
    status: 'completed',
    answers: [
      {
        questionId: 'q1',
        answer: '',
        answeredAt: 1_700_000_100_000,
        unresponded:
          state === 'device-gated' ? 'device-gated' : 'capture-unavailable',
      },
    ],
  } as unknown as QuizResponse;

  const kath: QuizResponse = {
    _responseKey: 'r-kath',
    studentUid: 'u-kath',
    pin: '03',
    status: 'completed',
    answers: takes('kath', 1),
    artifactArchive: { 'kath-take1': archived('drive-kath-1') },
  } as unknown as QuizResponse;

  if (state === 'typed' || state === 'typed-guide') {
    const typed = (key: string, text: string, graded: boolean) =>
      ({
        _responseKey: key,
        studentUid: `u-${key}`,
        status: 'completed',
        tabSwitchWarnings: key === 'r-grace' ? 2 : 0,
        answers: [
          { questionId: 'q3', answer: text, answeredAt: 1_700_000_000_000 },
        ],
        grading: graded
          ? {
              q3: {
                pointsAwarded: state === 'typed-guide' ? 3 : 4,
                gradedBy: 'teacher',
                gradedAt: 1,
              },
            }
          : {},
      }) as unknown as QuizResponse;
    return [
      typed(
        'r-ada',
        '<p>The experiment failed because the passage says the control group was “<span data-quote="stim-1" data-quote-text="contaminated before the second trial">contaminated before the second trial</span>.” Without a clean baseline, “<span data-quote="stim-1" data-quote-text="none of the later measurements could be trusted">none of the later measurements could be trusted</span>,” so the team had to “<span data-quote="stim-1" data-quote-text="discard the run and start again with fresh samples">discard the run and start again</span>.”</p>',
        true
      ),
      typed('r-grace', '<p>It failed because we ran out of time.</p>', false),
      typed(
        'r-kath',
        '<p>The heating element was set to the wrong temperature for the whole first hour. By the time anyone noticed, the samples had already denatured, which explains why every reading after that came back flat.</p>',
        false
      ),
    ];
  }
  if (state === 'capture-unavailable' || state === 'device-gated')
    return [grace, ada, kath];
  if (state === 'whiteboard') {
    const wbTake = (key: string, drawOnly: boolean): QuizResponse =>
      ({
        _responseKey: key,
        studentUid: `u-${key}`,
        status: 'completed',
        answers: [
          {
            questionId: 'q1',
            answer: '',
            answeredAt: 1_700_000_000_000,
            takeIndex: 1,
            micState: drawOnly ? 'denied' : 'on',
            artifacts: [
              ...(drawOnly ? [] : [artifact(`${key}-aud`, 16_000)]),
              {
                id: `${key}-pic`,
                slot: 'primary',
                kind: 'whiteboard',
                part: 'picture',
                mimeType: 'image/png',
                uploadState: 'uploaded',
                durationMs: 16_000,
              },
              {
                id: `${key}-log`,
                slot: 'primary',
                kind: 'whiteboard',
                part: 'log',
                mimeType: 'application/json',
                uploadState: 'uploaded',
              },
            ],
          },
        ],
        artifactArchive: Object.fromEntries(
          ['aud', 'pic', 'log'].map((part) => [
            `${key}-${part}`,
            archived(`drive-${key}-${part}`),
          ])
        ),
      }) as unknown as QuizResponse;
    return [wbTake('r-ada', false), wbTake('r-kath', true)];
  }
  return [ada, grace, kath];
}

export const MediaGradingDevView: React.FC<{ state: MediaGradingStateKey }> = ({
  state,
}) => {
  const quiz = useMemo(
    () => ({
      id: 'quiz-dev',
      title: 'Spoken checks',
      questions: makeQuestions(state),
      stimuli: [DEV_STIMULUS],
      createdAt: 0,
      updatedAt: 0,
    }),
    [state]
  );
  const responses = useMemo(() => makeResponses(state), [state]);
  const names = useMemo(
    () =>
      new Map([
        ['r-ada', 'Ada Lovelace'],
        ['r-grace', 'Grace Hopper'],
        ['r-kath', 'Katherine Johnson'],
      ]),
    []
  );

  const resolveTakeUrl = useMemo(
    () =>
      state === 'whiteboard'
        ? whiteboardResolver()
        : () => Promise.resolve(SILENT_WAV),
    [state]
  );
  // Whiteboard fixtures need both fail-closed flags, which the bypass admin lacks.
  const auth = useContext(AuthContext);
  const devAuth = useMemo(
    () =>
      auth && (state === 'device-gated' || state === 'whiteboard')
        ? {
            ...auth,
            canAccessQuizMediaResponse: () => true,
            canAccessFeature: () => true,
          }
        : auth,
    [auth, state]
  );

  return (
    <AuthContext.Provider value={devAuth}>
      <FreeResponseGrader
        key={state}
        quiz={quiz}
        responses={responses}
        displayNameByResponseKey={names}
        teacherUid="teacher-dev"
        resolveTakeUrl={resolveTakeUrl}
        onSaveGrade={() => Promise.resolve()}
        onClose={() => undefined}
      />
    </AuthContext.Provider>
  );
};

export default MediaGradingDevView;
