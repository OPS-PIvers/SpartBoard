import '@testing-library/jest-dom';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { VideoActivitySession } from '@/types';

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    ensureGoogleScope: vi.fn(),
    user: { uid: 'teacher-1' },
    orgId: null,
    canAccessFeature: () => false,
    isExternalUser: false,
  }),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: vi.fn() }),
}));
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: vi.fn() }),
}));
vi.mock('@/hooks/useAssignmentPseudonyms', () => ({
  useAssignmentPseudonymsMulti: () => ({ byStudentUid: new Map() }),
  formatStudentName: () => '',
}));
vi.mock('@/hooks/useLtiSessionNames', () => ({
  useLtiSessionNames: () => new Map(),
}));
vi.mock('@/hooks/useVideoActivityKeyQuestions', () => ({
  useVideoActivityKeyQuestions: () => ({ questions: [], loading: false }),
}));

import { Results } from './Results';

const session = (
  over: Partial<VideoActivitySession> = {}
): VideoActivitySession =>
  ({
    id: 's1',
    activityId: 'va-1',
    activityTitle: 'Photosynthesis',
    assignmentName: 'Period 5',
    teacherUid: 'teacher-1',
    youtubeUrl: 'https://youtu.be/abc',
    questions: [],
    status: 'active',
    allowedPins: [],
    createdAt: Date.UTC(2026, 8, 23, 14, 0, 0),
    ...over,
  }) as VideoActivitySession;

const show = (over: Partial<VideoActivitySession> = {}) =>
  render(<Results session={session(over)} responses={[]} onBack={vi.fn()} />);

describe('Video activity Results — who started the run', () => {
  it('names the substitute who launched it', () => {
    show({
      launchedBy: {
        uid: 'sub-1',
        email: 'sub@orono.k12.mn.us',
        shareId: 'share-1',
      },
    });

    expect(screen.getByTestId('launched-by-sub')).toHaveTextContent(
      /Launched by sub@orono\.k12\.mn\.us/
    );
  });

  it('says nothing on a run the teacher started', () => {
    show();
    expect(screen.queryByTestId('launched-by-sub')).not.toBeInTheDocument();
  });
});
