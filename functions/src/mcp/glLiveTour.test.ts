import { describe, expect, it } from 'vitest';
import type { ToolContext } from './activity';
import {
  ADMIN_ONLY_TOOLS,
  buildHelpItem,
  liveTourView,
  mergeTourSteps,
  parseCategories,
  publicTourStep,
  tourStep,
  tourPublishState,
} from './glLiveTour';
import type { Step } from './glTools';
import { hiddenToolsFor } from './tools';

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

  it('takes tour steps without slide placement and refuses it', () => {
    const base = {
      id: 's1',
      interactionType: 'tooltip',
      text: 'Open the dock.',
      tour: { anchor: 'dock.open-tools', action: 'click' },
    };
    expect(tourStep.safeParse(base).success).toBe(true);
    for (const extra of [
      { imageIndex: 0 },
      { xPct: 50, yPct: 50 },
      { region: { shape: 'rect', wPct: 10, hPct: 10 } },
      { calloutTone: 'light' },
    ])
      expect(tourStep.safeParse({ ...base, ...extra }).success).toBe(false);
    expect(tourStep.safeParse({ ...base, tour: undefined }).success).toBe(
      false
    );
  });

  it('hides the admin tools from everyone but admins', async () => {
    expect(await hiddenToolsFor(ctxFor(true))).toEqual(new Set());
    expect(await hiddenToolsFor(ctxFor(false))).toBe(ADMIN_ONLY_TOOLS);
    expect(await hiddenToolsFor(ctxFor(new Error('down')))).toBe(
      ADMIN_ONLY_TOOLS
    );
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
      interactionType: 'tooltip',
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
          interactionType: 'tooltip',
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
            interactionType: 'tooltip',
            tour: { anchor: 'not.real', action: 'click' },
          },
        ]
      )
    ).toThrow('is not a SpartBoard tour anchor');
  });

  it('keeps get and update admin-only', () => {
    expect(ADMIN_ONLY_TOOLS.has('get_live_tour')).toBe(true);
    expect(ADMIN_ONLY_TOOLS.has('update_live_tour')).toBe(true);
  });
});
