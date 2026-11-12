import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
  within,
} from '@testing-library/react';
import type { GuidedLearningSet } from '@/types';
import type { HelpResourceItem } from '@/types/helpCenter';

const firestoreMocks = vi.hoisted(() => ({
  updateDoc: vi.fn(() => Promise.resolve(undefined)),
  deleteDoc: vi.fn(() => Promise.resolve(undefined)),
  setDoc: vi.fn<(ref: unknown, data: Record<string, unknown>) => Promise<void>>(
    () => Promise.resolve(undefined)
  ),
  getDoc: vi.fn(() => Promise.resolve({ exists: () => true })),
  batchUpdate:
    vi.fn<(ref: { id: string }, data: Record<string, unknown>) => void>(),
  batchSet:
    vi.fn<(ref: { id: string }, data: Record<string, unknown>) => void>(),
  batchDelete: vi.fn<(ref: { id: string }) => void>(),
  batchCommit: vi.fn(() => Promise.resolve(undefined)),
}));

const authState = vi.hoisted(() => ({
  value: {
    user: { uid: 'u1', email: 'super@school.org' },
    userRoles: { superAdmins: ['super@school.org'] },
    orgId: null as string | null,
    roleId: null as string | null,
  },
}));

const helpState = vi.hoisted(() => ({
  items: [] as HelpResourceItem[],
  categories: [
    { id: 'getting-started', name: 'Getting started', order: 0 },
    { id: 'admin', name: 'Admin', order: 1 },
  ] as { id: string; name: string; order: number }[],
}));

const glState = vi.hoisted(() => ({
  tourSetIds: new Set<string>(),
  sets: new Map<string, unknown>(),
  personal: [] as {
    id: string;
    title: string;
    mode: string;
    driveFileId: string;
    updatedAt: number;
  }[],
  saveSet: vi.fn(() => Promise.resolve({})),
  saveBuildingSet: vi.fn(() => Promise.resolve()),
  loadSetData: vi.fn(),
  deleteSet: vi.fn(() => Promise.resolve()),
}));

const itemMocks = vi.hoisted(() => ({
  publishHelpItem: vi.fn(() => Promise.resolve({ ok: true })),
  hideHelpItem: vi.fn(() => Promise.resolve()),
  moveSetToHelpCenter: vi.fn(),
  createHiddenHelpItem: vi.fn(),
  copyHelpItemToLibrary: vi.fn(() => Promise.resolve({})),
}));

const tourMocks = vi.hoisted(() => ({
  requestRecordTour: vi.fn(),
  requestEditTour: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  updateDoc: firestoreMocks.updateDoc,
  deleteDoc: firestoreMocks.deleteDoc,
  setDoc: firestoreMocks.setDoc,
  getDoc: firestoreMocks.getDoc,
  doc: (_db: unknown, ...path: string[]) =>
    path.length > 0
      ? { id: path[path.length - 1], path: path.join('/') }
      : { id: 'new-id', path: 'help_resources/new-id' },
  collection: (_db: unknown, name: string) => ({ name }),
  writeBatch: () => ({
    update: firestoreMocks.batchUpdate,
    set: firestoreMocks.batchSet,
    delete: firestoreMocks.batchDelete,
    commit: firestoreMocks.batchCommit,
  }),
}));

vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: false }));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    isAdmin: true,
    canAccessFeature: () => true,
    canAccessWidget: () => true,
    ...authState.value,
  }),
}));

vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: vi.fn(() => Promise.resolve(true)) }),
}));

vi.mock('@/hooks/useHelpResources', () => ({
  useHelpResources: () => ({
    items: helpState.items,
    categories: helpState.categories,
    loading: false,
    error: null,
  }),
}));

vi.mock('@/hooks/useOrganizations', () => ({
  useOrganizations: () => ({
    organizations: [{ id: 'orono', name: 'Orono', shortName: 'Orono' }],
  }),
}));

vi.mock('@/hooks/useOrganization', () => ({
  useOrganization: () => ({ organization: null }),
}));

vi.mock('@/hooks/useGuidedLearning', () => ({
  useGuidedLearning: () => ({
    sets: glState.personal,
    buildingSets: [],
    loading: false,
    buildingLoading: false,
    loadSetData: glState.loadSetData,
    deleteSet: glState.deleteSet,
    saveSet: glState.saveSet,
    saveBuildingSet: glState.saveBuildingSet,
  }),
  useLiveTourSetIds: () => glState.tourSetIds,
  loadBuildingSet: (id: string) =>
    Promise.resolve(glState.sets.get(id) ?? null),
}));

vi.mock('./useHelpItemSets', () => ({
  useHelpItemSets: () => glState.sets,
}));

vi.mock('@/utils/helpCenterItems', () => ({
  ...itemMocks,
  publishRefusalOf: (
    item: { categoryId: string },
    set: unknown
  ): string | null =>
    item.categoryId === '' ? 'unfiled' : set ? null : 'missing-set',
  helpCopyIdFor: (id: string) => `help-${id}`,
  isPendingHelpCenterMove: () => false,
}));

vi.mock('@/components/tours/tourState', () => ({
  requestRecordTour: tourMocks.requestRecordTour,
}));

vi.mock('@/components/tours/editor/tourEditStore', () => ({
  requestEditTour: tourMocks.requestEditTour,
}));

vi.mock('@/components/tours/TourStepList', () => ({
  TourStepList: () => <div data-testid="tour-step-list" />,
}));

vi.mock('./TourHealthPanel', () => ({
  default: ({ setId }: { setId: string }) => (
    <div data-testid="tour-health">{setId}</div>
  ),
}));

vi.mock('./UnmappedAnchorsSection', () => ({
  UnmappedAnchorsSection: () => <div data-testid="unmapped" />,
}));

vi.mock('./PictureGuideStudio', () => ({
  PictureGuideStudio: ({
    set,
    onSave,
  }: {
    set: GuidedLearningSet;
    onSave: (set: GuidedLearningSet) => Promise<void>;
  }) => (
    <button type="button" onClick={() => void onSave(set)}>
      studio save
    </button>
  ),
}));

import { HelpCenterManager } from './HelpCenterManager';
import {
  readHelpCenterSelection,
  writeHelpCenterSelection,
} from './helpCenterSelection';

const makeItem = (over: Partial<HelpResourceItem>): HelpResourceItem => ({
  id: 'i1',
  kind: 'guided-learning',
  title: 'Item',
  description: '',
  categoryId: 'getting-started',
  order: 0,
  visible: false,
  orgId: null,
  widgetTypes: [],
  url: null,
  embedType: null,
  setId: 's1',
  openCount: 0,
  createdBy: 'u1',
  createdByEmail: 'super@school.org',
  createdAt: 0,
  updatedAt: 0,
  ...over,
});

const pictureSet = (id: string) =>
  ({ id, title: 'Set', mode: 'structured', steps: [] }) as unknown;

const asOrgAdmin = () => {
  authState.value = {
    user: { uid: 'u2', email: 'admin@school.org' },
    userRoles: { superAdmins: ['super@school.org'] },
    orgId: 'orono',
    roleId: 'domain_admin',
  };
};

const selectRow = (title: string) =>
  fireEvent.click(
    screen.getByRole('button', { name: new RegExp(`^${title}`) })
  );

describe('HelpCenterManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writeHelpCenterSelection(null);
    authState.value = {
      user: { uid: 'u1', email: 'super@school.org' },
      userRoles: { superAdmins: ['super@school.org'] },
      orgId: null,
      roleId: null,
    };
    helpState.items = [];
    helpState.categories = [
      { id: 'getting-started', name: 'Getting started', order: 0 },
      { id: 'admin', name: 'Admin', order: 1 },
    ];
    glState.tourSetIds = new Set();
    glState.sets = new Map([['s1', pictureSet('s1')]]);
    glState.personal = [];
  });

  afterEach(() => cleanup());

  it('lists Unfiled first with a count, then each category', () => {
    helpState.items = [
      makeItem({ id: 'a', title: 'Filed', categoryId: 'admin' }),
      makeItem({ id: 'b', title: 'Loose one', categoryId: '' }),
      makeItem({ id: 'c', title: 'Loose two', categoryId: '' }),
    ];
    render(<HelpCenterManager />);
    const headings = screen.getAllByRole('heading', { level: 3 });
    expect(headings[0]).toHaveTextContent('Unfiled');
    expect(headings[0]).toHaveTextContent('2');
    expect(headings.map((h) => h.textContent)).toEqual([
      'Unfiled2',
      'Getting started0',
      'Admin1',
    ]);
  });

  it('shows kind and status on each row and marks one that needs attention', () => {
    glState.tourSetIds = new Set(['t1']);
    glState.sets.set('t1', pictureSet('t1'));
    helpState.items = [
      makeItem({ id: 'a', title: 'Tour', setId: 't1', visible: true }),
      makeItem({ id: 'b', title: 'Loose', categoryId: '' }),
    ];
    render(<HelpCenterManager />);
    const tour = screen.getByRole('button', { name: /^Tour/ });
    expect(tour).toHaveTextContent('Live tour · Published');
    expect(within(tour).queryByLabelText('Needs attention')).toBeNull();
    const loose = screen.getByRole('button', { name: /^Loose/ });
    expect(loose).toHaveTextContent('Picture guide · Hidden');
    expect(within(loose).getByLabelText('Needs attention')).toBeTruthy();
  });

  it('keeps the selection in storage and opens its detail', () => {
    helpState.items = [makeItem({ id: 'a', title: 'Alpha' })];
    render(<HelpCenterManager />);
    selectRow('Alpha');
    expect(readHelpCenterSelection()).toBe('a');
    expect(screen.getByLabelText('Title')).toHaveValue('Alpha');
  });

  it('lands on the stored selection after a reload', () => {
    helpState.items = [makeItem({ id: 'a', title: 'Alpha' })];
    writeHelpCenterSelection('a');
    render(<HelpCenterManager />);
    expect(screen.getByLabelText('Title')).toHaveValue('Alpha');
  });

  it('refuses Publish while the item is Unfiled', () => {
    helpState.items = [makeItem({ id: 'a', title: 'Alpha', categoryId: '' })];
    writeHelpCenterSelection('a');
    render(<HelpCenterManager />);
    expect(screen.getByText('Pick a category to publish.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull();
  });

  it('publishes a filed item with publishHelpItem', async () => {
    const item = makeItem({ id: 'a', title: 'Alpha' });
    helpState.items = [item];
    writeHelpCenterSelection('a');
    render(<HelpCenterManager />);
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await waitFor(() =>
      expect(itemMocks.publishHelpItem).toHaveBeenCalledWith(item, 'u1')
    );
  });

  it('shows the refusal when publishHelpItem refuses', async () => {
    helpState.items = [makeItem({ id: 'a', title: 'Alpha' })];
    itemMocks.publishHelpItem.mockResolvedValueOnce({
      ok: false,
      reason: 'failing-steps',
    } as never);
    writeHelpCenterSelection('a');
    render(<HelpCenterManager />);
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    expect(
      await screen.findByText('Fix the failing steps to publish.')
    ).toBeTruthy();
  });

  it('hides a published item', async () => {
    const item = makeItem({ id: 'a', title: 'Alpha', visible: true });
    helpState.items = [item];
    writeHelpCenterSelection('a');
    render(<HelpCenterManager />);
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }));
    await waitFor(() =>
      expect(itemMocks.hideHelpItem).toHaveBeenCalledWith(item)
    );
  });

  it('opens the tour editor from Edit on a Live tour', async () => {
    glState.tourSetIds = new Set(['t1']);
    glState.sets.set('t1', pictureSet('t1'));
    helpState.items = [makeItem({ id: 'a', title: 'Tour', setId: 't1' })];
    writeHelpCenterSelection('a');
    render(<HelpCenterManager />);
    expect(await screen.findByTestId('tour-health')).toHaveTextContent('t1');
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(tourMocks.requestEditTour).toHaveBeenCalledWith({
      setId: 't1',
      origin: 'help-center',
    });
  });

  it('copies a Picture guide to the library', async () => {
    const item = makeItem({ id: 'a', title: 'Alpha' });
    helpState.items = [item];
    writeHelpCenterSelection('a');
    render(<HelpCenterManager />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy to my library' }));
    await waitFor(() =>
      expect(itemMocks.copyHelpItemToLibrary).toHaveBeenCalledWith(
        item,
        'u1',
        glState.saveSet
      )
    );
  });

  it('hides an item when it is filed back to Unfiled', async () => {
    helpState.items = [makeItem({ id: 'a', title: 'Alpha', visible: true })];
    writeHelpCenterSelection('a');
    render(<HelpCenterManager />);
    fireEvent.change(screen.getByLabelText('Category'), {
      target: { value: '' },
    });
    await waitFor(() => expect(firestoreMocks.updateDoc).toHaveBeenCalled());
    expect(firestoreMocks.updateDoc.mock.calls[0]).toEqual([
      expect.objectContaining({ id: 'a' }),
      expect.objectContaining({ categoryId: '', visible: false }),
    ]);
  });

  it('changes scope by recreating the item and deleting the old one', async () => {
    helpState.items = [makeItem({ id: 'a', title: 'Alpha', openCount: 4 })];
    writeHelpCenterSelection('a');
    render(<HelpCenterManager />);
    fireEvent.change(screen.getByLabelText('Scope'), {
      target: { value: 'orono' },
    });
    await waitFor(() => expect(firestoreMocks.batchCommit).toHaveBeenCalled());
    expect(firestoreMocks.batchSet.mock.calls[0][1]).toMatchObject({
      id: 'new-id',
      orgId: 'orono',
      openCount: 0,
      title: 'Alpha',
    });
    expect(firestoreMocks.batchDelete.mock.calls[0][0].id).toBe('a');
    expect(readHelpCenterSelection()).toBe('new-id');
  });

  it('offers the three New actions and records from Admin Settings', () => {
    render(<HelpCenterManager />);
    fireEvent.click(screen.getByRole('button', { name: 'New' }));
    const items = screen.getAllByRole('menuitem').map((m) => m.textContent);
    expect(items).toEqual([
      'Record a Live tour',
      'Move from library',
      'New Picture guide',
    ]);
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'Record a Live tour' })
    );
    expect(tourMocks.requestRecordTour).toHaveBeenCalledWith('help-center');
  });

  it('files a new Picture guide on its first save and selects it', async () => {
    itemMocks.createHiddenHelpItem.mockResolvedValue(
      makeItem({ id: 'filed', setId: 'new-guide', categoryId: '' })
    );
    render(<HelpCenterManager />);
    fireEvent.click(screen.getByRole('button', { name: 'New' }));
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'New Picture guide' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'studio save' }));
    await waitFor(() => expect(readHelpCenterSelection()).toBe('filed'));
    fireEvent.click(screen.getByRole('button', { name: 'studio save' }));
    await waitFor(() =>
      expect(glState.saveBuildingSet).toHaveBeenCalledTimes(2)
    );
    expect(itemMocks.createHiddenHelpItem).toHaveBeenCalledTimes(1);
    expect(itemMocks.createHiddenHelpItem.mock.calls[0][1]).toEqual({
      uid: 'u1',
      email: 'super@school.org',
      orgId: null,
      isSuperAdmin: true,
    });
  });

  it('moves picked library guides and selects the moved item', async () => {
    const existing = makeItem({ id: 'a', title: 'Alpha' });
    helpState.items = [existing];
    glState.personal = [
      {
        id: 'p1',
        title: 'My guide',
        mode: 'structured',
        driveFileId: 'f1',
        updatedAt: 1,
      },
    ];
    itemMocks.moveSetToHelpCenter.mockResolvedValue({
      item: makeItem({ id: 'moved', setId: 'help-p1', categoryId: '' }),
      setId: 'help-p1',
      original: 'removed',
    });
    render(<HelpCenterManager />);
    fireEvent.click(screen.getByRole('button', { name: 'New' }));
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'Move from library' })
    );
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('checkbox'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Move 1' }));
    await waitFor(() =>
      expect(itemMocks.moveSetToHelpCenter).toHaveBeenCalledTimes(1)
    );
    const [source, author, deps] = itemMocks.moveSetToHelpCenter.mock
      .calls[0] as unknown as [
      { kind: string; set: { id: string } },
      { uid: string },
      { existingItems: HelpResourceItem[]; deleteSet: unknown },
    ];
    expect(source.kind).toBe('personal');
    expect(source.set.id).toBe('p1');
    expect(author.uid).toBe('u1');
    expect(deps.existingItems).toEqual([existing]);
    expect(deps.deleteSet).toBe(glState.deleteSet);
    await waitFor(() => expect(readHelpCenterSelection()).toBe('moved'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('makes a deleted category’s items Unfiled', async () => {
    helpState.items = [
      makeItem({ id: 'a', title: 'Alpha', categoryId: 'admin', visible: true }),
    ];
    render(<HelpCenterManager />);
    fireEvent.click(screen.getByRole('button', { name: 'Categories' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Admin' }));
    await waitFor(() => expect(firestoreMocks.batchCommit).toHaveBeenCalled());
    expect(firestoreMocks.batchUpdate.mock.calls[0][0].id).toBe('a');
    expect(firestoreMocks.batchUpdate.mock.calls[0][1]).toMatchObject({
      categoryId: '',
      visible: false,
    });
    await waitFor(() => {
      const saved = firestoreMocks.setDoc.mock.calls.find(
        (call) => 'categories' in call[1]
      );
      expect(saved?.[1].categories).toEqual([
        { id: 'getting-started', name: 'Getting started', order: 0 },
      ]);
    });
  });

  it('filters to items that need attention', () => {
    helpState.items = [
      makeItem({ id: 'a', title: 'Fine' }),
      makeItem({ id: 'b', title: 'Loose', categoryId: '' }),
    ];
    render(<HelpCenterManager />);
    fireEvent.change(screen.getByLabelText('Show'), {
      target: { value: 'attention' },
    });
    expect(screen.queryByRole('button', { name: /^Fine/ })).toBeNull();
    expect(screen.getByRole('button', { name: /^Loose/ })).toBeTruthy();
  });

  it('swaps the list for unmapped controls', () => {
    render(<HelpCenterManager />);
    fireEvent.change(screen.getByLabelText('Show'), {
      target: { value: 'unmapped' },
    });
    expect(screen.getByTestId('unmapped')).toBeTruthy();
  });

  it('keeps Categories for super admins and other scopes read only for an org admin', () => {
    asOrgAdmin();
    helpState.items = [makeItem({ id: 'g', title: 'Global', orgId: null })];
    writeHelpCenterSelection('g');
    render(<HelpCenterManager />);
    expect(screen.queryByRole('button', { name: 'Categories' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(screen.getByText('Everyone')).toBeTruthy();
  });

  it('links to Web tours', () => {
    render(<HelpCenterManager />);
    expect(screen.getByRole('link', { name: /Web tours/ })).toHaveAttribute(
      'href',
      '/web-tours'
    );
  });
});
