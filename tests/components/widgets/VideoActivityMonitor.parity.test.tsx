import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react';
import { updateDoc } from 'firebase/firestore';
import type {
  PeriodAccess,
  VideoActivityQuestion,
  VideoActivityResponse,
  VideoActivitySession,
} from '@/types';
import { VideoActivityLiveMonitor } from '@/components/widgets/VideoActivityWidget/components/VideoActivityLiveMonitor';

const NOW = new Date(2026, 8, 29, 10, 50).getTime();
const showConfirm = vi.hoisted(() => vi.fn(() => Promise.resolve(true)));

vi.mock('@/utils/serverTime', () => ({ getServerNow: () => NOW }));
vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn((_db: unknown, ...segs: string[]) => segs.join('/')),
  FieldPath: class {
    segments: string[];
    constructor(...segments: string[]) {
      this.segments = segments;
    }
  },
  getDocs: vi.fn(),
  getDoc: vi.fn(() => new Promise(() => undefined)),
  query: vi.fn(),
  serverTimestamp: vi.fn(),
  Timestamp: { fromMillis: vi.fn() },
  updateDoc: vi.fn(() => Promise.resolve()),
  where: vi.fn(),
  writeBatch: vi.fn(() => ({ update: vi.fn(), commit: vi.fn() })),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm }),
}));
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: vi.fn(), rosters: [] }),
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'teacher-1' },
    orgId: 'org',
    featurePermissions: [],
    canAccessFeature: () => true,
  }),
}));
vi.mock('@/hooks/useAssignmentPseudonyms', () => ({
  useAssignmentPseudonymsMulti: () => ({ byStudentUid: new Map() }),
  formatStudentName: () => undefined,
}));
vi.mock('@/hooks/useLtiSessionNames', () => ({
  useLtiSessionNames: () => new Map(),
}));

const QUESTIONS: VideoActivityQuestion[] = vi.hoisted(() => [
  {
    id: 'q1',
    type: 'MC',
    text: 'Which gas?',
    timeLimit: 0,
    timestamp: 45,
    correctAnswer: 'CO2',
    incorrectAnswers: ['O2'],
  },
  {
    id: 'q2',
    type: 'FIB',
    text: 'Where?',
    timeLimit: 0,
    timestamp: 120,
    correctAnswer: 'chloroplast',
    incorrectAnswers: [],
    acceptableVariants: ['chloroplasts'],
  },
]);

vi.mock('@/hooks/useVideoActivityKeyQuestions', () => ({
  useVideoActivityKeyQuestions: () => ({
    questions: QUESTIONS,
    loading: false,
    failed: false,
  }),
}));

const period = (over: Partial<PeriodAccess>): PeriodAccess => ({
  state: 'closed',
  openAt: null,
  closeAt: null,
  bellPeriodId: null,
  verified: true,
  label: 'P',
  ...over,
});

const session = (over: Partial<VideoActivitySession> = {}) =>
  ({
    id: 's1',
    activityId: 'a1',
    activityTitle: 'Cells',
    assignmentName: 'Cells',
    teacherUid: 'teacher-1',
    youtubeUrl: 'https://youtu.be/x',
    questions: [],
    publicQuestions: [],
    status: 'active',
    allowedPins: [],
    createdAt: 1,
    periodNames: ['P1', 'P3'],
    classPeriodByClassId: { 'cl-1': 'P1', 'cl-3': 'P3' },
    ...over,
  }) as VideoActivitySession;

const answer = (questionId: string, a: string, at = 1) => ({
  questionId,
  answer: a,
  answeredAt: at,
});

const response = (
  over: Partial<VideoActivityResponse>
): VideoActivityResponse => ({
  studentUid: 'u1',
  pin: '1234',
  joinedAt: 1,
  answers: [],
  completedAt: null,
  score: null,
  ...over,
});

const RESPONSES = [
  response({ studentUid: 'a', pin: '1001', classPeriod: 'P1' }),
  response({
    studentUid: 'b',
    pin: '1002',
    classPeriod: 'P1',
    answers: [answer('q1', 'CO2')],
  }),
  response({
    studentUid: 'c',
    pin: '1003',
    classPeriod: 'P1',
    completedAt: 5,
    answers: [answer('q1', 'O2'), answer('q2', 'chloroplasts')],
  }),
  response({
    studentUid: 'd',
    pin: '3001',
    classPeriod: 'P3',
    completedAt: 5,
    answers: [answer('q1', 'CO2'), answer('q2', 'chloroplast')],
  }),
];

const onPause = vi.fn(() => Promise.resolve());
const onEnd = vi.fn(() => Promise.resolve());

const renderMonitor = (
  s: VideoActivitySession,
  responses: VideoActivityResponse[] = RESPONSES
) =>
  render(
    <VideoActivityLiveMonitor
      session={s}
      responses={responses}
      onEnd={onEnd}
      onPause={onPause}
      onResume={vi.fn()}
      onUnlockStudent={vi.fn()}
    />
  );

const bucket = (label: string) =>
  screen.getByRole('button', { name: new RegExp(label) });

describe('VideoActivityLiveMonitor — monitor-parity layout', () => {
  beforeEach(() => vi.clearAllMocks());

  it('counts the first class by default and the whole assignment under All classes', () => {
    renderMonitor(session());
    expect(bucket('Not started')).toHaveTextContent('1');
    expect(bucket('In progress')).toHaveTextContent('1');
    expect(bucket('Done')).toHaveTextContent('1');
    fireEvent.change(screen.getByRole('combobox', { name: 'Class' }), {
      target: { value: '' },
    });
    expect(bucket('Done')).toHaveTextContent('2');
  });

  it('shows the shared Pause only beside All classes', () => {
    renderMonitor(session());
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
    fireEvent.change(screen.getByRole('combobox', { name: 'Class' }), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(onPause).toHaveBeenCalledTimes(1);
  });

  it('keeps Pause in the footer for one class', () => {
    renderMonitor(session({ periodNames: ['P1'] }));
    expect(screen.queryByRole('combobox', { name: 'Class' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  it('grades marks and scores with the activity grader, accepting variants', () => {
    renderMonitor(session());
    fireEvent.click(bucket('Done'));
    expect(screen.getByRole('img', { name: '1 of 2 correct' })).toBeVisible();
    expect(screen.getByText('50%')).toBeVisible();
  });

  it('closes every class after the Close all confirmation', async () => {
    renderMonitor(session());
    fireEvent.click(screen.getByRole('button', { name: 'Close all' }));
    await waitFor(() => expect(onEnd).toHaveBeenCalledTimes(1));
    expect(showConfirm).toHaveBeenCalledWith(
      expect.stringContaining('Close this assignment for every class'),
      expect.objectContaining({ confirmLabel: 'Close all' })
    );
  });

  it('opens a question to its answer spread', () => {
    renderMonitor(session({ periodNames: ['P1'] }));
    fireEvent.click(screen.getByRole('button', { name: 'Question results' }));
    fireEvent.click(screen.getByRole('button', { name: /Which gas\?/ }));
    expect(screen.getByText('Q1 results')).toBeVisible();
    expect(screen.getByText(/Question 1 · 0:45 · 3 answered/)).toBeVisible();
  });

  it('gives per-period classes their own Start and lets a waiting student in', async () => {
    renderMonitor(
      session({
        accessMode: 'assessment',
        periodAccess: {
          'cl-1': period({ label: 'P1' }),
          'cl-3': period({ label: 'P3', state: 'open' }),
        },
      }),
      [
        response({ studentUid: 'u1', pin: '1111', classId: 'cl-1' }),
        response({ studentUid: 'u3', pin: '3333', classId: 'cl-3' }),
      ]
    );
    expect(screen.getByRole('button', { name: 'Start' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
    fireEvent.click(bucket('Not started'));
    fireEvent.click(screen.getByRole('button', { name: 'Actions for 1111' }));
    const menuItem = screen.getByRole('button', { name: 'Let in now' });
    fireEvent.click(menuItem);
    await waitFor(() => expect(updateDoc).toHaveBeenCalledTimes(1));
    const [ref, path] = (updateDoc as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0] as [string, { segments: string[] }];
    expect(ref).toBe('video_activity_sessions/s1');
    expect(path.segments).toEqual(['studentAccess', 'u1']);
    expect(
      within(document.body).queryByRole('button', { name: 'Actions for 3333' })
    ).toBeNull();
  });
});
