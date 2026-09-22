import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { bundleSubShareContent } from '@/utils/bundleSubShareContent';
import type {
  Dashboard,
  DrawableObject,
  WidgetData,
  WidgetType,
} from '@/types';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, ...path: string[]) => ({
    __path: path.join('/'),
  })),
  doc: vi.fn((_db: unknown, ...path: string[]) => ({
    __path: path.join('/'),
  })),
  getDocs: vi.fn(),
  getDoc: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({ db: { __mock: 'db' } }));
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

const mockGetDocs = getDocs as Mock;
const mockGetDoc = getDoc as Mock;

const stroke = (id: string, z: number): DrawableObject =>
  ({ id, z, kind: 'pen' }) as unknown as DrawableObject;

const drawing = (id: string, migrated: boolean, pageIds: string[]) =>
  ({
    id,
    type: 'drawing' satisfies WidgetType,
    config: {
      subcollectionMigrated: migrated,
      pages: pageIds.map((pid) => ({ id: pid })),
    },
  }) as unknown as WidgetData;

const notebookWidget = (id: string, notebookId: string | null) =>
  ({
    id,
    type: 'smartNotebook' satisfies WidgetType,
    config: { activeNotebookId: notebookId },
  }) as unknown as WidgetData;

const notebookDoc = (id: string, fields: Record<string, unknown>) => ({
  id,
  exists: () => true,
  data: () => fields,
});

const customWidget = (id: string, customWidgetId: string | null) =>
  ({
    id,
    // `satisfies WidgetType` on purpose: the first cut of this said
    // 'customWidget', which the bundler's filter never matched.
    type: 'custom-widget' satisfies WidgetType,
    config: { customWidgetId },
  }) as unknown as WidgetData;

const customWidgetDoc = (id: string, fields: Record<string, unknown>) => ({
  id,
  exists: () => true,
  data: () => fields,
});

const projectsWidget = (id: string, projectId: string | null) =>
  ({
    id,
    type: 'projects' satisfies WidgetType,
    config: { projectId },
  }) as unknown as WidgetData;

const runDoc = (id: string, fields: Record<string, unknown>) => ({
  id,
  exists: () => true,
  data: () => fields,
});

const groupSnap = (groups: Record<string, unknown>[]) => ({
  docs: groups.map((g) => ({ id: g.id as string, data: () => g })),
});

const board = (id: string, name: string, widgets: WidgetData[]) =>
  ({ id, name, widgets }) as unknown as Dashboard;

describe('bundleSubShareContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('bundles a migrated drawing page by page, in z order', async () => {
    mockGetDocs.mockImplementation((ref: { __path: string }) => {
      const objects = ref.__path.endsWith('p1/objects')
        ? [stroke('b', 2), stroke('a', 1)]
        : [stroke('c', 1)];
      return Promise.resolve({ docs: objects.map((o) => ({ data: () => o })) });
    });

    const bundle = await bundleSubShareContent({
      hostUid: 'teacher-1',
      boards: [board('b1', 'Warm up', [drawing('w1', true, ['p1', 'p2'])])],
    });

    expect(bundle.failures).toEqual([]);
    expect(bundle.items).toHaveLength(1);
    expect(bundle.items[0].id).toBe('drawing_w1');
    expect(bundle.items[0].doc.payload).toEqual({
      pages: [
        { pageId: 'p1', objects: [stroke('a', 1), stroke('b', 2)] },
        { pageId: 'p2', objects: [stroke('c', 1)] },
      ],
    });
  });

  // A widget that never migrated still carries its strokes in the board's own
  // config, which the snapshot already copies — bundling it would duplicate it.
  it('skips a drawing that has not migrated to the subcollection', async () => {
    const bundle = await bundleSubShareContent({
      hostUid: 'teacher-1',
      boards: [board('b1', 'Warm up', [drawing('w1', false, ['p1'])])],
    });

    expect(bundle.items).toEqual([]);
    expect(mockGetDocs).not.toHaveBeenCalled();
  });

  it('reads from the teacher’s own account, not the caller’s', async () => {
    mockGetDocs.mockResolvedValue({ docs: [] });

    await bundleSubShareContent({
      hostUid: 'teacher-1',
      boards: [board('b1', 'Warm up', [drawing('w1', true, ['p1'])])],
    });

    const firstRef = (collection as Mock).mock.results[0].value as {
      __path: string;
    };
    expect(firstRef.__path).toBe(
      'users/teacher-1/dashboards/b1/drawings/w1/pages/p1/objects'
    );
  });

  // Shipping a widget the sub will find empty, with nobody told, is the thing
  // bundling exists to prevent.
  it('reports an item it could not read rather than shipping it empty', async () => {
    mockGetDocs.mockRejectedValue(new Error('offline'));

    const bundle = await bundleSubShareContent({
      hostUid: 'teacher-1',
      boards: [board('b1', 'Warm up', [drawing('w1', true, ['p1'])])],
    });

    expect(bundle.items).toEqual([]);
    expect(bundle.failures).toEqual([
      { kind: 'drawing', itemId: 'w1', label: 'Drawing on Warm up' },
    ]);
  });

  it('carries on to the next board after a failure', async () => {
    mockGetDocs
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ docs: [] });

    const bundle = await bundleSubShareContent({
      hostUid: 'teacher-1',
      boards: [
        board('b1', 'Warm up', [drawing('w1', true, ['p1'])]),
        board('b2', 'Reading', [drawing('w2', true, ['p1'])]),
      ],
    });

    expect(bundle.failures.map((f) => f.itemId)).toEqual(['w1']);
    expect(bundle.items.map((i) => i.id)).toEqual(['drawing_w2']);
  });

  describe('smart notebook', () => {
    it('bundles the notebook the widget is open on', async () => {
      mockGetDoc.mockResolvedValue(
        notebookDoc('nb-1', {
          title: 'Fractions',
          pageUrls: ['https://storage/page1?token=a'],
          pagePaths: ['users/teacher-1/notebooks/nb-1/page0.svg'],
          createdAt: 7,
          hiddenPages: [2],
        })
      );

      const bundle = await bundleSubShareContent({
        hostUid: 'teacher-1',
        boards: [board('b1', 'Warm up', [notebookWidget('w1', 'nb-1')])],
      });

      expect(bundle.failures).toEqual([]);
      expect(bundle.items.map((i) => i.id)).toEqual(['notebook_nb-1']);
      expect(bundle.items[0].doc.itemId).toBe('nb-1');
      expect(bundle.items[0].doc.payload).toEqual({
        notebook: {
          id: 'nb-1',
          title: 'Fractions',
          pageUrls: ['https://storage/page1?token=a'],
          pagePaths: ['users/teacher-1/notebooks/nb-1/page0.svg'],
          assetUrls: [],
          createdAt: 7,
          sections: undefined,
          objectLinks: undefined,
          hiddenPages: [2],
        },
      });
      const ref = (doc as Mock).mock.results[0].value as { __path: string };
      expect(ref.__path).toBe('users/teacher-1/notebooks/nb-1');
    });

    it('skips a widget with no notebook chosen', async () => {
      const bundle = await bundleSubShareContent({
        hostUid: 'teacher-1',
        boards: [board('b1', 'Warm up', [notebookWidget('w1', null)])],
      });

      expect(bundle.items).toEqual([]);
      expect(mockGetDoc).not.toHaveBeenCalled();
    });

    // Two boards of the day's plan can open the same notebook; bundling it
    // twice would write the same doc twice and count against the batch twice.
    it('bundles a notebook shared by two boards once', async () => {
      mockGetDoc.mockResolvedValue(
        notebookDoc('nb-1', { title: 'Fractions', pageUrls: [] })
      );

      const bundle = await bundleSubShareContent({
        hostUid: 'teacher-1',
        boards: [
          board('b1', 'Warm up', [notebookWidget('w1', 'nb-1')]),
          board('b2', 'Reading', [notebookWidget('w2', 'nb-1')]),
        ],
      });

      expect(bundle.items.map((i) => i.id)).toEqual(['notebook_nb-1']);
      expect(mockGetDoc).toHaveBeenCalledTimes(1);
    });

    // A deleted notebook still referenced by the board reads as a missing doc,
    // which the teacher must be told about rather than the sub finding out.
    it('reports a notebook that no longer exists', async () => {
      mockGetDoc.mockResolvedValue({ id: 'nb-1', exists: () => false });

      const bundle = await bundleSubShareContent({
        hostUid: 'teacher-1',
        boards: [board('b1', 'Warm up', [notebookWidget('w1', 'nb-1')])],
      });

      expect(bundle.items).toEqual([]);
      expect(bundle.failures).toEqual([
        { kind: 'notebook', itemId: 'nb-1', label: 'Notebook on Warm up' },
      ]);
    });

    it('reports a notebook it could not read', async () => {
      mockGetDoc.mockRejectedValue(new Error('offline'));

      const bundle = await bundleSubShareContent({
        hostUid: 'teacher-1',
        boards: [board('b1', 'Warm up', [notebookWidget('w1', 'nb-1')])],
      });

      expect(bundle.items).toEqual([]);
      expect(bundle.failures.map((f) => f.kind)).toEqual(['notebook']);
    });
  });

  describe('custom widget', () => {
    it('bundles the definition doc the widget points at', async () => {
      mockGetDoc.mockResolvedValue(
        customWidgetDoc('cw-1', {
          title: 'Dice',
          accessLevel: 'beta',
          betaUsers: ['teacher@orono.k12.mn.us'],
          mode: 'block',
        })
      );

      const bundle = await bundleSubShareContent({
        hostUid: 'teacher-1',
        boards: [board('b1', 'Warm up', [customWidget('w1', 'cw-1')])],
      });

      expect(bundle.failures).toEqual([]);
      expect(bundle.items.map((i) => i.id)).toEqual(['customWidget_cw-1']);
      expect(bundle.items[0].doc.payload).toEqual({
        doc: {
          id: 'cw-1',
          title: 'Dice',
          mode: 'block',
          updatedAt: 0,
          gridDefinition: undefined,
          codeContent: undefined,
        },
      });
      const ref = (doc as Mock).mock.results.at(-1)?.value as {
        __path: string;
      };
      expect(ref.__path).toBe('custom_widgets/cw-1');
    });

    // `content/` is readable by any verified district account holding the
    // share, so the definition's own access list must not travel with it.
    it('leaves the beta-access email list out of the bundle', async () => {
      mockGetDoc.mockResolvedValue(
        customWidgetDoc('cw-1', {
          title: 'Dice',
          mode: 'block',
          accessLevel: 'beta',
          betaUsers: ['someone.else@orono.k12.mn.us'],
          createdBy: 'teacher-1',
          buildings: ['ohs'],
          slug: 'dice',
          settings: [{ key: 'sides' }],
        })
      );

      const bundle = await bundleSubShareContent({
        hostUid: 'teacher-1',
        boards: [board('b1', 'Warm up', [customWidget('w1', 'cw-1')])],
      });

      const payload = bundle.items[0].doc.payload as { doc: object };
      expect(Object.keys(payload.doc).sort()).toEqual([
        'codeContent',
        'gridDefinition',
        'id',
        'mode',
        'title',
        'updatedAt',
      ]);
      expect(JSON.stringify(payload.doc)).not.toContain('someone.else');
    });

    it('skips a custom widget with no definition chosen', async () => {
      const bundle = await bundleSubShareContent({
        hostUid: 'teacher-1',
        boards: [board('b1', 'Warm up', [customWidget('w1', null)])],
      });

      expect(bundle.items).toEqual([]);
      expect(mockGetDoc).not.toHaveBeenCalled();
    });

    it('bundles a definition shared by two boards once', async () => {
      mockGetDoc.mockResolvedValue(customWidgetDoc('cw-1', { title: 'Dice' }));

      const bundle = await bundleSubShareContent({
        hostUid: 'teacher-1',
        boards: [
          board('b1', 'Warm up', [customWidget('w1', 'cw-1')]),
          board('b2', 'Reading', [customWidget('w2', 'cw-1')]),
        ],
      });

      expect(bundle.items.map((i) => i.id)).toEqual(['customWidget_cw-1']);
      expect(mockGetDoc).toHaveBeenCalledTimes(1);
    });

    it('reports a definition that no longer exists', async () => {
      mockGetDoc.mockResolvedValue({ id: 'cw-1', exists: () => false });

      const bundle = await bundleSubShareContent({
        hostUid: 'teacher-1',
        boards: [board('b1', 'Warm up', [customWidget('w1', 'cw-1')])],
      });

      expect(bundle.items).toEqual([]);
      expect(bundle.failures).toEqual([
        {
          kind: 'customWidget',
          itemId: 'cw-1',
          label: 'Custom widget on Warm up',
        },
      ]);
    });

    it('reports a definition it could not read', async () => {
      mockGetDoc.mockRejectedValue(new Error('offline'));

      const bundle = await bundleSubShareContent({
        hostUid: 'teacher-1',
        boards: [board('b1', 'Warm up', [customWidget('w1', 'cw-1')])],
      });

      expect(bundle.items).toEqual([]);
      expect(bundle.failures.map((f) => f.kind)).toEqual(['customWidget']);
    });
  });

  describe('project', () => {
    const run = {
      projectId: 'p-1',
      teacherUid: 'teacher-1',
      title: 'Ecosystem poster',
      steps: [{ id: 's1', title: 'Research' }],
      classIds: ['class-a'],
      approvalStepIds: [],
      rubric: { criteria: [] },
      dueAt: 123,
      showStatusToStudents: true,
      acceptingUpdates: true,
      updatedAt: 9,
    };

    const group = {
      id: 'g1',
      name: 'Group 1',
      classId: 'class-a',
      order: 0,
      stepStates: { s1: 'done' },
      needsSupport: true,
      memberUids: ['student-uid-1'],
      workLinks: [
        { id: 'l1', url: 'https://docs/x', addedByUid: 'student-uid-1' },
      ],
      driveFolderId: 'folder-1',
      updatedAt: 9,
    };

    // D13 — the run id is derived from the pair, never stored in config.
    it('bundles the run derived from the host uid and its groups', async () => {
      mockGetDoc.mockResolvedValue(runDoc('teacher-1_p-1', run));
      mockGetDocs.mockResolvedValue(groupSnap([group]));

      const bundle = await bundleSubShareContent({
        hostUid: 'teacher-1',
        boards: [board('b1', 'Science', [projectsWidget('w1', 'p-1')])],
      });

      expect(bundle.failures).toEqual([]);
      expect(bundle.items.map((i) => i.id)).toEqual(['project_p-1']);
      expect(bundle.items[0].doc.payload).toEqual({
        run: {
          id: 'teacher-1_p-1',
          projectId: 'p-1',
          title: 'Ecosystem poster',
          steps: [{ id: 's1', title: 'Research' }],
        },
        groups: [
          {
            id: 'g1',
            name: 'Group 1',
            classId: 'class-a',
            order: 0,
            stepStates: { s1: 'done' },
            needsSupport: true,
          },
        ],
      });
      const runRef = (doc as Mock).mock.results.at(-1)?.value as {
        __path: string;
      };
      expect(runRef.__path).toBe('project_runs/teacher-1_p-1');
      const groupsRef = (collection as Mock).mock.results.at(-1)?.value as {
        __path: string;
      };
      expect(groupsRef.__path).toBe('project_runs/teacher-1_p-1/groups');
    });

    // `content/` is readable by any verified district account holding the
    // share, so nothing the tracker does not draw may travel with it.
    it('leaves student uids, work links and the rubric out of the bundle', async () => {
      mockGetDoc.mockResolvedValue(runDoc('teacher-1_p-1', run));
      mockGetDocs.mockResolvedValue(groupSnap([group]));

      const bundle = await bundleSubShareContent({
        hostUid: 'teacher-1',
        boards: [board('b1', 'Science', [projectsWidget('w1', 'p-1')])],
      });

      const payload = bundle.items[0].doc.payload as {
        run: object;
        groups: object[];
      };
      expect(Object.keys(payload.run).sort()).toEqual([
        'id',
        'projectId',
        'steps',
        'title',
      ]);
      expect(Object.keys(payload.groups[0]).sort()).toEqual([
        'classId',
        'id',
        'name',
        'needsSupport',
        'order',
        'stepStates',
      ]);
      const json = JSON.stringify(payload);
      expect(json).not.toContain('student-uid-1');
      expect(json).not.toContain('https://docs/x');
      expect(json).not.toContain('rubric');
    });

    it('skips a widget with no project open', async () => {
      const bundle = await bundleSubShareContent({
        hostUid: 'teacher-1',
        boards: [board('b1', 'Science', [projectsWidget('w1', null)])],
      });

      expect(bundle.items).toEqual([]);
      expect(mockGetDoc).not.toHaveBeenCalled();
    });

    it('bundles a project shared by two boards once', async () => {
      mockGetDoc.mockResolvedValue(runDoc('teacher-1_p-1', run));
      mockGetDocs.mockResolvedValue(groupSnap([group]));

      const bundle = await bundleSubShareContent({
        hostUid: 'teacher-1',
        boards: [
          board('b1', 'Science', [projectsWidget('w1', 'p-1')]),
          board('b2', 'Period 2', [projectsWidget('w2', 'p-1')]),
        ],
      });

      expect(bundle.items.map((i) => i.id)).toEqual(['project_p-1']);
      expect(mockGetDoc).toHaveBeenCalledTimes(1);
    });

    it('reports a project that was never started', async () => {
      mockGetDoc.mockResolvedValue({
        id: 'teacher-1_p-1',
        exists: () => false,
      });

      const bundle = await bundleSubShareContent({
        hostUid: 'teacher-1',
        boards: [board('b1', 'Science', [projectsWidget('w1', 'p-1')])],
      });

      expect(bundle.items).toEqual([]);
      expect(bundle.failures).toEqual([
        { kind: 'project', itemId: 'p-1', label: 'Project on Science' },
      ]);
    });

    it('reports groups it could not read', async () => {
      mockGetDoc.mockResolvedValue(runDoc('teacher-1_p-1', run));
      mockGetDocs.mockRejectedValue(new Error('offline'));

      const bundle = await bundleSubShareContent({
        hostUid: 'teacher-1',
        boards: [board('b1', 'Science', [projectsWidget('w1', 'p-1')])],
      });

      expect(bundle.items).toEqual([]);
      expect(bundle.failures.map((f) => f.kind)).toEqual(['project']);
    });
  });
});
