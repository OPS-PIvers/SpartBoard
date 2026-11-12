// The GL widget moves sets into the Help Center and finishes tagged moves when the library loads.
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

import { GuidedLearningWidget } from '@/components/widgets/GuidedLearning/Widget';
import type { GuidedLearningManagerProps } from '@/components/widgets/GuidedLearning/components/GuidedLearningManager';
import { HELP_CENTER_OPEN_EVENT } from '@/components/tours/tourState';
import { TOUR_EDIT_EVENT } from '@/components/tours/editor/tourEditStore';
import { takeFiledHelpItem } from '@/components/tours/helpCenterReturn';
import type {
  WidgetData,
  GuidedLearningBuildingSetIndex,
  GuidedLearningSetMetadata,
  GuidedLearningConfig,
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

vi.mock('@/hooks/useTeacherBellPeriods', () => ({
  useAssignPeriodAccess: () => undefined,
}));

const addToast = vi.fn();
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    updateWidget: vi.fn(),
    addToast,
    updateRoster: vi.fn(),
    rosters: [],
  }),
}));

const auth = vi.hoisted(() => ({ isAdmin: true }));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'admin-1', email: 'admin@school.org' },
    isAdmin: auth.isAdmin,
    orgId: 'org-1',
    roleId: 'domain_admin',
    userRoles: { superAdmins: [] },
    getAssignmentMode: () => 'graded',
    canAccessFeature: () => false,
  }),
}));

vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: vi.fn() }),
}));

const helpItems = vi.hoisted(() => ({
  moveSetToHelpCenter: vi.fn(),
  finishPendingMove: vi.fn(),
  createHiddenHelpItem: vi.fn(),
}));
vi.mock('@/utils/helpCenterItems', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/utils/helpCenterItems')>();
  return { ...actual, ...helpItems };
});

const sets = vi.hoisted(() => ({ list: [] as GuidedLearningSetMetadata[] }));
const deleteSet = vi.fn().mockResolvedValue(undefined);
const loadSetData = vi.fn();
const glHook = vi.hoisted(() => ({
  loadBuildingSet: vi.fn(),
  saveBuildingSet: vi.fn(),
}));
vi.mock('@/hooks/useGuidedLearning', () => ({
  loadBuildingSet: glHook.loadBuildingSet,
  useGuidedLearning: () => ({
    sets: sets.list,
    buildingSets: [],
    loading: false,
    buildingLoading: false,
    isDriveConnected: true,
    saveSet: vi.fn(),
    loadSetData,
    deleteSet,
    duplicateSet: vi.fn(),
    saveBuildingSet: glHook.saveBuildingSet,
    deleteBuildingSet: vi.fn(),
    watchSetRevision: () => () => () => undefined,
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

const captured: { props?: GuidedLearningManagerProps } = {};
vi.mock(
  '@/components/widgets/GuidedLearning/components/GuidedLearningManager',
  () => ({
    GuidedLearningManager: (props: GuidedLearningManagerProps) => {
      captured.props = props;
      return null;
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

const meta = (
  id: string,
  extra: Partial<GuidedLearningSetMetadata> = {}
): GuidedLearningSetMetadata => ({
  id,
  title: id,
  stepCount: 1,
  mode: 'guided',
  imageUrl: '',
  driveFileId: `drive-${id}`,
  createdAt: 1,
  updatedAt: 2,
  ...extra,
});

const item = { id: 'item-9' };

describe('GuidedLearningWidget Help Center moves', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captured.props = undefined;
    auth.isAdmin = true;
    sets.list = [meta('own')];
    helpItems.moveSetToHelpCenter.mockResolvedValue({
      item,
      setId: 'help-own',
      original: 'removed',
    });
    helpItems.finishPendingMove.mockResolvedValue('removed');
  });

  it('moves a personal set as its author and offers Open in Help Center', async () => {
    const opened = vi.fn();
    window.addEventListener(HELP_CENTER_OPEN_EVENT, opened);
    render(<GuidedLearningWidget widget={widget} />);
    await waitFor(() => expect(captured.props).toBeDefined());
    await captured.props?.onMoveToHelpCenter?.('own', 'drive-own');

    await waitFor(() => expect(addToast).toHaveBeenCalled());
    const [source, author] = helpItems.moveSetToHelpCenter.mock.calls[0];
    expect(source).toEqual({
      kind: 'personal',
      set: expect.objectContaining({ id: 'own' }),
    });
    expect(author).toEqual({
      uid: 'admin-1',
      email: 'admin@school.org',
      orgId: 'org-1',
      isSuperAdmin: false,
    });
    const [message, type, action] = addToast.mock.calls[0] as [
      string,
      string,
      { label: string; onClick: () => void },
    ];
    expect(message).toBe('Moved to Help Center.');
    expect(type).toBe('success');
    expect(action.label).toBe('Open in Help Center');
    action.onClick();
    expect((opened.mock.calls[0][0] as CustomEvent).detail).toEqual({
      selectId: 'item-9',
    });
    window.removeEventListener(HELP_CENTER_OPEN_EVENT, opened);
  });

  it('moves a building set by its index entry', async () => {
    helpItems.moveSetToHelpCenter.mockResolvedValue({
      item,
      setId: 'b-1',
      original: 'flagged',
    });
    render(<GuidedLearningWidget widget={widget} />);
    await waitFor(() => expect(captured.props).toBeDefined());
    const entry = { id: 'b-1', title: 'B' } as GuidedLearningBuildingSetIndex;
    await captured.props?.onMoveToHelpCenter?.('b-1', undefined, entry);
    await waitFor(() =>
      expect(helpItems.moveSetToHelpCenter).toHaveBeenCalledWith(
        { kind: 'building', set: entry },
        expect.anything(),
        expect.anything()
      )
    );
  });

  it('gives teachers no move', async () => {
    auth.isAdmin = false;
    render(<GuidedLearningWidget widget={widget} />);
    await waitFor(() => expect(captured.props).toBeDefined());
    expect(captured.props?.onMoveToHelpCenter).toBeUndefined();
  });

  it('finishes each tagged move once when the library loads', async () => {
    sets.list = [
      meta('own'),
      meta('tagged', { movedToHelpCenterAt: 5 }),
      meta('edited', { movedToHelpCenterAt: 5, updatedAt: 9 }),
    ];
    const { rerender } = render(<GuidedLearningWidget widget={widget} />);
    await waitFor(() =>
      expect(helpItems.finishPendingMove).toHaveBeenCalledTimes(1)
    );
    const [uid, finished, remove] = helpItems.finishPendingMove.mock
      .calls[0] as [
      string,
      { id: string },
      (id: string, driveFileId: string) => Promise<void>,
    ];
    expect(uid).toBe('admin-1');
    expect(finished.id).toBe('tagged');
    await remove('tagged', 'drive-tagged');
    expect(deleteSet).toHaveBeenCalledWith('tagged', 'drive-tagged', []);

    sets.list = [...sets.list];
    rerender(<GuidedLearningWidget widget={widget} />);
    await waitFor(() => expect(captured.props).toBeDefined());
    expect(helpItems.finishPendingMove).toHaveBeenCalledTimes(1);
  });

  it('files a converted Live tour Hidden in the Help Center and keeps it out of the library', async () => {
    glHook.loadBuildingSet.mockResolvedValue({
      id: 'b-1',
      title: 'Seating chart guide',
      imageUrls: [],
      steps: [],
      mode: 'structured',
      createdAt: 1,
      updatedAt: 1,
    });
    glHook.saveBuildingSet.mockResolvedValue(undefined);
    helpItems.createHiddenHelpItem.mockResolvedValue({ ...item, id: 'item-t' });
    const edits = vi.fn();
    window.addEventListener(TOUR_EDIT_EVENT, edits);
    render(<GuidedLearningWidget widget={widget} />);
    await waitFor(() => expect(captured.props).toBeDefined());
    void captured.props?.onConvertToLiveTour?.('b-1', undefined, {
      id: 'b-1',
      updatedAt: 1,
    } as GuidedLearningBuildingSetIndex);
    await waitFor(() => expect(edits).toHaveBeenCalled());
    window.removeEventListener(TOUR_EDIT_EVENT, edits);
    const [saved] = glHook.saveBuildingSet.mock.calls[0] as [
      { id: string; helpCenter?: boolean; mode: string },
    ];
    expect(saved.helpCenter).toBe(true);
    expect(saved.mode).toBe('tour');
    expect(helpItems.createHiddenHelpItem).toHaveBeenCalledWith(
      saved,
      expect.objectContaining({ uid: 'admin-1', orgId: 'org-1' })
    );
    expect((edits.mock.calls[0][0] as CustomEvent).detail).toEqual({
      setId: saved.id,
      origin: 'widget',
    });
    expect(takeFiledHelpItem(saved.id)).toBe('item-t');
  });
});
