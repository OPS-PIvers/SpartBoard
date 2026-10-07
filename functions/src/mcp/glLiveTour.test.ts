import { describe, expect, it } from 'vitest';
import type { ToolContext } from './activity';
import {
  ADMIN_ONLY_TOOLS,
  buildHelpItem,
  parseCategories,
  tourStep,
} from './glLiveTour';
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
