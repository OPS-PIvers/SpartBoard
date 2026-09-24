// P5-1: the library lists building-set index entries; the full set is read only when opened.
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { GuidedLearningWidget } from '@/components/widgets/GuidedLearning/Widget';
import type {
  WidgetData,
  GuidedLearningBuildingSetIndex,
  GuidedLearningConfig,
  GuidedLearningSet,
} from '@/types';

vi.mock('@/config/firebase', () => ({
  db: {},
  functions: {},
  isAuthBypass: false,
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  updateDoc: vi.fn(() => Promise.resolve()),
  writeBatch: vi.fn(),
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));

const updateWidget = vi.fn();
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    updateWidget,
    addToast: vi.fn(),
    updateRoster: vi.fn(),
    rosters: [],
  }),
}));
vi.mock('@/hooks/useTeacherBellPeriods', () => ({
  useAssignPeriodAccess: () => undefined,
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'teacher-1' },
    isAdmin: false,
    getAssignmentMode: () => 'graded',
    canAccessFeature: () => false,
  }),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: vi.fn() }),
}));

const ENTRY: GuidedLearningBuildingSetIndex = {
  id: 'b-1',
  title: 'Cells',
  description: null,
  stepCount: 2,
  mode: 'guided',
  thumbnail: '',
  createdAt: 1,
  updatedAt: 5,
  hasLiveTour: false,
  isHelpCenter: false,
  folderId: null,
  order: null,
};

const FULL: GuidedLearningSet = {
  id: 'b-1',
  title: 'Cells',
  imageUrls: [],
  steps: [],
  mode: 'guided',
  createdAt: 1,
  updatedAt: 5,
  isBuilding: true,
};

const loadBuildingSet =
  vi.fn<(id: string) => Promise<GuidedLearningSet | null>>();
vi.mock('@/hooks/useGuidedLearning', () => ({
  loadBuildingSet: (id: string) => loadBuildingSet(id),
  useGuidedLearning: () => ({
    sets: [],
    buildingSets: [ENTRY],
    loading: false,
    buildingLoading: false,
    isDriveConnected: true,
    saveSet: vi.fn(),
    loadSetData: vi.fn(),
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
vi.mock('@/hooks/useGuidedLearningAssignments', () => ({
  useGuidedLearningAssignments: () => ({
    assignments: [],
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

type EntryHandler = (
  setId: string,
  driveFileId?: string,
  entry?: GuidedLearningBuildingSetIndex
) => void;

vi.mock(
  '@/components/widgets/GuidedLearning/components/GuidedLearningManager',
  () => ({
    GuidedLearningManager: (props: {
      buildingSets: GuidedLearningBuildingSetIndex[];
      onPrefetchSet: EntryHandler;
      onPlay: EntryHandler;
    }) => (
      <div>
        {props.buildingSets.map((entry) => (
          <div key={entry.id}>
            <span>{entry.title}</span>
            <button
              type="button"
              onClick={() => props.onPrefetchSet(entry.id, undefined, entry)}
            >
              Select
            </button>
            <button
              type="button"
              onClick={() => props.onPlay(entry.id, undefined, entry)}
            >
              Play
            </button>
          </div>
        ))}
      </div>
    ),
  })
);

const widget = {
  id: 'widget-1',
  type: 'guidedLearning',
  x: 0,
  y: 0,
  w: 400,
  h: 300,
  z: 1,
  config: { view: 'library' } as GuidedLearningConfig,
} as unknown as WidgetData;

beforeEach(() => {
  vi.clearAllMocks();
  loadBuildingSet.mockResolvedValue(FULL);
});

describe('GuidedLearningWidget building sets from the index', () => {
  it('lists building sets without reading any full set', async () => {
    render(<GuidedLearningWidget widget={widget} />);
    expect(await screen.findByText('Cells')).toBeInTheDocument();
    expect(loadBuildingSet).not.toHaveBeenCalled();
  });

  it('fetches the full set once across select and Play', async () => {
    render(<GuidedLearningWidget widget={widget} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Select' }));
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));

    await waitFor(() =>
      expect(updateWidget).toHaveBeenCalledWith(
        'widget-1',
        expect.objectContaining({
          config: expect.objectContaining({
            view: 'player',
            playerSetId: 'b-1',
          }),
        })
      )
    );
    expect(loadBuildingSet).toHaveBeenCalledTimes(1);
    expect(loadBuildingSet).toHaveBeenCalledWith('b-1');
  });
});
