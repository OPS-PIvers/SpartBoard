/**
 * DEV-only fixture wrapper for `FreeResponseGrader`. Mounts the REAL
 * component (no fork) against synthetic responses, with a take resolver that
 * hands back a silent WAV instead of hitting Google Drive.
 */
import React, { useMemo } from 'react';
import { FreeResponseGrader } from '@/components/widgets/QuizWidget/components/FreeResponseGrader';
import type {
  ArtifactArchiveEntry,
  QuizData,
  QuizQuestion,
  QuizResponse,
  ResponseArtifact,
} from '@/types';

export const MEDIA_GRADING_STATES = [
  'queue',
  'typed',
  'playing',
  'provisional',
  'capture-unavailable',
  'archiving',
  'deleted',
] as const;

export type MediaGradingStateKey = (typeof MEDIA_GRADING_STATES)[number];

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
      recording: RECORDING,
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
        unresponded: 'capture-unavailable',
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

  if (state === 'typed') {
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
          ? { q3: { pointsAwarded: 4, gradedBy: 'teacher', gradedAt: 1 } }
          : {},
      }) as unknown as QuizResponse;
    return [
      typed(
        'r-ada',
        '<p>The experiment failed because the control group was contaminated before the second trial. Without a clean baseline, none of the later measurements could be trusted, so the team had to discard the run and start again with fresh samples.</p>',
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
  if (state === 'capture-unavailable') return [grace, ada, kath];
  return [ada, grace, kath];
}

export const MediaGradingDevView: React.FC<{ state: MediaGradingStateKey }> = ({
  state,
}) => {
  const quiz = useMemo(
    () =>
      ({
        id: 'quiz-dev',
        title: 'Spoken checks',
        questions: makeQuestions(state),
        stimuli: [DEV_STIMULUS],
        createdAt: 0,
        updatedAt: 0,
      }) as QuizData,
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

  return (
    <FreeResponseGrader
      key={state}
      quiz={quiz}
      responses={responses}
      displayNameByResponseKey={names}
      teacherUid="teacher-dev"
      resolveTakeUrl={() => Promise.resolve(SILENT_WAV)}
      onSaveGrade={() => Promise.resolve()}
      onClose={() => undefined}
    />
  );
};

export default MediaGradingDevView;
