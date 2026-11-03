import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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

  it('keeps the single Pause button on a legacy session', () => {
    renderMonitor(session({ periodAccess: undefined, accessMode: undefined }));
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Class periods' })).toBeNull();
  });
});
