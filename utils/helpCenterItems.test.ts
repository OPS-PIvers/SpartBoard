import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuidedLearningSet, GuidedLearningStep } from '@/types';
import type { HelpResourceItem } from '@/types/helpCenter';

const fs = vi.hoisted(() => ({
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  nextId: 'item-new',
}));
const gl = vi.hoisted(() => ({
  loadBuildingSet: vi.fn(),
  saveBuildingSetDoc: vi.fn(),
  setHelpCenterFlag: vi.fn(),
  publishTour: vi.fn(),
  openIds: [] as string[],
}));

vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  doc: (parent: { path?: string } | object, ...path: string[]) => ({
    id: path.length ? path[path.length - 1] : fs.nextId,
    path: path.length
      ? path.join('/')
      : `${(parent as { path: string }).path}/${fs.nextId}`,
  }),
  setDoc: fs.setDoc,
  updateDoc: fs.updateDoc,
}));
vi.mock('@/hooks/useGuidedLearning', () => ({
  loadBuildingSet: gl.loadBuildingSet,
  saveBuildingSetDoc: gl.saveBuildingSetDoc,
  setHelpCenterFlag: gl.setHelpCenterFlag,
}));
vi.mock('@/components/tours/publishedTours', () => ({
  publishTour: gl.publishTour,
}));
vi.mock('@/utils/guidedLearningFileRelease', () => ({
  openAssignmentIdsForSet: () => Promise.resolve(gl.openIds),
}));

import {
  buildHiddenHelpItem,
  copyHelpItemToLibrary,
  createHiddenHelpItem,
  finishPendingMove,
  helpCopyIdFor,
  helpScopeFor,
  hideHelpItem,
  isPendingHelpCenterMove,
  moveSetToHelpCenter,
  publishHelpItem,
  publishRefusalOf,
  type HelpAuthor,
} from './helpCenterItems';

const anyNumber: unknown = expect.any(Number);

const superAdmin: HelpAuthor = {
  uid: 'u1',
  email: 'a@x.org',
  orgId: 'org-1',
  isSuperAdmin: true,
};
const orgAdmin: HelpAuthor = { ...superAdmin, isSuperAdmin: false };

const set = (over: Partial<GuidedLearningSet> = {}): GuidedLearningSet => ({
  id: 'set-1',
  title: 'Add a timer',
  imageUrls: [],
  steps: [],
  mode: 'structured',
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

const step = (anchor: string, extra: object = {}): GuidedLearningStep => ({
  id: `s-${anchor || 'none'}`,
  xPct: 0,
  yPct: 0,
  imageIndex: 0,
  interactionType: 'text-popover',
  tour: { anchor, action: 'click', ...extra },
});

const item = (over: Partial<HelpResourceItem> = {}): HelpResourceItem => ({
  ...buildHiddenHelpItem(set(), superAdmin, 'item-1', { now: 5 }),
  ...over,
});

const deps = () => ({
  loadSetData: vi.fn(() => Promise.resolve(set({ id: 'p1', updatedAt: 10 }))),
  deleteSet: vi.fn(() => Promise.resolve()),
});

beforeEach(() => {
  vi.clearAllMocks();
  gl.openIds = [];
  gl.loadBuildingSet.mockResolvedValue(null);
});

describe('helpScopeFor', () => {
  it('files a super admin item globally and an org admin item in their org', () => {
    expect(helpScopeFor(superAdmin)).toBeNull();
    expect(helpScopeFor(orgAdmin)).toBe('org-1');
  });

  it('refuses an org admin with no org', () => {
    expect(() => helpScopeFor({ ...orgAdmin, orgId: null })).toThrow();
  });
});

describe('createHiddenHelpItem', () => {
  it('writes a Hidden, Unfiled item in the rules shape', async () => {
    const created = await createHiddenHelpItem(
      { id: 'set-1', title: '  ', description: null },
      orgAdmin
    );
    expect(created).toMatchObject({
      id: 'item-new',
      kind: 'guided-learning',
      title: 'Untitled guide',
      description: '',
      categoryId: '',
      visible: false,
      orgId: 'org-1',
      setId: 'set-1',
      url: null,
      embedType: null,
      openCount: 0,
      createdBy: 'u1',
    });
    expect(Object.keys(created).sort()).toEqual(
      [
        'id',
        'kind',
        'title',
        'description',
        'categoryId',
        'order',
        'visible',
        'orgId',
        'widgetTypes',
        'url',
        'embedType',
        'setId',
        'openCount',
        'createdBy',
        'createdByEmail',
        'createdAt',
        'updatedAt',
      ].sort()
    );
    expect(fs.setDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'help_resources/item-new' }),
      created
    );
  });
});

describe('moveSetToHelpCenter', () => {
  it('flags a building set out of every library and files it', async () => {
    const result = await moveSetToHelpCenter(
      { kind: 'building', set: { id: 'b1', title: 'Seating' } },
      superAdmin,
      deps()
    );
    expect(gl.setHelpCenterFlag).toHaveBeenCalledWith('b1', true);
    expect(result).toMatchObject({ setId: 'b1', original: 'flagged' });
    expect(result.item).toMatchObject({ setId: 'b1', visible: false });
  });

  it('reuses an item that already points at the set', async () => {
    const existing = item({ id: 'old', setId: 'b1' });
    const result = await moveSetToHelpCenter(
      { kind: 'building', set: { id: 'b1', title: 'Seating' } },
      superAdmin,
      { ...deps(), existingItems: [existing] }
    );
    expect(result.item).toBe(existing);
    expect(fs.setDoc).not.toHaveBeenCalled();
  });

  it('copies a personal set and removes it when no student has it open', async () => {
    const d = deps();
    const result = await moveSetToHelpCenter(
      {
        kind: 'personal',
        set: { id: 'p1', title: 'Mine', driveFileId: 'f1', updatedAt: 10 },
      },
      superAdmin,
      d
    );
    expect(gl.saveBuildingSetDoc).toHaveBeenCalledWith(
      expect.objectContaining({
        id: helpCopyIdFor('p1'),
        isBuilding: true,
        helpCenter: true,
      })
    );
    expect(d.deleteSet).toHaveBeenCalledWith('p1', 'f1');
    expect(result).toMatchObject({ setId: 'help-p1', original: 'removed' });
  });

  it('tags a personal set students still have open instead of removing it', async () => {
    gl.openIds = ['a1'];
    const d = deps();
    const result = await moveSetToHelpCenter(
      {
        kind: 'personal',
        set: { id: 'p1', title: 'Mine', driveFileId: 'f1', updatedAt: 10 },
      },
      superAdmin,
      d
    );
    expect(d.deleteSet).not.toHaveBeenCalled();
    expect(result.original).toBe('tagged');
    expect(fs.updateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'users/u1/guided_learning/p1' }),
      { movedToHelpCenterAt: anyNumber }
    );
  });

  it('keeps an original edited after its older copy', async () => {
    gl.loadBuildingSet.mockResolvedValue(
      set({ id: 'help-p1', createdAt: 5, helpCenter: true })
    );
    const d = deps();
    const result = await moveSetToHelpCenter(
      {
        kind: 'personal',
        set: { id: 'p1', title: 'Mine', driveFileId: 'f1', updatedAt: 10 },
      },
      superAdmin,
      d
    );
    expect(gl.saveBuildingSetDoc).not.toHaveBeenCalled();
    expect(d.deleteSet).not.toHaveBeenCalled();
    expect(result.original).toBe('kept');
  });
});

describe('pending moves', () => {
  const meta = { id: 'p1', driveFileId: 'f1', movedToHelpCenterAt: 20 };

  it('shows the tag until the set is edited after the move', () => {
    expect(isPendingHelpCenterMove({ ...meta, updatedAt: 10 })).toBe(true);
    expect(isPendingHelpCenterMove({ ...meta, updatedAt: 30 })).toBe(false);
    expect(isPendingHelpCenterMove({ updatedAt: 10 })).toBe(false);
  });

  it('removes a tagged set once no student has it open', async () => {
    const deleteSet = vi.fn(() => Promise.resolve());
    gl.openIds = ['a1'];
    await expect(
      finishPendingMove('u1', { ...meta, updatedAt: 10 }, deleteSet)
    ).resolves.toBe('waiting');
    gl.openIds = [];
    await expect(
      finishPendingMove('u1', { ...meta, updatedAt: 10 }, deleteSet)
    ).resolves.toBe('removed');
    await expect(
      finishPendingMove('u1', { ...meta, updatedAt: 30 }, deleteSet)
    ).resolves.toBe('none');
    expect(deleteSet).toHaveBeenCalledTimes(1);
  });
});

describe('publishRefusalOf', () => {
  const filed = item({ categoryId: 'getting-started' });
  const tour = (steps: GuidedLearningStep[]) => set({ mode: 'tour', steps });

  it('refuses an Unfiled item first', () => {
    expect(publishRefusalOf(item(), tour([]))).toBe('unfiled');
  });

  it('refuses a missing set, a web tour and an empty tour', () => {
    expect(publishRefusalOf(filed, null)).toBe('missing-set');
    expect(publishRefusalOf(filed, set({ surface: 'web' }))).toBe('web-tour');
    expect(publishRefusalOf(filed, tour([]))).toBe('no-steps');
  });

  it('refuses failing steps before unchecked ones', () => {
    expect(
      publishRefusalOf(filed, tour([step('nope.not-real'), step('')]))
    ).toBe('failing-steps');
    expect(
      publishRefusalOf(filed, tour([step('sidebar.admin-settings'), step('')]))
    ).toBe('unchecked-steps');
  });

  it('allows a filed tour whose steps all check out', () => {
    expect(
      publishRefusalOf(
        filed,
        tour([
          step('sidebar.admin-settings'),
          step('', { fallback: { role: 'button', name: 'Save' } }),
          step('board.whole', { action: 'observe' }),
        ])
      )
    ).toBeNull();
  });

  it('allows a filed Picture guide with steps', () => {
    expect(publishRefusalOf(filed, set({ steps: [step('')] }))).toBeNull();
  });
});

describe('publishHelpItem / hideHelpItem', () => {
  it('publishes the tour snapshot, then shows the item', async () => {
    const saved = set({
      mode: 'tour',
      steps: [step('sidebar.admin-settings')],
    });
    gl.loadBuildingSet.mockResolvedValue(saved);
    const result = await publishHelpItem(item({ categoryId: 'admin' }), 'u1');
    expect(result).toEqual({ ok: true });
    expect(gl.publishTour).toHaveBeenCalledWith(saved, 'u1');
    expect(fs.updateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'help_resources/item-1' }),
      { visible: true, updatedAt: anyNumber }
    );
  });

  it('refuses without writing anything', async () => {
    gl.loadBuildingSet.mockResolvedValue(set({ mode: 'tour', steps: [] }));
    await expect(publishHelpItem(item(), 'u1')).resolves.toEqual({
      ok: false,
      reason: 'unfiled',
    });
    expect(gl.publishTour).not.toHaveBeenCalled();
    expect(fs.updateDoc).not.toHaveBeenCalled();
  });

  it('does not publish a snapshot for a Picture guide', async () => {
    gl.loadBuildingSet.mockResolvedValue(set({ steps: [step('')] }));
    await publishHelpItem(item({ categoryId: 'admin' }), 'u1');
    expect(gl.publishTour).not.toHaveBeenCalled();
    expect(fs.updateDoc).toHaveBeenCalledTimes(1);
  });

  it('hides an item', async () => {
    await hideHelpItem({ id: 'item-1' });
    expect(fs.updateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'help_resources/item-1' }),
      { visible: false, updatedAt: anyNumber }
    );
  });
});

describe('copyHelpItemToLibrary', () => {
  it('saves a personal copy and leaves the item alone', async () => {
    gl.loadBuildingSet.mockResolvedValue(
      set({ id: 'help-p1', isBuilding: true, helpCenter: true })
    );
    const save = vi.fn(() => Promise.resolve());
    const copy = await copyHelpItemToLibrary(item(), 'u9', save);
    expect(copy.id).not.toBe('help-p1');
    expect(copy).not.toHaveProperty('isBuilding');
    expect(copy).not.toHaveProperty('helpCenter');
    expect(copy.authorUid).toBe('u9');
    expect(save).toHaveBeenCalledWith(copy);
    expect(fs.updateDoc).not.toHaveBeenCalled();
  });

  it('refuses a Live tour', async () => {
    gl.loadBuildingSet.mockResolvedValue(set({ mode: 'tour' }));
    await expect(
      copyHelpItemToLibrary(item(), 'u9', vi.fn())
    ).rejects.toThrow();
  });
});
