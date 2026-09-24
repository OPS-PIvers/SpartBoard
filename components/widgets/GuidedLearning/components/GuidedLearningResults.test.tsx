import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { GuidedLearningResponse, GuidedLearningSet } from '@/types';

const getDocMock = vi.fn();
let mockResponses: GuidedLearningResponse[] = [];
const subscribeToResponses = vi.fn(() => () => undefined);
const viewCountMock = vi.fn((..._args: unknown[]) => ({
  count: 7,
  loading: false,
}));

vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  doc: () => ({}),
  getDoc: () => getDocMock() as unknown,
}));
vi.mock('@/hooks/useGuidedLearningSession', () => ({
  useGuidedLearningSessionTeacher: () => ({
    responses: mockResponses,
    responsesLoading: false,
    subscribeToResponses,
    exportResponsesAsCSV: () => '',
  }),
  isAnswerCorrect: () => false,
}));
vi.mock('@/hooks/useAssignmentPseudonyms', () => ({
  useAssignmentPseudonymsMulti: () => ({ byStudentUid: new Map() }),
  formatStudentName: () => '',
}));
vi.mock('@/hooks/useSessionViewCount', () => ({
  useSessionViewCount: (...args: unknown[]) => viewCountMock(...args),
}));
vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ orgId: null }) }));
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: vi.fn() }),
}));
vi.mock('./results/GuidedLearningEngagement', () => ({
  GuidedLearningEngagement: () => <div>ENGAGEMENT</div>,
}));

import { GuidedLearningResults } from './GuidedLearningResults';

const set = {
  id: 'set1',
  title: 'Log in',
  mode: 'guided',
  imageUrls: ['https://example.com/a.png'],
  steps: [],
} as unknown as GuidedLearningSet;

const session = (data: Record<string, unknown>) =>
  getDocMock.mockResolvedValue({ data: () => data });

beforeEach(() => {
  getDocMock.mockReset();
  subscribeToResponses.mockClear();
  viewCountMock.mockClear();
  mockResponses = [];
});

describe('GuidedLearningResults engagement gating', () => {
  it('leaves Engagement out of sessions without Player v2', async () => {
    session({ classIds: [] });
    render(
      <GuidedLearningResults set={set} sessionId="s1" onClose={vi.fn()} />
    );
    expect(await screen.findByText(/No responses yet/)).toBeInTheDocument();
    await Promise.resolve();
    expect(screen.queryByText('ENGAGEMENT')).not.toBeInTheDocument();
  });

  it('adds Engagement to Player v2 submissions sessions', async () => {
    session({ playerV2: true });
    render(
      <GuidedLearningResults set={set} sessionId="s1" onClose={vi.fn()} />
    );
    expect(await screen.findByText('ENGAGEMENT')).toBeInTheDocument();
    expect(screen.getByText('CSV')).toBeInTheDocument();
  });

  it('keeps the old notice for view-only sessions without Player v2', async () => {
    session({});
    render(
      <GuidedLearningResults
        set={set}
        sessionId="s1"
        onClose={vi.fn()}
        viewOnly
        viewOnlyFallback={<p>NOTICE</p>}
      />
    );
    expect(await screen.findByText('NOTICE')).toBeInTheDocument();
    expect(subscribeToResponses).not.toHaveBeenCalled();
    expect(viewCountMock).toHaveBeenLastCalledWith(
      'guided_learning_sessions',
      's1',
      false
    );
  });

  it('shows views and Engagement for Player v2 view-only sessions', async () => {
    session({ playerV2: true });
    render(
      <GuidedLearningResults
        set={set}
        sessionId="s1"
        onClose={vi.fn()}
        viewOnly
        viewOnlyFallback={<p>NOTICE</p>}
      />
    );
    expect(await screen.findByText('ENGAGEMENT')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.queryByText('NOTICE')).not.toBeInTheDocument();
    expect(screen.queryByText('CSV')).not.toBeInTheDocument();
    expect(screen.queryByText(/No responses yet/)).not.toBeInTheDocument();
  });
});

describe('GuidedLearningResults — who started the run', () => {
  it('names the substitute who launched it', async () => {
    session({
      createdAt: Date.UTC(2026, 8, 23, 14, 0, 0),
      launchedBy: {
        uid: 'sub-1',
        email: 'sub@orono.k12.mn.us',
        shareId: 'share-1',
      },
    });
    render(
      <GuidedLearningResults set={set} sessionId="s1" onClose={vi.fn()} />
    );

    expect(await screen.findByTestId('launched-by-sub')).toHaveTextContent(
      /Launched by sub@orono\.k12\.mn\.us/
    );
  });

  it('says nothing on a run the teacher started', async () => {
    session({ classIds: [] });
    render(
      <GuidedLearningResults set={set} sessionId="s1" onClose={vi.fn()} />
    );

    expect(await screen.findByText(/No responses yet/)).toBeInTheDocument();
    expect(screen.queryByTestId('launched-by-sub')).not.toBeInTheDocument();
  });
});

describe('GuidedLearningResults — saved but not submitted', () => {
  it('lists a student whose answers are saved without a submit as In progress', async () => {
    session({ classIds: [] });
    const base = {
      sessionId: 's1',
      answers: [],
      startedAt: 1,
      score: null,
    };
    mockResponses = [
      { ...base, studentAnonymousId: 'u1', pin: '11', completedAt: null },
      { ...base, studentAnonymousId: 'u2', pin: '22', completedAt: 5 },
    ];
    render(
      <GuidedLearningResults set={set} sessionId="s1" onClose={vi.fn()} />
    );
    const inProgress = await screen.findByText('In progress');
    expect(inProgress.parentElement).toHaveTextContent('PIN: 11');
    expect(screen.getByText('Completed').parentElement).toHaveTextContent(
      'PIN: 22'
    );
  });
});
