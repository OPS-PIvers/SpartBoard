import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { updateDoc } from 'firebase/firestore';
import type {
  PeriodAccess,
  VideoActivityResponse,
  VideoActivitySession,
} from '@/types';
import { VideoActivityLiveMonitor } from '@/components/widgets/VideoActivityWidget/components/VideoActivityLiveMonitor';

const NOW = new Date(2026, 8, 29, 10, 50).getTime();

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
  useDialog: () => ({ showConfirm: vi.fn() }),
}));
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: vi.fn(), rosters: [] }),
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'teacher-1' },
    orgId: 'org',
    featurePermissions: [],
  }),
}));
vi.mock('@/hooks/useAssignmentPseudonyms', () => ({
  useAssignmentPseudonymsMulti: () => ({ byStudentUid: new Map() }),
  formatStudentName: () => undefined,
}));
vi.mock('@/hooks/useLtiSessionNames', () => ({
  useLtiSessionNames: () => new Map(),
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
    accessMode: 'assessment',
    periodAccess: {
      'cl-1': period({ label: 'P1' }),
      'cl-3': period({ label: 'P3', state: 'open' }),
    },
    ...over,
  }) as VideoActivitySession;

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

const renderMonitor = (
  s: VideoActivitySession,
  responses: VideoActivityResponse[] = []
) =>
  render(
    <VideoActivityLiveMonitor
      session={s}
      responses={responses}
      onEnd={vi.fn()}
      onPause={vi.fn()}
      onResume={vi.fn()}
    />
  );

describe('VideoActivityLiveMonitor — per-period access', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows a chip per period and Start/Pause all in place of Pause', () => {
    renderMonitor(session());
    expect(
      screen.getByRole('button', { name: /Start P1, now Closed/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Pause P3, now Live/ })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start all' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
  });

  it('lets a student waiting in a closed period in, and only them', async () => {
    renderMonitor(session(), [
      response({ studentUid: 'u1', pin: '1111', classId: 'cl-1' }),
      response({ studentUid: 'u3', pin: '3333', classId: 'cl-3' }),
    ]);
    const buttons = screen.getAllByRole('button', { name: /^Let .* in now$/ });
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]);
    await waitFor(() => expect(updateDoc).toHaveBeenCalledTimes(1));
    const [ref, path] = (updateDoc as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0] as [string, { segments: string[] }];
    expect(ref).toBe('video_activity_sessions/s1');
    expect(path.segments).toEqual(['studentAccess', 'u1']);
  });

  it('keeps the single Pause button on a legacy session', () => {
    renderMonitor(session({ periodAccess: undefined, accessMode: undefined }));
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Class periods' })).toBeNull();
  });
});
