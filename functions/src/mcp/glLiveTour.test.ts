import { describe, expect, it, vi } from 'vitest';
import type { ToolContext } from './activity';
import {
  ADMIN_ONLY_TOOLS,
  applyStepText,
  assertPlays,
  buildHelpItem,
  checkTour,
  insertOpenDockStep,
  liveTourView,
  mergeTourSteps,
  needsAnchors,
  parseCategories,
  publicTourStep,
  readyAnchorRef,
  notesToClear,
  clearedNotes,
  tourHealth,
  tourStep,
  tourPublishState,
  updateBookends,
  healthOf,
  loadTour,
} from './glLiveTour';
import type { Step } from './glTools';
import { buildTourSetup } from './tourSetup';
import { hiddenToolsFor } from './tools';
import { tourPlaytestKey } from './tourPlaytest';

const resultsOn = vi.hoisted(() => ({ value: false }));
vi.mock('./miniAppTools', async (importActual) => ({
  ...(await importActual<typeof import('./miniAppTools')>()),
  miniAppResultsOn: () => Promise.resolve(resultsOn.value),
}));

const ctxFor = (exists: boolean | Error): ToolContext =>
  ({
    uid: 'u1',
    email: 'Admin@School.org',
    grantId: 'g',
    db: {
      collection: () => ({
        doc: () => ({
          get: () =>
            exists instanceof Error
              ? Promise.reject(exists)
              : Promise.resolve({ exists }),
        }),
      }),
    },
  }) as unknown as ToolContext;

describe('live tour tools', () => {
  it('lists the steps that work from their English fallback only', () => {
    expect(
      needsAnchors([
        { id: 'a', tour: { anchor: '', action: 'click' } },
        { id: 'b', tour: { anchor: 'board.whole', action: 'observe' } },
        { id: 'c' },
      ] as unknown as Parameters<typeof needsAnchors>[0])
    ).toMatchObject({ needs_anchors: ['a'] });
    expect(needsAnchors([])).toEqual({});
  });

  it('lists the saved categories in order, or the app defaults', () => {
    expect(
      parseCategories({
        categories: [
          { id: 'b', name: 'B', order: 2 },
          { id: 'a', name: 'A', order: 1 },
          { id: 7 },
        ],
      })
    ).toEqual([
      { id: 'a', name: 'A', order: 1 },
      { id: 'b', name: 'B', order: 2 },
    ]);
    expect(parseCategories(undefined).map((c) => c.id)).toEqual([
      'getting-started',
      'boards-widgets',
      'quizzes-activities',
      'sharing-classes',
      'admin',
    ]);
  });

  it('builds a hidden Help Center item with only the allowed fields', () => {
    const item = buildHelpItem(
      { category_id: 'admin', widget_types: ['clock', 'clock'] },
      { id: 'set1', title: 'Use the clock' },
      {
        id: 'h1',
        uid: 'u1',
        email: 'a@b.org',
        orgId: null,
        order: 3,
        now: 5,
      }
    );
    expect(item).toEqual({
      id: 'h1',
      kind: 'guided-learning',
      title: 'Use the clock',
      description: '',
      categoryId: 'admin',
      order: 3,
      visible: false,
      orgId: null,
      widgetTypes: ['clock'],
      url: null,
      embedType: null,
      setId: 'set1',
      openCount: 0,
      createdBy: 'u1',
      createdByEmail: 'a@b.org',
      createdAt: 5,
      updatedAt: 5,
    });
  });

  it('takes a binding plus words, and refuses slide, overlay, question and media fields', () => {
    const base = {
      id: 's1',
      text: 'Open the dock.',
      tour: { anchor: 'dock.open-tools', action: 'click' },
    };
    expect(tourStep.safeParse(base).success).toBe(true);
    for (const extra of [
      { imageIndex: 0 },
      { xPct: 50, yPct: 50 },
      { region: { shape: 'rect', wPct: 10, hPct: 10 } },
      { calloutTone: 'light' },
      { interactionType: 'tooltip' },
      { showOverlay: 'banner' },
      { audioUrl: 'https://example.com/a.mp3' },
      { question: { type: 'multiple-choice', text: 'Q?' } },
      { panZoomScale: 2 },
    ])
      expect(tourStep.safeParse({ ...base, ...extra }).success).toBe(false);
    expect(tourStep.safeParse({ ...base, tour: undefined }).success).toBe(
      false
    );
  });

  it('hides the admin tools from everyone but admins', async () => {
    const admin = await hiddenToolsFor(ctxFor(true));
    for (const t of ADMIN_ONLY_TOOLS) expect(admin.has(t)).toBe(false);
    for (const ctx of [ctxFor(false), ctxFor(new Error('down'))]) {
      const hidden = await hiddenToolsFor(ctx);
      for (const t of ADMIN_ONLY_TOOLS) expect(hidden.has(t)).toBe(true);
    }
  });

  it('hides the Mini App results summary while results are off, never the spec', async () => {
    const hidden = await hiddenToolsFor(ctxFor(false));
    expect(hidden.has('get_mini_app_spec')).toBe(false);
    expect(hidden.has('get_mini_app_results_summary')).toBe(true);
    resultsOn.value = true;
    const shown = await hiddenToolsFor(ctxFor(false));
    resultsOn.value = false;
    expect(shown.has('get_mini_app_spec')).toBe(false);
    expect(shown.has('get_mini_app_results_summary')).toBe(false);
  });
});

const thumb = {
  url: 'https://x/t.png',
  anchor: 'dock.open-tools',
  w: 10,
  h: 10,
};
const stored = (over: Record<string, unknown> = {}) =>
  ({
    id: 's1',
    imageIndex: 0,
    xPct: 50,
    yPct: 50,
    interactionType: 'tooltip',
    text: 'Open the dock.',
    narration: { source: 'generated' },
    tour: { anchor: 'dock.open-tools', action: 'click', thumbnail: thumb },
    ...over,
  }) as Step;

describe('get_live_tour and update_live_tour', () => {
  it('shows a step without slide placement and with the thumbnail as a flag', () => {
    expect(publicTourStep(stored())).toEqual({
      id: 's1',
      text: 'Open the dock.',
      has_narration: true,
      tour: { anchor: 'dock.open-tools', action: 'click' },
      has_thumbnail: true,
    });
    const moved = stored({
      tour: { anchor: 'board.whole', action: 'observe', thumbnail: thumb },
    });
    expect(publicTourStep(moved).thumbnail_stale).toBe(true);
    expect(publicTourStep(stored({ tour: undefined })).has_thumbnail).toBe(
      false
    );
  });

  it('reports draft, published and changed', () => {
    expect(tourPublishState(10, null)).toBe('draft');
    expect(tourPublishState(10, 10)).toBe('published');
    expect(tourPublishState(11, 10)).toBe('changed');
  });

  it('lists steps whose anchor is no longer registered', () => {
    const view = liveTourView(
      {
        id: 'set1',
        title: 'T',
        imageUrls: [],
        mode: 'tour',
        updatedAt: 5,
        tourSetup: { widgets: ['clock'], autopilot: true },
        steps: [stored(), stored({ id: 's2', tour: { anchor: 'gone.x' } })],
      },
      3
    );
    expect(view).toMatchObject({
      publish_state: 'changed',
      tour_widgets: ['clock'],
      autopilot: true,
      steps_with_unregistered_anchor: ['s2'],
    });
  });

  it('round-trips a step, keeping its thumbnail, narration and slide placement', () => {
    const shown = publicTourStep(stored()) as Parameters<
      typeof mergeTourSteps
    >[1][number];
    const [kept, added] = mergeTourSteps(
      [stored()],
      [
        { ...shown, text: 'Open the dock now.' },
        {
          id: 'new',
          text: 'The whole board.',
          tour: { anchor: 'board.whole', action: 'observe' },
        },
      ]
    );
    expect(kept).toMatchObject({
      text: 'Open the dock now.',
      imageIndex: 0,
      narration: { source: 'generated' },
      tour: { anchor: 'dock.open-tools', action: 'click', thumbnail: thumb },
    });
    expect(kept).not.toHaveProperty('has_thumbnail');
    expect(added).not.toHaveProperty('imageIndex');
    expect(added.tour).toEqual({ anchor: 'board.whole', action: 'observe' });
  });

  it('refuses an anchor the app does not register', () => {
    expect(() =>
      mergeTourSteps(
        [],
        [
          {
            id: 'a',
            tour: { anchor: 'not.real', action: 'click' },
          },
        ]
      )
    ).toThrow('is not a SpartBoard tour anchor');
  });

  it('keeps get, update and the step picture admin-only', () => {
    expect(ADMIN_ONLY_TOOLS.has('get_live_tour')).toBe(true);
    expect(ADMIN_ONLY_TOOLS.has('update_live_tour')).toBe(true);
    expect(ADMIN_ONLY_TOOLS.has('get_live_tour_step_picture')).toBe(true);
  });

  it("changes only the named steps' wording with step_text", () => {
    const steps = [stored(), stored({ id: 's2', label: 'Old', text: 'Old.' })];
    const next = applyStepText(steps, [
      {
        id: 's2',
        label: '',
        text: 'Turn on the switch.\n\nIt syncs every team.',
      },
    ]);
    expect(next[0]).toBe(steps[0]);
    expect(next[1]).not.toHaveProperty('label');
    expect(next[1]).toMatchObject({
      text: 'Turn on the switch.\n\nIt syncs every team.',
      narration: { source: 'generated' },
      tour: { anchor: 'dock.open-tools', action: 'click', thumbnail: thumb },
    });
    expect(() => applyStepText(steps, [{ id: 'gone', text: 'x' }])).toThrow(
      'no step has id "gone"'
    );
    expect(() => applyStepText(steps, [{ id: 's1', text: 'a\nb' }])).toThrow(
      'one paragraph'
    );
    expect(() =>
      applyStepText(steps, [
        { id: 's1', text: 'a' },
        { id: 's1', label: 'b' },
      ])
    ).toThrow('twice');
  });

  it('offers the anchor a recorded control was tagged with, as Rebind would write it', () => {
    expect(
      readyAnchorRef({
        status: 'pr-open',
        anchorId: 'connected-apps.google-tasks-sync',
      })
    ).toBe('connected-apps.google-tasks-sync');
    expect(
      readyAnchorRef({
        status: 'mapped',
        anchorId: 'dock.item',
        widgetType: 'clock',
      })
    ).toBe('dock.item:clock');
    expect(
      readyAnchorRef({
        status: 'mapped',
        anchorId: 'settings.toggle:clock#format24',
      })
    ).toBe('settings.toggle:clock#format24');
    expect(
      readyAnchorRef({ status: 'mapped', anchorId: 'settings.toggle:clock' })
    ).toBeNull();
    expect(
      readyAnchorRef({ status: 'mapped', anchorId: 'dock.item' })
    ).toBeNull();
    expect(
      readyAnchorRef({ status: 'open', anchorId: 'dock.open-tools' })
    ).toBeNull();
    expect(
      readyAnchorRef({ status: 'rebound', anchorId: 'dock.open-tools' })
    ).toBeNull();
    expect(
      readyAnchorRef({ status: 'pr-open', anchorId: 'not.shipped' })
    ).toBeNull();
  });

  it('shows anchor_ready and drops it again on the way back in', () => {
    const recorded = stored({
      tour: {
        anchor: '',
        action: 'toggle',
        value: true,
        fallback: { role: 'switch', name: 'send to google tasks' },
        unmapped: 'f'.repeat(40),
      },
    });
    const view = liveTourView(
      {
        id: 't',
        title: 'T',
        imageUrls: [],
        mode: 'tour',
        updatedAt: 1,
        steps: [recorded],
      },
      null,
      new Map([['s1', 'connected-apps.google-tasks-sync']])
    );
    const shown = view.steps[0] as Parameters<typeof mergeTourSteps>[1][number];
    expect(shown.anchor_ready).toBe('connected-apps.google-tasks-sync');
    const [kept] = mergeTourSteps(
      [recorded],
      [
        {
          ...shown,
          tour: { ...shown.tour, anchor: shown.anchor_ready as string },
        },
      ]
    );
    expect(kept).not.toHaveProperty('anchor_ready');
    expect(kept.tour).toMatchObject({
      anchor: 'connected-apps.google-tasks-sync',
    });
  });
});

describe('connector v2 setup and checks', () => {
  const step = (id: string, anchor: string, action = 'observe'): Step => ({
    id,
    imageIndex: 0,
    interactionType: 'tooltip',
    text: 'Look here.',
    tour: { anchor, action },
  });

  it('refuses a save that would break playback, listing every problem', () => {
    const report = checkTour(
      [
        step('a', 'board.whole'),
        step('b', 'sidebar.classes', 'click'),
        step('c', 'dock.item', 'click'),
      ],
      { widgets: [] }
    );
    expect(report.errors).toHaveLength(2);
    expect(() => assertPlays(report)).toThrow(
      /Not saved[\s\S]*sidebar\.open-menu[\s\S]*dock\.item:<type>/
    );
    expect(() => assertPlays({ errors: [], warnings: [] })).not.toThrow();
  });

  it('builds the setup from passed fields over the stored ones', () => {
    const layout = {
      slot: 0,
      type: 'time-tool',
      xProp: 0.1,
      yProp: 0.1,
      wProp: 0.3,
      hProp: 0.3,
    };
    expect(
      buildTourSetup(
        { tour_widgets: ['clock'], layouts: [layout], autopilot: true },
        undefined
      )
    ).toEqual({
      widgets: ['clock', 'time-tool'],
      layouts: [layout],
      autopilot: true,
    });
    expect(
      buildTourSetup({ use_teacher_board: true }, undefined, {
        widgets: ['clock'],
        autopilot: true,
      })
    ).toEqual({ widgets: ['clock'], useTeacherBoard: true, autopilot: true });
    expect(() =>
      buildTourSetup(
        { layouts: [layout, { ...layout, type: 'clock' }] },
        undefined
      )
    ).toThrow('slot 0 is used twice');
  });

  const sampleTour = (): Parameters<typeof liveTourView>[0] => ({
    id: 't',
    title: 'Tour',
    imageUrls: [],
    mode: 'tour',
    updatedAt: 1,
    steps: [step('a', 'board.whole')],
    tourSetup: {
      widgets: ['clock'],
      useTeacherBoard: true,
      materials: [
        {
          id: 'm1',
          kind: 'quiz',
          source: 'sample',
          label: 'A quiz',
          sample: { meta: {}, data: {}, fromId: 'q1', title: 'Fractions' },
        },
      ],
    },
  });

  it('shows the full setup and only the fields update_live_tour takes back', () => {
    const view = liveTourView(sampleTour(), null);
    expect(view).toMatchObject({
      tour_widgets: ['clock'],
      use_teacher_board: true,
      materials: [
        {
          id: 'm1',
          kind: 'quiz',
          source: 'sample',
          label: 'A quiz',
          from_id: 'q1',
          from_title: 'Fractions',
        },
      ],
    });
    expect(view.steps[0]).not.toHaveProperty('interactionType');
    expect(view.steps[0]).not.toHaveProperty('imageIndex');
    expect(view.materials?.[0]).not.toHaveProperty('sample');
  });

  it('keeps sample content for a browser run', () => {
    const view = liveTourView(sampleTour(), null, new Map(), true);
    expect(view.materials?.[0]).toMatchObject({
      id: 'm1',
      sample: { fromId: 'q1', title: 'Fractions' },
    });
  });
});

describe('the Open Tools step', () => {
  const at = (id: string, anchor: string, action = 'click') => ({
    id,
    tour: { anchor, action },
  });
  const ids = (steps: readonly { id: string }[]) => steps.map((s) => s.id);

  it('leaves a tour with no Dock step alone', () => {
    const steps = [
      at('intro', 'board.whole', 'observe'),
      at('gear', 'widget.settings-opener:clock'),
    ];
    expect(insertOpenDockStep(steps)).toEqual({ steps, inserted: [] });
  });

  it('leaves a tour that already clicks Open Tools first alone', () => {
    const steps = [
      at('intro', 'board.whole', 'observe'),
      at('open', 'dock.open-tools'),
      at('timer', 'dock.item:timer'),
    ];
    expect(insertOpenDockStep(steps).inserted).toEqual([]);
  });

  it('adds Open Tools before the first Dock step', () => {
    const { steps, inserted } = insertOpenDockStep([
      at('intro', 'board.whole', 'observe'),
      at('more', 'dock.more-widgets'),
      at('timer', 'dock.item:timer'),
    ]);
    expect(ids(steps)).toEqual(['intro', 'open-dock', 'more', 'timer']);
    expect(steps[1]).toEqual({
      id: 'open-dock',
      label: 'Open the Dock',
      text: 'Click **Open Tools** to open the Dock.',
      tour: { anchor: 'dock.open-tools', action: 'click' },
    });
    expect(inserted).toEqual([
      {
        id: 'open-dock',
        label: 'Open the Dock',
        text: 'Click **Open Tools** to open the Dock.',
        before: 'more',
      },
    ]);
  });

  it('counts an Open Tools click only before the Dock step, and picks a free id', () => {
    const { steps } = insertOpenDockStep([
      at('open-dock', 'board.whole', 'observe'),
      at('timer', 'dock.item:timer'),
      at('open-dock-2', 'dock.open-tools'),
    ]);
    expect(ids(steps)).toEqual([
      'open-dock',
      'open-dock-3',
      'timer',
      'open-dock-2',
    ]);
  });

  it('refuses a broken bookend on update only when the stored tour had them', () => {
    const step = (id: string, anchor: string, action = 'observe') =>
      ({
        id,
        interactionType: 'tooltip',
        tour: { anchor, action },
      }) as unknown as Step;
    expect(
      updateBookends([step('a', 'board.whole'), step('b', 'board.whole')])
    ).toBe('error');
    expect(
      updateBookends([
        step('a', 'dock.item:timer', 'click'),
        step('b', 'board.whole'),
      ])
    ).toBe('warn');
  });
});

describe('notes, playtest and health', () => {
  const note = { text: 'Point at the gear', by: 'admin@school.org', at: 0 };
  const tour = (over: Record<string, unknown> = {}) => ({
    id: 'set1',
    title: 'T',
    imageUrls: [],
    mode: 'tour',
    updatedAt: 5,
    steps: [
      stored(),
      stored({ id: 's2', tour: { anchor: 'board.whole', action: 'observe' } }),
    ],
    ...over,
  });

  it('returns notes from the review doc on the tour and its steps', () => {
    const view = liveTourView(tour(), null, new Map(), false, undefined, {
      tourNote: note,
      stepNotes: { s1: note, gone: note },
    });
    expect(view.review_note).toEqual({
      text: 'Point at the gear',
      by: 'admin@school.org',
      at: '1970-01-01T00:00:00.000Z',
    });
    expect(view.steps[0]).toMatchObject({ review_note: { text: note.text } });
    expect(view.steps[1]).not.toHaveProperty('review_note');
    const [kept] = mergeTourSteps(tour().steps, [
      view.steps[0] as Parameters<typeof mergeTourSteps>[1][number],
    ]);
    expect(kept).not.toHaveProperty('review_note');
    expect(kept).not.toHaveProperty('reviewNote');
  });

  it('clears resolved notes and refuses an unknown id', () => {
    const steps = tour().steps;
    expect(notesToClear(steps, steps, ['s1', 'tour'])).toEqual(['s1', 'tour']);
    expect(() => notesToClear(steps, steps, ['nope'])).toThrow(
      'resolved_notes: "nope"'
    );
    // Removing a step can resolve its note, and clears it even when not named.
    expect(notesToClear(steps, [steps[1]], ['s1'])).toEqual(['s1']);
    expect(notesToClear(steps, [steps[1]], [])).toEqual(['s1']);
    const update = clearedNotes(['tour', 's1', 's2']);
    expect(Object.keys(update).sort()).toEqual(['stepNotes', 'tourNote']);
    expect(Object.keys(update.stepNotes as object)).toEqual(['s1', 's2']);
  });

  it('marks the playtest stale once the steps change', () => {
    const steps = tour().steps;
    const playtest = {
      at: 0,
      by: 'admin@school.org',
      fingerprint: tourPlaytestKey(steps),
      steps: [
        { stepId: 's1', result: 'missing' },
        { stepId: 's2', result: 'not-reached' },
      ],
    };
    const view = (over: Record<string, unknown>) =>
      liveTourView(tour(over), null, new Map(), false, undefined, {
        playtest,
      });
    expect(view({}).last_playtest).toEqual({
      at: '1970-01-01T00:00:00.000Z',
      by: 'admin@school.org',
      stale: false,
      steps: [
        { step_id: 's1', result: 'missing' },
        { step_id: 's2', result: 'not-reached' },
      ],
    });
    expect(view({ steps: [...steps].reverse() }).last_playtest?.stale).toBe(
      true
    );
    expect(liveTourView(tour(), null)).not.toHaveProperty('last_playtest');
  });

  it('counts only runs of the published version and names no teacher', () => {
    const health = tourHealth(
      [
        { v: 7, done: true, misses: ['s2'] },
        { v: 7, done: false, exit: 1, misses: ['s2', 's2'] },
        { v: 7, done: false, exit: 1, misses: [] },
        { v: 7, done: false, exit: 0, misses: ['s1'] },
        { v: 3, done: false, exit: 0, misses: ['s1'] },
      ],
      [{ id: 's1' }, { id: 's2' }],
      7
    );
    expect(health).toEqual({
      runs: 4,
      completed: 1,
      most_left_from: { step_id: 's2', runs: 2 },
      missed: [
        { step_id: 's2', runs: 2 },
        { step_id: 's1', runs: 1 },
      ],
    });
    expect(tourHealth([], [], 7)).toEqual({
      runs: 0,
      completed: 0,
      missed: [],
    });
  });
});

describe('web tours', () => {
  const ctxWith = (docs: Record<string, Record<string, unknown>>) =>
    ({
      uid: 'u1',
      email: 'admin@school.org',
      grantId: 'g',
      db: {
        doc: (path: string) => ({
          get: () =>
            Promise.resolve({
              exists: path in docs,
              data: () => docs[path],
              get: (k: string) => docs[path]?.[k],
            }),
        }),
        collection: () => {
          throw new Error('runs are never read for a web tour');
        },
      },
    }) as unknown as ToolContext;

  it('refuses a web tour in every live tour tool', async () => {
    const ctx = ctxWith({
      'building_guided_learning/t1': {
        mode: 'tour',
        surface: 'web',
        steps: [],
      },
      'building_guided_learning/t2': { mode: 'tour', steps: [] },
    });
    await expect(loadTour(ctx, 't1')).rejects.toThrow(/web tour/);
    await expect(loadTour(ctx, 't2')).resolves.toMatchObject({
      set: { id: 't2' },
    });
  });

  it('leaves health out for a web snapshot', async () => {
    const ctx = ctxWith({
      'building_guided_learning_tours/t1': {
        surface: 'web',
        set: { steps: [{ id: 'a' }] },
        publishedAt: 1,
      },
      'building_guided_learning_tours/t3': {
        set: { surface: 'web', steps: [{ id: 'a' }] },
        publishedAt: 1,
      },
    });
    await expect(healthOf(ctx, 't1')).resolves.toBeUndefined();
    await expect(healthOf(ctx, 't3')).resolves.toBeUndefined();
  });
});
