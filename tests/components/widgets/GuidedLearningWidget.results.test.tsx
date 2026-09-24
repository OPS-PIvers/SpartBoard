import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { GuidedLearningWidget } from '@/components/widgets/GuidedLearning/Widget';
import type {
  WidgetData,
  GuidedLearningSetMetadata,
  GuidedLearningConfig,
  GuidedLearningAssignment,
  GuidedLearningSet,
} from '@/types';

vi.mock('@/config/firebase', () => ({
  db: { __mock: 'db' },
  functions: { __mock: 'functions' },
  isAuthBypass: false,
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  updateDoc: vi.fn(() => Promise.resolve()),
  writeBatch: vi.fn(),
}));

vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));

const addToast = vi.fn();
const updateWidget = vi.fn();
vi.mock('@/hooks/useTeacherBellPeriods', () => ({
  useAssignPeriodAccess: () => undefined,
}));
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    updateWidget,
    addToast,
    updateRoster: vi.fn(),
    rosters: [],
  }),
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'teacher-1', displayName: 'Test Teacher' },
    isAdmin: false,
    getAssignmentMode: () => 'graded',
    canAccessFeature: () => false,
  }),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: vi.fn() }),
}));

const SET_META = {
  id: 'gl-1',
  title: 'Fractions Warmup',
  driveFileId: 'drive-1',
  createdAt: 1000,
  updatedAt: 2000,
} as unknown as GuidedLearningSetMetadata;

const loadSetData = vi.fn(
  (): Promise<GuidedLearningSet> =>
    Promise.resolve({
      id: 'gl-1',
      title: 'Fractions Warmup',
      imageUrls: [],
      steps: [],
      mode: 'structured',
      createdAt: 1000,
      updatedAt: 2000,
    } as unknown as GuidedLearningSet)
);
vi.mock('@/hooks/useGuidedLearning', () => ({
  useGuidedLearning: () => ({
    sets: [SET_META],
    buildingSets: [],
    loading: false,
    buildingLoading: false,
    isDriveConnected: true,
    saveSet: vi.fn(),
    loadSetData,
    deleteSet: vi.fn(),
    duplicateSet: vi.fn(),
    saveBuildingSet: vi.fn(),
    deleteBuildingSet: vi.fn(),
    duplicateBuildingSet: vi.fn(),
  }),
}));

vi.mock('@/hooks/useGuidedLearningSession', () => ({
  useGuidedLearningSessionTeacher: () => ({ createSession: vi.fn() }),
}));

const assignment = (sessionId: string, setId: string) =>
  ({
    id: sessionId,
    sessionId,
    setId,
    setTitle: 'Set',
    teacherUid: 'teacher-1',
    status: 'active',
    createdAt: 1,
    updatedAt: 1,
  }) as GuidedLearningAssignment;
const ASSIGNMENTS = [
  assignment('sess-1', 'gl-1'),
  assignment('sess-gone', 'gl-deleted'),
];
vi.mock('@/hooks/useGuidedLearningAssignments', () => ({
  useGuidedLearningAssignments: () => ({
    assignments: ASSIGNMENTS,
    loading: false,
    createAssignment: vi.fn(),
    archiveAssignment: vi.fn(),
    unarchiveAssignment: vi.fn(),
    deleteAssignment: vi.fn(),
    publishAssignmentScores: vi.fn(),
    unpublishAssignmentScores: vi.fn(),
  }),
}));

vi.mock('@/hooks/useFolders', () => ({
  useFolders: () => ({ folders: [], moveItem: vi.fn() }),
}));

vi.mock(
  '@/components/widgets/GuidedLearning/components/GuidedLearningManager',
  () => ({
    GuidedLearningManager: (props: {
      onPlay: (setId: string, driveFileId?: string) => void;
      onAssignmentOpenResults: (a: GuidedLearningAssignment) => void;
    }) => (
      <>
        <button type="button" onClick={() => props.onPlay('gl-1', 'drive-1')}>
          Play
        </button>
        <button
          type="button"
          onClick={() => props.onAssignmentOpenResults(ASSIGNMENTS[1])}
        >
          Open deleted results
        </button>
      </>
    ),
  })
);

vi.mock(
  '@/components/widgets/GuidedLearning/components/GuidedLearningPlayer',
  () => ({ GuidedLearningPlayer: () => <div>Player</div> })
);

vi.mock(
  '@/components/widgets/GuidedLearning/components/GuidedLearningResults',
  () => ({
    GuidedLearningResults: (props: {
      set: GuidedLearningSet;
      sessionId: string;
    }) => (
      <div data-testid="results">
        {props.set.id}:{props.sessionId}
      </div>
    ),
  })
);

function makeWidget(config: Partial<GuidedLearningConfig>): WidgetData {
  return {
    id: 'widget-1',
    type: 'guidedLearning',
    x: 0,
    y: 0,
    w: 400,
    h: 300,
    z: 1,
    config: { view: 'library', ...config } as GuidedLearningConfig,
  } as unknown as WidgetData;
}

const lastConfig = (): GuidedLearningConfig =>
  (updateWidget.mock.lastCall?.[1] as { config: GuidedLearningConfig }).config;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GuidedLearningWidget results view', () => {
  it('reloads the assigned set after a remount instead of rendering blank', async () => {
    render(
      <GuidedLearningWidget
        widget={makeWidget({ view: 'results', resultsSessionId: 'sess-1' })}
      />
    );
    expect(await screen.findByTestId('results')).toHaveTextContent(
      'gl-1:sess-1'
    );
    expect(loadSetData).toHaveBeenCalledWith('drive-1');
  });

  it('shows an error for a deleted set after a remount', async () => {
    render(
      <GuidedLearningWidget
        widget={makeWidget({ view: 'results', resultsSessionId: 'sess-gone' })}
      />
    );
    expect(
      await screen.findByText("Couldn't open these results")
    ).toBeInTheDocument();
    expect(screen.queryByTestId('results')).not.toBeInTheDocument();
  });

  it('does not score a deleted set against the last-played set', async () => {
    const { rerender } = render(
      <GuidedLearningWidget widget={makeWidget({})} />
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Play' }));
    await waitFor(() => expect(lastConfig().view).toBe('player'));
    rerender(<GuidedLearningWidget widget={makeWidget(lastConfig())} />);
    expect(await screen.findByText('Player')).toBeInTheDocument();

    rerender(<GuidedLearningWidget widget={makeWidget({})} />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Open deleted results' })
    );
    await waitFor(() => expect(lastConfig().view).toBe('results'));
    rerender(<GuidedLearningWidget widget={makeWidget(lastConfig())} />);

    expect(
      await screen.findByText("Couldn't open these results")
    ).toBeInTheDocument();
    expect(screen.queryByTestId('results')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to library' }));
    expect(lastConfig()).toMatchObject({
      view: 'library',
      resultsSessionId: null,
    });
  });
});
