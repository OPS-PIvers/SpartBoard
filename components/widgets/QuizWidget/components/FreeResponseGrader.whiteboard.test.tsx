import React from 'react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@/i18n';

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: () => undefined }),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: () => Promise.resolve(true) }),
}));
vi.mock('@/components/quiz/whiteboard/WhiteboardReplayView', () => ({
  WhiteboardReplayView: (props: {
    pictureUrl: string | null;
    audioSrc?: string | null;
    log: unknown;
    durationMs: number;
    markers?: { id: string; ms: number }[];
    onPositionChange?: (ms: number) => void;
    controlsEnd?: React.ReactNode;
  }) => (
    <div data-testid="replay">
      <span>picture:{props.pictureUrl}</span>
      <span>audio:{props.audioSrc ?? 'none'}</span>
      <span>log:{props.log ? 'yes' : 'no'}</span>
      <span>duration:{props.durationMs}</span>
      <span>markers:{props.markers?.map((m) => m.ms).join(',')}</span>
      <button type="button" onClick={() => props.onPositionChange?.(7_000)}>
        move playhead
      </button>
      {props.controlsEnd}
    </div>
  ),
}));
vi.mock('@/components/quiz/whiteboard/whiteboardLog', () => ({
  parseWhiteboardLog: (input: string) => JSON.parse(input) as unknown,
}));

import {
  FreeResponseGrader,
  type FreeResponseGraderProps,
} from './FreeResponseGrader';
import { AuthContext, type AuthContextType } from '@/context/AuthContextValue';
import type { QuizData, QuizResponse } from '@/types';

beforeAll(() => {
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: () => undefined,
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ text: () => Promise.resolve('{"v":1}') }))
  );
});

const RECORDING = {
  prepSeconds: 30,
  limitSeconds: 180,
  prepExpiry: 'armed' as const,
  takeLimit: null,
};

const quiz = {
  id: 'quiz-1',
  title: 'Show your work',
  questions: [
    {
      id: 'q1',
      text: 'Draw the triangle and explain.',
      type: 'free-response',
      correctAnswer: '',
      incorrectAnswers: [],
      timeLimit: 0,
      points: 4,
      recording: { ...RECORDING, mode: 'whiteboard' },
    },
    {
      id: 'q2',
      text: 'Say it out loud.',
      type: 'free-response',
      correctAnswer: '',
      incorrectAnswers: [],
      timeLimit: 0,
      points: 4,
      recording: RECORDING,
    },
  ],
} as unknown as QuizData;

const archived = (...ids: string[]) =>
  Object.fromEntries(
    ids.map((id) => [id, { archiveStatus: 'archived', driveFileId: `d-${id}` }])
  );

const whiteboardResponse = (
  key: string,
  { drawOnly = false, micState = 'on' } = {}
): QuizResponse =>
  ({
    _responseKey: key,
    studentUid: `u-${key}`,
    status: 'completed',
    answers: [
      {
        questionId: 'q1',
        answer: '',
        answeredAt: 1,
        takeIndex: 1,
        micState,
        artifacts: [
          ...(drawOnly
            ? []
            : [
                {
                  id: `${key}-a`,
                  slot: 'primary',
                  kind: 'audio',
                  uploadState: 'uploaded',
                  durationMs: 30_000,
                },
              ]),
          {
            id: `${key}-p`,
            slot: 'primary',
            kind: 'whiteboard',
            part: 'picture',
            uploadState: 'uploaded',
            durationMs: 25_000,
          },
          {
            id: `${key}-l`,
            slot: 'primary',
            kind: 'whiteboard',
            part: 'log',
            uploadState: 'uploaded',
          },
        ],
      },
      {
        questionId: 'q2',
        answer: '',
        answeredAt: 2,
        takeIndex: 1,
        artifacts: [
          {
            id: `${key}-s`,
            slot: 'primary',
            kind: 'audio',
            uploadState: 'uploaded',
            durationMs: 10_000,
          },
        ],
      },
    ],
    artifactArchive: archived(`${key}-a`, `${key}-p`, `${key}-l`, `${key}-s`),
  }) as unknown as QuizResponse;

const portraitGated = (key: string): QuizResponse =>
  ({
    _responseKey: key,
    studentUid: `u-${key}`,
    status: 'completed',
    answers: [
      {
        questionId: 'q1',
        answer: '',
        answeredAt: 1,
        unresponded: 'device-gated',
      },
    ],
  }) as unknown as QuizResponse;

const auth = (whiteboard: boolean) =>
  ({
    canAccessFeature: (id: string) =>
      id === 'quiz-whiteboard-response' ? whiteboard : false,
    canAccessQuizMediaResponse: () => true,
  }) as unknown as AuthContextType;

const renderGrader = (
  responses: QuizResponse[],
  {
    whiteboard = true,
    graderMode = 'question',
  }: { whiteboard?: boolean; graderMode?: 'question' | 'student' } = {}
) => {
  const onSaveGrade = vi.fn<FreeResponseGraderProps['onSaveGrade']>(() =>
    Promise.resolve()
  );
  const resolveTakeUrl = vi.fn((id: string) => Promise.resolve(`blob:${id}`));
  render(
    <AuthContext.Provider value={auth(whiteboard)}>
      <FreeResponseGrader
        quiz={quiz}
        responses={responses}
        displayNameByResponseKey={
          new Map([
            ['ada', 'Ada Lovelace'],
            ['grace', 'Grace Hopper'],
          ])
        }
        teacherUid="teacher-1"
        resolveTakeUrl={resolveTakeUrl}
        onSaveGrade={onSaveGrade}
        graderMode={graderMode}
        onClose={() => undefined}
      />
    </AuthContext.Provider>
  );
  return { onSaveGrade, resolveTakeUrl };
};

describe('FreeResponseGrader whiteboard takes', () => {
  it('keeps whiteboard questions out of the queue when the flag is off', async () => {
    renderGrader([whiteboardResponse('ada')], { whiteboard: false });
    expect(await screen.findByText('Question 1 of 1')).toBeTruthy();
    expect(screen.queryByText(/Draw the triangle/)).toBeNull();
    expect(screen.queryByTestId('replay')).toBeNull();
  });

  it('opens one take with its picture, log and audio, question by question', async () => {
    const { resolveTakeUrl } = renderGrader([
      whiteboardResponse('ada'),
      whiteboardResponse('grace'),
    ]);
    expect(await screen.findByText('Question 1 of 2')).toBeTruthy();
    expect(await screen.findByText('picture:blob:d-ada-p')).toBeTruthy();
    expect(screen.getByText('audio:blob:d-ada-a')).toBeTruthy();
    expect(screen.getByText('log:yes')).toBeTruthy();
    expect(screen.getByText('duration:30000')).toBeTruthy();
    expect(resolveTakeUrl).toHaveBeenCalledWith('d-ada-l');
    // One take, not three: the take list counts entries, not files.
    expect(screen.getByText('1 take recorded')).toBeTruthy();
  });

  it('gives a draw-only take a silent timeline', async () => {
    renderGrader([whiteboardResponse('ada', { drawOnly: true })]);
    expect(await screen.findByText('audio:none')).toBeTruthy();
    expect(screen.getByText('duration:25000')).toBeTruthy();
  });

  it('adds a comment at the replay playhead and saves it in ms', async () => {
    const { onSaveGrade } = renderGrader([whiteboardResponse('ada')]);
    fireEvent.click(await screen.findByText('move playhead'));
    fireEvent.click(screen.getByRole('button', { name: /comment here/i }));
    expect(screen.getByText('markers:7000')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Comment at 0:07'), {
      target: { value: 'Labels the hypotenuse' },
    });
    fireEvent.change(screen.getByLabelText(/points/i), {
      target: { value: '3' },
    });
    await waitFor(() => expect(onSaveGrade).toHaveBeenCalled(), {
      timeout: 4_000,
    });
    const grade = onSaveGrade.mock.calls.at(-1)?.[2];
    expect(grade?.annotations?.[0]?.from).toBe(7_000);
    expect(grade?.annotationUnit).toBe('ms');
  });

  it('shows the mic state on the take', async () => {
    renderGrader([whiteboardResponse('ada', { micState: 'denied' })]);
    expect(await screen.findByText('Mic blocked')).toBeTruthy();
  });

  it('explains a portrait-gated slot and offers the usual choices', async () => {
    renderGrader([portraitGated('ada')]);
    expect(await screen.findByText('This student could not draw')).toBeTruthy();
    expect(screen.getByRole('button', { name: /excuse/i })).toBeTruthy();
    expect(screen.getByText(/You saw the work another way/)).toBeTruthy();
  });

  it('walks a student through whiteboard and spoken answers in student mode', async () => {
    renderGrader([whiteboardResponse('ada')], { graderMode: 'student' });
    expect(await screen.findByText('picture:blob:d-ada-p')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /next question/i }));
    expect(await screen.findByText(/Say it out loud/)).toBeTruthy();
    expect(screen.queryByTestId('replay')).toBeNull();
  });
});
