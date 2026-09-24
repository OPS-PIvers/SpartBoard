// P6-7: a library-launched AI draft lands in the library being viewed.
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { GuidedLearningWidget } from '@/components/widgets/GuidedLearning/Widget';
import type {
  WidgetData,
  GuidedLearningConfig,
  GuidedLearningSet,
} from '@/types';
import type { GuidedLearningMediaHome } from '@/hooks/useStorage';

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
    isAdmin: true,
    getAssignmentMode: () => 'graded',
    canAccessFeature: (id: string) =>
      id === 'gl-studio' || id === 'gemini-functions',
  }),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: vi.fn() }),
}));

vi.mock('@/hooks/useGuidedLearning', () => ({
  loadBuildingSet: vi.fn(),
  useGuidedLearning: () => ({
    sets: [],
    buildingSets: [],
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

vi.mock(
  '@/components/widgets/GuidedLearning/components/GuidedLearningManager',
  () => ({
    GuidedLearningManager: (props: {
      onOpenAIAuthoring: (library: 'personal' | 'building') => void;
    }) => (
      <div>
        <button
          type="button"
          onClick={() => props.onOpenAIAuthoring('personal')}
        >
          AI personal
        </button>
        <button
          type="button"
          onClick={() => props.onOpenAIAuthoring('building')}
        >
          AI building
        </button>
      </div>
    ),
  })
);

const generatorHomes: GuidedLearningMediaHome[] = [];
// Mirrors the generator's contract: a Storage draft is a building set.
vi.mock(
  '@/components/widgets/GuidedLearning/components/GuidedLearningAIGenerator',
  () => ({
    GuidedLearningAIGenerator: (props: {
      mediaHome: GuidedLearningMediaHome;
      onGenerated: (set: GuidedLearningSet) => void;
    }) => {
      generatorHomes.push(props.mediaHome);
      return (
        <button
          type="button"
          onClick={() =>
            props.onGenerated({
              id: 'drafted',
              title: 'Drafted',
              imageUrls: ['https://example/a.webp'],
              steps: [],
              mode: 'structured',
              createdAt: 1,
              updatedAt: 1,
              ...(props.mediaHome === 'storage' ? { isBuilding: true } : {}),
            })
          }
        >
          Generate
        </button>
      );
    },
  })
);

const studioSets: GuidedLearningSet[] = [];
vi.mock(
  '@/components/widgets/GuidedLearning/components/studio/GuidedLearningStudio',
  () => ({
    GuidedLearningStudio: (props: { set: GuidedLearningSet }) => {
      studioSets.push(props.set);
      return <div>Studio open</div>;
    },
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
  generatorHomes.length = 0;
  studioSets.length = 0;
});

describe('GuidedLearningWidget AI from the library', () => {
  it('drafts a personal set on Drive from the personal library', async () => {
    render(<GuidedLearningWidget widget={widget} />);
    fireEvent.click(await screen.findByRole('button', { name: 'AI personal' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Generate' }));
    expect(await screen.findByText('Studio open')).toBeInTheDocument();
    expect(generatorHomes.at(-1)).toBe('drive');
    await waitFor(() => expect(studioSets.at(-1)?.id).toBe('drafted'));
    expect(studioSets.at(-1)?.isBuilding).toBeFalsy();
  });

  it('drafts a building set on Storage from the building library', async () => {
    render(<GuidedLearningWidget widget={widget} />);
    fireEvent.click(await screen.findByRole('button', { name: 'AI building' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Generate' }));
    expect(await screen.findByText('Studio open')).toBeInTheDocument();
    expect(generatorHomes.at(-1)).toBe('storage');
    expect(studioSets.at(-1)?.isBuilding).toBe(true);
  });
});
