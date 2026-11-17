import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DistrictLibraryItem } from '@/types/districtLibrary';

const moveDistrictItems = vi.fn<(...args: unknown[]) => Promise<void>>();
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: vi.fn().mockResolvedValue(true) }),
}));
vi.mock('@/hooks/useDistrictLibraryFolders', () => ({
  createDistrictFolder: vi.fn(),
  deleteDistrictFolder: vi.fn(),
  moveDistrictFolder: vi.fn(),
  moveDistrictItems: (...args: unknown[]) => moveDistrictItems(...args),
  renameDistrictFolder: vi.fn(),
  saveDistrictFolderAudience: vi.fn(),
  setDistrictItemFollowsFolder: vi.fn(),
}));
vi.mock('@/hooks/useDistrictLibraryAdmin', () => ({
  saveDistrictLibraryTargeting: vi.fn(),
}));

const { DistrictLibraryFolderView } =
  await import('@/components/admin/DistrictLibrary/DistrictLibraryFolderView');

const item = (id: string, folderId?: string) =>
  ({
    id,
    kind: 'bank',
    title: `Bank ${id}`,
    questionCount: 4,
    status: 'published',
    everyone: false,
    targetBuildings: [],
    targetGrades: [],
    targetEmails: [],
    gradeBuildings: [],
    syncGroupId: id,
    contentVersion: 1,
    createdAt: 0,
    updatedAt: 0,
    updatedBy: 'admin',
    folderId,
  }) as DistrictLibraryItem;

const folders = {
  sci: { name: '8th Grade Science', parentId: null, order: 0 },
};

const renderView = (items: DistrictLibraryItem[], f = folders) =>
  render(
    <DistrictLibraryFolderView
      uid="admin"
      items={items}
      folders={f}
      audiences={{}}
      buildings={[]}
      buildingName={(id) => id}
      place="all"
      onPlaceChange={vi.fn()}
      isBusy={() => false}
      replaceDisabled={false}
      onTogglePublished={vi.fn()}
      onReplace={vi.fn()}
      onRemove={vi.fn()}
      onError={vi.fn()}
    />
  );

const list = () => screen.getAllByRole('list')[0];

describe('DistrictLibraryFolderView top level', () => {
  beforeEach(() => {
    moveDistrictItems.mockReset();
    moveDistrictItems.mockResolvedValue(undefined);
  });

  it('shows folders and only unfiled items when folders exist', () => {
    renderView([item('a'), item('b'), item('c', 'sci')]);
    const rows = within(list());
    expect(rows.getByText('8th Grade Science')).toBeInTheDocument();
    expect(rows.getByText('Bank a')).toBeInTheDocument();
    expect(rows.getByText('Bank b')).toBeInTheDocument();
    expect(rows.queryByText('Bank c')).not.toBeInTheDocument();
  });

  it('lists every item when there are no folders', () => {
    renderView([item('a'), item('b')], {});
    expect(within(list()).getAllByText(/^Bank /)).toHaveLength(2);
  });

  it('labels the row audience button Access', () => {
    renderView([item('a')]);
    expect(screen.getByRole('button', { name: 'Access' })).toBeInTheDocument();
    expect(screen.queryByText('Who sees it')).not.toBeInTheDocument();
  });

  it('moves every selected item to a folder at once', async () => {
    const user = userEvent.setup();
    renderView([item('a'), item('b'), item('c', 'sci')]);
    await user.click(screen.getByRole('button', { name: 'Select' }));
    await user.click(screen.getByRole('button', { name: 'Select all' }));
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Move$/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Move 2 items to…')).toBeInTheDocument();
    await user.click(within(dialog).getByText('8th Grade Science'));
    expect(moveDistrictItems).toHaveBeenCalledWith(
      ['a', 'b'],
      'sci',
      expect.anything()
    );
  });
});
