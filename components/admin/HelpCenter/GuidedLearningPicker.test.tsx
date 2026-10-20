import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react';
import type { GuidedLearningSet } from '@/types';
import { GuidedLearningPicker } from './GuidedLearningPicker';

const glState = vi.hoisted(() => ({
  saveBuildingSet: vi.fn<(set: GuidedLearningSet) => Promise<void>>(() =>
    Promise.resolve()
  ),
  loadSetData: vi.fn<(driveFileId: string) => Promise<GuidedLearningSet>>(),
  loadBuildingSet: vi.fn<(id: string) => Promise<GuidedLearningSet | null>>(),
  deleteSet: vi.fn<
    (setId: string, driveFileId: string, openIds?: string[]) => Promise<void>
  >(() => Promise.resolve()),
  openAssignmentIdsForSet: vi.fn<
    (uid: string, setId: string) => Promise<string[]>
  >(() => Promise.resolve([])),
}));

vi.mock('@/utils/guidedLearningFileRelease', () => ({
  openAssignmentIdsForSet: glState.openAssignmentIdsForSet,
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'admin-1' },
    canAccessFeature: () => false,
  }),
}));

const set = (
  id: string,
  title: string,
  extra: Partial<GuidedLearningSet> = {}
): GuidedLearningSet => ({
  id,
  title,
  imageUrls: ['https://example.com/a.png'],
  steps: [],
  mode: 'structured',
  createdAt: 1,
  updatedAt: 1,
  isBuilding: true,
  ...extra,
});

const fullBuilding = [
  set('b-1', 'Building Lesson'),
  set('h-1', 'Help Guide', { helpCenter: true }),
  set('help-p-1', 'Older Roster Copy', { helpCenter: true, createdAt: 5 }),
];

// The hook hands out index entries; full sets come from loadBuildingSet.
vi.mock('@/hooks/useGuidedLearning', () => ({
  loadBuildingSet: glState.loadBuildingSet,
  useGuidedLearning: () => ({
    sets: [
      {
        id: 'p-1',
        title: 'My Roster Guide',
        stepCount: 2,
        mode: 'structured',
        driveFileId: 'drive-1',
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    buildingSets: fullBuilding.map((full) => ({
      id: full.id,
      title: full.title,
      createdAt: full.createdAt,
      isHelpCenter: full.helpCenter === true,
    })),
    buildingLoading: false,
    loadSetData: glState.loadSetData,
    saveBuildingSet: glState.saveBuildingSet,
    deleteSet: glState.deleteSet,
  }),
}));

vi.mock(
  '@/components/widgets/GuidedLearning/components/studio/GuidedLearningStudio',
  () => ({
    GuidedLearningStudio: ({
      set: editing,
      onSave,
      onClose,
    }: {
      set: GuidedLearningSet;
      onSave: (s: GuidedLearningSet) => Promise<void>;
      onClose: () => void;
    }) => (
      <div data-testid="studio">
        <span>{editing.title || 'untitled'}</span>
        <button
          type="button"
          onClick={() => void onSave({ ...editing, title: 'Saved Guide' })}
        >
          studio save
        </button>
        <button type="button" onClick={onClose}>
          studio close
        </button>
      </div>
    ),
  })
);

const renderPicker = (
  props: Partial<React.ComponentProps<typeof GuidedLearningPicker>> = {}
) => {
  const onSelect = vi.fn();
  const onEditingChange = vi.fn();
  render(
    <GuidedLearningPicker
      selectedSetId={null}
      newTitle=""
      onSelect={onSelect}
      onError={vi.fn()}
      onEditingChange={onEditingChange}
      mode={props.selectedSetId ? 'chosen' : 'choose'}
      onChange={vi.fn()}
      {...props}
    />
  );
  return { onSelect, onEditingChange };
};

describe('GuidedLearningPicker', () => {
  beforeEach(() => {
    glState.saveBuildingSet.mockReset();
    glState.saveBuildingSet.mockResolvedValue(undefined);
    glState.deleteSet.mockClear();
    glState.openAssignmentIdsForSet.mockReset();
    glState.openAssignmentIdsForSet.mockResolvedValue([]);
    glState.loadSetData.mockReset();
    glState.loadBuildingSet.mockReset();
    glState.loadBuildingSet.mockImplementation((id) =>
      Promise.resolve(fullBuilding.find((full) => full.id === id) ?? null)
    );
  });

  it('separates flagged Help Center activities from the building library', () => {
    renderPicker({ selectedSetId: 'b-1', mode: 'choose' });
    fireEvent.click(screen.getByRole('button', { name: 'Choose activity' }));
    const help = screen.getByRole('region', { name: 'Help Center' });
    const library = screen.getByRole('region', { name: 'Building library' });
    expect(within(help).getByText('Help Guide')).toBeTruthy();
    expect(within(library).getByText('Building Lesson')).toBeTruthy();
  });

  it('reuses the existing Help Center copy and removes the personal original', async () => {
    const { onSelect } = renderPicker();

    fireEvent.click(screen.getByRole('button', { name: 'Choose activity' }));
    fireEvent.click(screen.getByText('My Roster Guide'));

    await waitFor(() => expect(onSelect).toHaveBeenCalled());
    expect(glState.loadBuildingSet).toHaveBeenCalledWith('help-p-1');
    expect(glState.loadSetData).not.toHaveBeenCalled();
    expect(glState.saveBuildingSet).not.toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledWith('help-p-1', 'Older Roster Copy');
    await waitFor(() =>
      expect(glState.deleteSet).toHaveBeenCalledWith('p-1', 'drive-1', [])
    );
  });

  it('moves a personal activity into the Help Center the first time it is picked', async () => {
    glState.loadBuildingSet.mockResolvedValue(null);
    glState.loadSetData.mockResolvedValue(
      set('p-1', 'My Roster Guide', {
        isBuilding: undefined,
        folderId: 'f',
      } as Partial<GuidedLearningSet>)
    );
    const { onSelect } = renderPicker();

    fireEvent.click(screen.getByRole('button', { name: 'Choose activity' }));
    fireEvent.click(screen.getByText('My Roster Guide'));

    await waitFor(() => expect(onSelect).toHaveBeenCalled());
    const saved = glState.saveBuildingSet.mock.calls[0][0];
    expect(saved.id).toBe('help-p-1');
    expect(saved.helpCenter).toBe(true);
    expect(saved.isBuilding).toBe(true);
    expect(saved.authorUid).toBe('admin-1');
    expect(onSelect).toHaveBeenCalledWith(saved.id, 'My Roster Guide');
    await waitFor(() =>
      expect(glState.deleteSet).toHaveBeenCalledWith('p-1', 'drive-1', [])
    );
    expect(glState.openAssignmentIdsForSet).toHaveBeenCalledWith(
      'admin-1',
      'p-1'
    );
    // The original goes only after its copy is saved.
    expect(glState.saveBuildingSet.mock.invocationCallOrder[0]).toBeLessThan(
      glState.deleteSet.mock.invocationCallOrder[0]
    );
  });

  it('holds the files of a moved activity that still has open assignments', async () => {
    glState.openAssignmentIdsForSet.mockResolvedValue(['a-1']);
    renderPicker();

    fireEvent.click(screen.getByRole('button', { name: 'Choose activity' }));
    fireEvent.click(screen.getByText('My Roster Guide'));

    await waitFor(() =>
      expect(glState.deleteSet).toHaveBeenCalledWith('p-1', 'drive-1', ['a-1'])
    );
  });

  it('keeps the personal activity when its Help Center copy fails to save', async () => {
    glState.loadBuildingSet.mockResolvedValue(null);
    glState.loadSetData.mockResolvedValue(set('p-1', 'My Roster Guide'));
    glState.saveBuildingSet.mockRejectedValue(new Error('save failed'));
    const onError = vi.fn();
    const { onSelect } = renderPicker({ onError });

    fireEvent.click(screen.getByRole('button', { name: 'Choose activity' }));
    fireEvent.click(screen.getByText('My Roster Guide'));

    await waitFor(() => expect(onError).toHaveBeenCalledWith('save failed'));
    expect(onSelect).not.toHaveBeenCalled();
    expect(glState.deleteSet).not.toHaveBeenCalled();
  });

  it('creates a new Help Center activity and picks it on first save', async () => {
    const { onSelect, onEditingChange } = renderPicker({
      newTitle: 'Class rosters',
    });

    fireEvent.click(screen.getByRole('button', { name: 'New activity' }));
    expect(await screen.findByTestId('studio')).toBeTruthy();
    expect(screen.getByText('Class rosters')).toBeTruthy();
    expect(onEditingChange).toHaveBeenLastCalledWith(true);

    fireEvent.click(screen.getByText('studio save'));
    await waitFor(() => expect(onSelect).toHaveBeenCalled());
    const saved = glState.saveBuildingSet.mock.calls[0][0];
    expect(saved.helpCenter).toBe(true);
    expect(onSelect).toHaveBeenCalledWith(saved.id, 'Saved Guide');

    fireEvent.click(screen.getByText('studio close'));
    expect(screen.queryByTestId('studio')).toBeNull();
    expect(onEditingChange).toHaveBeenLastCalledWith(false);
  });

  it('edits a linked building library activity without moving it to Help', async () => {
    renderPicker({ selectedSetId: 'b-1' });

    fireEvent.click(screen.getByText('Open editor'));
    await screen.findByTestId('studio');
    fireEvent.click(screen.getByText('studio save'));

    await waitFor(() => expect(glState.saveBuildingSet).toHaveBeenCalled());
    expect(glState.saveBuildingSet.mock.calls[0][0].helpCenter).toBeUndefined();
    expect(glState.loadBuildingSet).toHaveBeenCalledWith('b-1');
  });

  it('reads no full set until an activity is opened for editing', () => {
    renderPicker({ selectedSetId: 'b-1' });
    expect(screen.getAllByText('Building Lesson').length).toBeGreaterThan(0);
    expect(glState.loadBuildingSet).not.toHaveBeenCalled();
  });

  it('opens the selected activity for editing', async () => {
    const { onSelect } = renderPicker({ selectedSetId: 'h-1' });

    fireEvent.click(screen.getByText('Open editor'));
    const studio = await screen.findByTestId('studio');
    expect(within(studio).getByText('Help Guide')).toBeTruthy();

    fireEvent.click(screen.getByText('studio save'));
    await waitFor(() => expect(glState.saveBuildingSet).toHaveBeenCalled());
    expect(onSelect).not.toHaveBeenCalled();
  });
});
