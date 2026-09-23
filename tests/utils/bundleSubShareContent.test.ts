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

const wallWidget = (id: string, activityId: string | null) =>
  ({
    id,
    // `satisfies WidgetType` on purpose: the content kind is camelCase but
    // this literal is kebab, and the fixtures' casts would hide a wrong one.
    type: 'activity-wall' satisfies WidgetType,
    config: { activeActivityId: activityId },
  }) as unknown as WidgetData;

const wallDoc = (id: string, fields: Record<string, unknown>) => ({
  id,
  exists: () => true,
  data: () => fields,
});

const flashcardsWidget = (id: string, presentSetId: string | null) =>
  ({
    id,
    type: 'flashcards' satisfies WidgetType,
    config: { presentSetId },
  }) as unknown as WidgetData;

const setDoc = (id: string, fields: Record<string, unknown>) => ({
  id,
  exists: () => true,
  data: () => fields,
});

const calendarWidget = (id: string, personalCalendarIds: string[]) =>
  ({
    id,
    type: 'calendar' satisfies WidgetType,
    config: { personalCalendarIds },
  }) as unknown as WidgetData;

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

  describe('activity wall', () => {
    const entry = {
      title: 'Exit tickets',
      prompt: 'What stuck with you today?',
      mode: 'text',
      moderationEnabled: true,
      identificationMode: 'name',
      createdAt: 1,
      updatedAt: 2,
      layout: 'wall',
      showNames: true,
      classId: 'class-a',
      classIds: ['class-a', 'class-b'],
      rosterIds: ['roster-7'],
    };

    it('bundles the wall definition the widget has open', async () => {
      mockGetDoc.mockResolvedValue(wallDoc('aw-1', entry));

      const bundle = await bundleSubShareContent({
        hostUid: 'teacher-1',
        boards: [board('b1', 'Exit', [wallWidget('w1', 'aw-1')])],
      });

      expect(bundle.failures).toEqual([]);
      expect(bundle.items.map((i) => i.id)).toEqual(['activityWall_aw-1']);
      const payload = bundle.items[0].doc.payload as {
        entry: { id: string; title: string; prompt: string };
        hostUid: string;
      };
      expect(payload.entry.id).toBe('aw-1');
      expect(payload.entry.title).toBe('Exit tickets');
      expect(payload.entry.prompt).toBe('What stuck with you today?');
      expect(payload.hostUid).toBe('teacher-1');
      const ref = (doc as Mock).mock.results.at(-1)?.value as {
        __path: string;
      };
      expect(ref.__path).toBe('users/teacher-1/activity_wall_activities/aw-1');
    });

    // `content/` is readable by any verified district account holding the
    // share, and a substitute launches nothing, so the targeting stays out.
    it('leaves the class and roster targeting out of the bundle', async () => {
      mockGetDoc.mockResolvedValue(wallDoc('aw-1', entry));

      const bundle = await bundleSubShareContent({
        hostUid: 'teacher-1',
        boards: [board('b1', 'Exit', [wallWidget('w1', 'aw-1')])],
      });

      const payload = bundle.items[0].doc.payload as { entry: object };
      expect(Object.keys(payload.entry).sort()).toEqual([
        'acceptingResponses',
        'allowCommentResponses',
        'allowComments',
        'allowGuests',
        'allowLikes',
        'allowStudentDelete',
        'allowStudentEdit',
        'allowedTypes',
        'appearance',
        'createdAt',
        'id',
        'identificationMode',
        'layout',
        'mapCenter',
        'maxPostsPerStudent',
        'mode',
        'moderationEnabled',
        'prompt',
        'sections',
        'showNames',
        'studentsCanSeePosts',
        'tableCols',
        'tableRows',
        'title',
        'updatedAt',
      ]);
      const json = JSON.stringify(payload.entry);
      expect(json).not.toContain('class-b');
      expect(json).not.toContain('roster-7');
    });

    // The teacher's own view runs the doc through the normalizer, which
    // derives these from the legacy `mode`; without it the sub's copy of an
    // unmigrated wall would be missing the layout and the background.
    it('derives the legacy fields a wall predating the redesign has none of', async () => {
      mockGetDoc.mockResolvedValue(
        wallDoc('aw-1', {
          title: 'Old wall',
          prompt: 'Post a photo',
          mode: 'photo',
          identificationMode: 'name',
        })
      );

      const bundle = await bundleSubShareContent({
        hostUid: 'teacher-1',
        boards: [board('b1', 'Exit', [wallWidget('w1', 'aw-1')])],
      });

      const payload = bundle.items[0].doc.payload as {
        entry: {
          layout?: string;
          appearance?: unknown;
          allowedTypes?: unknown;
          showNames?: boolean;
        };
      };
      expect(payload.entry.layout).toBeDefined();
      expect(payload.entry.appearance).toBeDefined();
      expect(payload.entry.allowedTypes).toBeDefined();
      expect(payload.entry.showNames).toBe(true);
    });

    // The posts are the students' own words, names and uids.
    it('never reads the wall’s submissions', async () => {
      mockGetDoc.mockResolvedValue(wallDoc('aw-1', entry));
      mockGetDocs.mockResolvedValue({ docs: [] });

      await bundleSubShareContent({
        hostUid: 'teacher-1',
        boards: [board('b1', 'Exit', [wallWidget('w1', 'aw-1')])],
      });

      const paths = (collection as Mock).mock.results.map(
        (r) => (r.value as { __path: string }).__path
      );
      expect(
        paths.some((path) => path.includes('activity_wall_sessions'))
      ).toBe(false);
      expect(paths.some((path) => path.includes('submissions'))).toBe(false);
    });

    it('skips a widget with no wall open', async () => {
      const bundle = await bundleSubShareContent({
        hostUid: 'teacher-1',
        boards: [board('b1', 'Exit', [wallWidget('w1', null)])],
      });

      expect(bundle.items).toEqual([]);
      expect(mockGetDoc).not.toHaveBeenCalled();
    });

    it('bundles a wall shared by two boards once', async () => {
      mockGetDoc.mockResolvedValue(wallDoc('aw-1', entry));

      const bundle = await bundleSubShareContent({
        hostUid: 'teacher-1',
        boards: [
          board('b1', 'Exit', [wallWidget('w1', 'aw-1')]),
          board('b2', 'Period 2', [wallWidget('w2', 'aw-1')]),
        ],
      });

      expect(bundle.items.map((i) => i.id)).toEqual(['activityWall_aw-1']);
      expect(mockGetDoc).toHaveBeenCalledTimes(1);
    });

    it('reports a wall that no longer exists', async () => {
      mockGetDoc.mockResolvedValue({ id: 'aw-1', exists: () => false });

      const bundle = await bundleSubShareContent({
        hostUid: 'teacher-1',
        boards: [board('b1', 'Exit', [wallWidget('w1', 'aw-1')])],
      });

      expect(bundle.items).toEqual([]);
      expect(bundle.failures).toEqual([
        {
          kind: 'activityWall',
          itemId: 'aw-1',
          label: 'Activity Wall on Exit',
        },
      ]);
    });

    it('reports a wall it could not read', async () => {
      mockGetDoc.mockRejectedValue(new Error('offline'));

      const bundle = await bundleSubShareContent({
        hostUid: 'teacher-1',
        boards: [board('b1', 'Exit', [wallWidget('w1', 'aw-1')])],
      });

      expect(bundle.items).toEqual([]);
      expect(bundle.failures.map((f) => f.kind)).toEqual(['activityWall']);
    });
  });
  describe('calendar', () => {
    const events = [
      { title: 'Staff meeting', date: '2026-09-24', time: '3:30 PM' },
      { title: 'Field trip', date: '2026-09-25' },
    ];

    it('bundles every personal calendar the widget is configured with', async () => {
      const readCalendar = vi.fn().mockResolvedValue(events);

      const bundle = await bundleSubShareContent({
        hostUid: 'teacher-1',
        boards: [
          board('b1', 'Homeroom', [
            calendarWidget('w1', ['primary', 'coach@school.org']),
          ]),
        ],
        services: { readCalendar },
      });

      expect(bundle.failures).toEqual([]);
      expect(bundle.items.map((i) => i.id)).toEqual(['calendar_w1']);
      expect(readCalendar).toHaveBeenCalledTimes(2);
      expect((readCalendar.mock.calls as string[][]).map((c) => c[0])).toEqual([
        'primary',
        'coach@school.org',
      ]);
      const payload = bundle.items[0].doc.payload as { events: unknown[] };
      // Flattened across both calendars, as the widget itself merges them.
      expect(payload.events).toHaveLength(4);
    });

    // The plan's §3.3 Calendar row: the share carries two weeks, not a year.
    it('asks for a fortnight from today', async () => {
      const readCalendar = vi.fn().mockResolvedValue([]);

      await bundleSubShareContent({
        hostUid: 'teacher-1',
        boards: [board('b1', 'Homeroom', [calendarWidget('w1', ['primary'])])],
        services: { readCalendar },
      });

      const [, timeMin, timeMax] = readCalendar.mock.calls[0] as string[];
      const spanDays = (Date.parse(timeMax) - Date.parse(timeMin)) / 86_400_000;
      expect(spanDays).toBe(14);
    });

    it('keys the bundle on the widget, since events live in its config', async () => {
      const readCalendar = vi.fn().mockResolvedValue(events);

      const bundle = await bundleSubShareContent({
        hostUid: 'teacher-1',
        boards: [
          board('b1', 'Homeroom', [
            calendarWidget('w1', ['primary']),
            calendarWidget('w2', ['primary']),
          ]),
        ],
        services: { readCalendar },
      });

      // Two widgets on one calendar are two items: a teacher can set a
      // different `daysVisible` on each, so neither can stand in for the other.
      expect(bundle.items.map((i) => i.id)).toEqual([
        'calendar_w1',
        'calendar_w2',
      ]);
    });

    it('leaves a widget with no personal calendars alone', async () => {
      const readCalendar = vi.fn().mockResolvedValue([]);

      const bundle = await bundleSubShareContent({
        hostUid: 'teacher-1',
        boards: [board('b1', 'Homeroom', [calendarWidget('w1', [])])],
        services: { readCalendar },
      });

      expect(bundle.items).toEqual([]);
      expect(bundle.failures).toEqual([]);
      expect(readCalendar).not.toHaveBeenCalled();
    });

    // A teacher who never granted the scope gets told, rather than shipping a
    // calendar that silently drops their events.
    it('reports a failure when no reader was supplied', async () => {
      const bundle = await bundleSubShareContent({
        hostUid: 'teacher-1',
        boards: [board('b1', 'Homeroom', [calendarWidget('w1', ['primary'])])],
      });

      expect(bundle.items).toEqual([]);
      expect(bundle.failures).toEqual([
        { kind: 'calendar', itemId: 'w1', label: 'Calendar on Homeroom' },
      ]);
    });

    it('reports a failure when the calendar read throws', async () => {
      const readCalendar = vi.fn().mockRejectedValue(new Error('401'));

      const bundle = await bundleSubShareContent({
        hostUid: 'teacher-1',
        boards: [board('b1', 'Homeroom', [calendarWidget('w1', ['primary'])])],
        services: { readCalendar },
      });

      expect(bundle.items).toEqual([]);
      expect(bundle.failures.map((f) => f.kind)).toEqual(['calendar']);
    });
  });
  describe('flashcards', () => {
    const set = {
      title: 'Cell biology',
      description: 'Unit 3 vocabulary',
      termLanguage: 'en',
      definitionLanguage: 'en',
      cards: [{ id: 'c1', term: 'Mitochondria', definition: 'Powerhouse' }],
      folderId: 'folder-1',
      publicShareId: 'public-abc',
      createdAt: 1,
      updatedAt: 2,
    };

    it('bundles the set the widget is presenting', async () => {
      mockGetDoc.mockResolvedValue(setDoc('s-1', set));

      const bundle = await bundleSubShareContent({
        hostUid: 'teacher-1',
        boards: [board('b1', 'Biology', [flashcardsWidget('w1', 's-1')])],
      });

      expect(bundle.failures).toEqual([]);
      expect(bundle.items.map((i) => i.id)).toEqual(['flashcards_s-1']);
      const payload = bundle.items[0].doc.payload as {
        set: { cards: unknown[] };
      };
      expect(payload.set.cards).toHaveLength(1);
    });

    // `content/` is readable by any verified district account holding the
    // share, and `publicShareId` is a link they could then open.
    it('leaves the public share link and the folder out', async () => {
      mockGetDoc.mockResolvedValue(setDoc('s-1', set));

      const bundle = await bundleSubShareContent({
        hostUid: 'teacher-1',
        boards: [board('b1', 'Biology', [flashcardsWidget('w1', 's-1')])],
      });

      const payload = bundle.items[0].doc.payload as {
        set: Record<string, unknown>;
      };
      expect(Object.keys(payload.set).sort()).toEqual([
        'cards',
        'definitionLanguage',
        'description',
        'id',
        'termLanguage',
        'title',
      ]);
      const json = JSON.stringify(payload.set);
      expect(json).not.toContain('public-abc');
      expect(json).not.toContain('folder-1');
    });

    it('reads the teacher’s own set, not the sub’s', async () => {
      mockGetDoc.mockResolvedValue(setDoc('s-1', set));

      await bundleSubShareContent({
        hostUid: 'teacher-1',
        boards: [board('b1', 'Biology', [flashcardsWidget('w1', 's-1')])],
      });

      expect((doc as Mock).mock.calls.at(-1)?.slice(1)).toEqual([
        'users',
        'teacher-1',
        'flashcard_sets',
        's-1',
      ]);
    });

    it('skips a widget presenting nothing', async () => {
      const bundle = await bundleSubShareContent({
        hostUid: 'teacher-1',
        boards: [board('b1', 'Biology', [flashcardsWidget('w1', null)])],
      });

      expect(bundle.items).toEqual([]);
      expect(bundle.failures).toEqual([]);
    });

    it('reports a set it could not read', async () => {
      mockGetDoc.mockResolvedValue({ exists: () => false });

      const bundle = await bundleSubShareContent({
        hostUid: 'teacher-1',
        boards: [board('b1', 'Biology', [flashcardsWidget('w1', 's-1')])],
      });

      expect(bundle.items).toEqual([]);
      expect(bundle.failures).toEqual([
        { kind: 'flashcards', itemId: 's-1', label: 'Flashcards on Biology' },
      ]);
    });
  });
  // A quiz is an answer key, so it goes to `keys/` rather than `content/`.
  describe('quiz', () => {
    const quizWidget = (id: string, quizId: string | null) =>
      ({
        id,
        type: 'quiz' satisfies WidgetType,
        config: { selectedQuizId: quizId },
      }) as unknown as WidgetData;

    it('bundles the open quiz as a key, field by field', async () => {
      mockGetDoc.mockResolvedValue({
        id: 'q-1',
        exists: () => true,
        data: () => ({
          id: 'q-1',
          title: 'Cells',
          questions: [{ id: 'q1', text: 'Nucleus?', correctAnswer: 'yes' }],
          createdAt: 1,
          updatedAt: 2,
          language: 'es-MX',
          bankSlots: [{ bankId: 'bank-1', count: 3 }],
          syncLinkage: { groupId: 'g-1', lastSyncedVersion: 4 },
          plcSheetUrl: 'https://docs.google.com/spreadsheets/d/x',
        }),
      });

      const bundle = await bundleSubShareContent({
        hostUid: 'teacher-1',
        boards: [board('b1', 'Period 2', [quizWidget('w1', 'q-1')])],
      });

      expect(bundle.items).toEqual([]);
      expect(bundle.keys).toHaveLength(1);
      expect(bundle.keys[0].id).toBe('quiz_q-1');
      expect(bundle.keys[0].doc.payload).toEqual({
        quiz: {
          id: 'q-1',
          title: 'Cells',
          questions: [{ id: 'q1', text: 'Nucleus?', correctAnswer: 'yes' }],
          createdAt: 1,
          updatedAt: 2,
          language: 'es-MX',
        },
      });
    });

    it('reads nothing for a widget with no quiz open', async () => {
      const bundle = await bundleSubShareContent({
        hostUid: 'teacher-1',
        boards: [board('b1', 'Period 2', [quizWidget('w1', null)])],
      });

      expect(mockGetDoc).not.toHaveBeenCalled();
      expect(bundle.keys).toEqual([]);
    });

    it('reads the quiz from the teacher’s own account', async () => {
      mockGetDoc.mockResolvedValue({
        id: 'q-1',
        exists: () => true,
        data: () => ({ title: 'Cells', questions: [] }),
      });

      await bundleSubShareContent({
        hostUid: 'teacher-1',
        boards: [board('b1', 'Period 2', [quizWidget('w1', 'q-1')])],
      });

      expect((doc as Mock).mock.results.at(-1)?.value).toEqual({
        __path: 'users/teacher-1/quizzes/q-1',
      });
    });

    it('reports a quiz it could not read', async () => {
      mockGetDoc.mockResolvedValue({ exists: () => false });

      const bundle = await bundleSubShareContent({
        hostUid: 'teacher-1',
        boards: [board('b1', 'Period 2', [quizWidget('w1', 'q-1')])],
      });

      expect(bundle.keys).toEqual([]);
      expect(bundle.failures).toEqual([
        { kind: 'quiz', itemId: 'q-1', label: 'Quiz on Period 2' },
      ]);
    });
  });

  // A video activity is an answer key too, and unlike a quiz its questions
  // live in the teacher's Drive rather than Firestore.
  describe('video activity', () => {
    const vaWidget = (id: string, activityId: string | null) =>
      ({
        id,
        type: 'video-activity' satisfies WidgetType,
        config: { selectedActivityId: activityId },
      }) as unknown as WidgetData;

    const metaDoc = (fields: Record<string, unknown>) => ({
      id: 'va-1',
      exists: () => true,
      data: () => fields,
    });

    it('bundles the open activity as a key, field by field', async () => {
      mockGetDoc.mockResolvedValue(
        metaDoc({
          id: 'va-1',
          title: 'Mitosis',
          youtubeUrl: 'https://youtu.be/abc',
          driveFileId: 'file-1',
          questionCount: 1,
          createdAt: 1,
          updatedAt: 2,
          folderId: 'folder-9',
          sync: { groupId: 'g-1', lastSyncedVersion: 4 },
        })
      );
      const loadVideoActivity = vi.fn().mockResolvedValue({
        id: 'va-1',
        title: 'Mitosis',
        youtubeUrl: 'https://youtu.be/abc',
        videoDuration: 610,
        questions: [
          { id: 'q1', text: 'Which phase?', type: 'MC', timestamp: 30 },
        ],
        createdAt: 1,
        updatedAt: 2,
      });

      const bundle = await bundleSubShareContent({
        hostUid: 'teacher-1',
        boards: [board('b1', 'Period 2', [vaWidget('w1', 'va-1')])],
        services: { loadVideoActivity },
      });

      expect(loadVideoActivity).toHaveBeenCalledWith('file-1');
      expect(bundle.items).toEqual([]);
      expect(bundle.keys).toHaveLength(1);
      expect(bundle.keys[0].id).toBe('videoActivity_va-1');
      // The PLC sync linkage and the folder are the teacher's own filing.
      expect(bundle.keys[0].doc.payload).toEqual({
        activity: {
          id: 'va-1',
          title: 'Mitosis',
          youtubeUrl: 'https://youtu.be/abc',
          videoDuration: 610,
          questions: [
            { id: 'q1', text: 'Which phase?', type: 'MC', timestamp: 30 },
          ],
          createdAt: 1,
          updatedAt: 2,
        },
      });
    });

    it('reads the metadata from the teacher’s own account', async () => {
      mockGetDoc.mockResolvedValue(
        metaDoc({ title: 'Mitosis', driveFileId: 'file-1' })
      );

      await bundleSubShareContent({
        hostUid: 'teacher-1',
        boards: [board('b1', 'Period 2', [vaWidget('w1', 'va-1')])],
        services: {
          loadVideoActivity: vi.fn().mockResolvedValue({ questions: [] }),
        },
      });

      expect((doc as Mock).mock.results.at(-1)?.value).toEqual({
        __path: 'users/teacher-1/video_activities/va-1',
      });
    });

    it('reads nothing for a widget with no activity open', async () => {
      const loadVideoActivity = vi.fn();
      const bundle = await bundleSubShareContent({
        hostUid: 'teacher-1',
        boards: [board('b1', 'Period 2', [vaWidget('w1', null)])],
        services: { loadVideoActivity },
      });

      expect(mockGetDoc).not.toHaveBeenCalled();
      expect(loadVideoActivity).not.toHaveBeenCalled();
      expect(bundle.keys).toEqual([]);
    });

    // A teacher who never connected Drive gets a line on the share screen,
    // not a widget that silently shows the sub nothing.
    it('reports the activity when no Drive reader was passed', async () => {
      const bundle = await bundleSubShareContent({
        hostUid: 'teacher-1',
        boards: [board('b1', 'Period 2', [vaWidget('w1', 'va-1')])],
      });

      expect(bundle.keys).toEqual([]);
      expect(bundle.failures).toEqual([
        {
          kind: 'videoActivity',
          itemId: 'va-1',
          label: 'Video activity on Period 2',
        },
      ]);
    });

    it('reports an activity whose Drive file could not be read', async () => {
      mockGetDoc.mockResolvedValue(
        metaDoc({ title: 'Mitosis', driveFileId: 'file-1' })
      );

      const bundle = await bundleSubShareContent({
        hostUid: 'teacher-1',
        boards: [board('b1', 'Period 2', [vaWidget('w1', 'va-1')])],
        services: {
          loadVideoActivity: vi.fn().mockRejectedValue(new Error('403')),
        },
      });

      expect(bundle.keys).toEqual([]);
      expect(bundle.failures).toEqual([
        {
          kind: 'videoActivity',
          itemId: 'va-1',
          label: 'Video activity on Period 2',
        },
      ]);
    });

    it('reports an activity whose metadata names no Drive file', async () => {
      mockGetDoc.mockResolvedValue(metaDoc({ title: 'Mitosis' }));
      const loadVideoActivity = vi.fn();

      const bundle = await bundleSubShareContent({
        hostUid: 'teacher-1',
        boards: [board('b1', 'Period 2', [vaWidget('w1', 'va-1')])],
        services: { loadVideoActivity },
      });

      expect(loadVideoActivity).not.toHaveBeenCalled();
      expect(bundle.failures).toHaveLength(1);
    });
  });

  // A guided learning set carries its answers into `keys/` like the other two,
  // but a building set is a reference the sub can read for themselves.
  describe('guided learning', () => {
    const glWidget = (id: string, setId: string | null) =>
      ({
        id,
        type: 'guided-learning' satisfies WidgetType,
        config: { view: 'player', playerSetId: setId },
      }) as unknown as WidgetData;

    const personalMeta = (fields: Record<string, unknown>) => ({
      id: 'set-1',
      exists: () => true,
      data: () => fields,
    });

    const fullSet = (extra: Record<string, unknown> = {}) => ({
      id: 'set-1',
      schemaVersion: 3,
      title: 'Plant cell',
      imageUrls: ['https://storage/one?token=abc'],
      mode: 'guided',
      createdAt: 1,
      updatedAt: 2,
      steps: [
        {
          id: 's1',
          xPct: 10,
          yPct: 20,
          imageIndex: 0,
          interactionType: 'question',
          question: {
            type: 'multiple-choice',
            text: 'Which part?',
            choices: ['Nucleus', 'Wall'],
            correctAnswer: 'Nucleus',
          },
          tour: { anchorId: 'a1' },
        },
      ],
      ...extra,
    });

    it('bundles the open set as a key, answers and all', async () => {
      mockGetDoc.mockResolvedValue(
        personalMeta({ title: 'Plant cell', driveFileId: 'file-1' })
      );
      const loadGuidedLearningSet = vi.fn().mockResolvedValue(fullSet());

      const bundle = await bundleSubShareContent({
        hostUid: 'teacher-1',
        boards: [board('b1', 'Period 2', [glWidget('w1', 'set-1')])],
        services: { loadGuidedLearningSet },
      });

      expect(loadGuidedLearningSet).toHaveBeenCalledWith('file-1');
      expect(bundle.items).toEqual([]);
      expect(bundle.keys).toHaveLength(1);
      expect(bundle.keys[0].id).toBe('guidedLearning_set-1');
      const payload = bundle.keys[0].doc.payload as {
        set: { steps: { question?: { correctAnswer?: string } }[] };
      };
      // The whole point of `keys/`: the sub covering the lesson sees the key.
      expect(payload.set.steps[0].question?.correctAnswer).toBe('Nucleus');
    });

    // `types.ts` calls the live-tour binding teacher-only, and the author's uid
    // and raw Storage paths are no use to a sub who cannot read them.
    it('leaves the teacher-only parts behind', async () => {
      mockGetDoc.mockResolvedValue(
        personalMeta({ title: 'Plant cell', driveFileId: 'file-1' })
      );
      const loadGuidedLearningSet = vi
        .fn()
        .mockResolvedValue(
          fullSet({ authorUid: 'teacher-1', imagePaths: ['gl/teacher-1/one'] })
        );

      const bundle = await bundleSubShareContent({
        hostUid: 'teacher-1',
        boards: [board('b1', 'Period 2', [glWidget('w1', 'set-1')])],
        services: { loadGuidedLearningSet },
      });

      const set = (
        bundle.keys[0].doc.payload as {
          set: Record<string, unknown> & {
            steps: Record<string, unknown>[];
          };
        }
      ).set;
      expect('authorUid' in set).toBe(false);
      expect('imagePaths' in set).toBe(false);
      expect('tour' in set.steps[0]).toBe(false);
      // The tokenized urls are what a sub can actually read, so they stay.
      expect(set.imageUrls).toEqual(['https://storage/one?token=abc']);
    });

    // A building set is world-readable, so bundling it would duplicate a doc
    // the sub reads anyway — and reporting it would be a lie.
    it('bundles nothing for a building set and reports no failure', async () => {
      mockGetDoc
        .mockResolvedValueOnce({ exists: () => false })
        .mockResolvedValueOnce({ exists: () => true, data: () => ({}) });
      const loadGuidedLearningSet = vi.fn();

      const bundle = await bundleSubShareContent({
        hostUid: 'teacher-1',
        boards: [board('b1', 'Period 2', [glWidget('w1', 'set-1')])],
        services: { loadGuidedLearningSet },
      });

      expect(loadGuidedLearningSet).not.toHaveBeenCalled();
      expect(bundle.keys).toEqual([]);
      expect(bundle.failures).toEqual([]);
    });

    it('reports a set that is neither the teacher’s nor a building set', async () => {
      mockGetDoc.mockResolvedValue({ exists: () => false });

      const bundle = await bundleSubShareContent({
        hostUid: 'teacher-1',
        boards: [board('b1', 'Period 2', [glWidget('w1', 'set-1')])],
        services: { loadGuidedLearningSet: vi.fn() },
      });

      expect(bundle.failures).toEqual([
        {
          kind: 'guidedLearning',
          itemId: 'set-1',
          label: 'Guided activity on Period 2',
        },
      ]);
    });

    it('reads nothing for a widget with no set open', async () => {
      const loadGuidedLearningSet = vi.fn();
      const bundle = await bundleSubShareContent({
        hostUid: 'teacher-1',
        boards: [board('b1', 'Period 2', [glWidget('w1', null)])],
        services: { loadGuidedLearningSet },
      });

      expect(mockGetDoc).not.toHaveBeenCalled();
      expect(loadGuidedLearningSet).not.toHaveBeenCalled();
      expect(bundle.keys).toEqual([]);
    });

    it('reports a set whose Drive file could not be read', async () => {
      mockGetDoc.mockResolvedValue(
        personalMeta({ title: 'Plant cell', driveFileId: 'file-1' })
      );

      const bundle = await bundleSubShareContent({
        hostUid: 'teacher-1',
        boards: [board('b1', 'Period 2', [glWidget('w1', 'set-1')])],
        services: {
          loadGuidedLearningSet: vi.fn().mockRejectedValue(new Error('403')),
        },
      });

      expect(bundle.keys).toEqual([]);
      expect(bundle.failures).toHaveLength(1);
    });
  });
});
