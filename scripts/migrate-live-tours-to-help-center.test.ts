import { describe, expect, it } from 'vitest';
import {
  hiddenHelpItem,
  planMigration,
} from './migrate-live-tours-to-help-center.mjs';

const NOW = 1_700_000_000_000;

const tour = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  mode: 'tour',
  title: `Tour ${id}`,
  authorUid: 'admin-1',
  ...extra,
});

describe('planMigration', () => {
  it('files every unlinked Live tour as a Hidden, Unfiled global item and flags it', () => {
    const plan = planMigration([tour('t1')], [], NOW);
    expect(plan.create).toEqual([
      {
        id: 't1',
        kind: 'guided-learning',
        title: 'Tour t1',
        description: '',
        categoryId: '',
        order: 0,
        visible: false,
        orgId: null,
        widgetTypes: [],
        url: null,
        embedType: null,
        setId: 't1',
        openCount: 0,
        createdBy: 'admin-1',
        createdByEmail: '',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);
    expect(plan.flag).toEqual(['t1']);
  });

  it('keeps a linked tour item unchanged but still flags the set when needed', () => {
    const items = [{ id: 'item-1', setId: 't1', visible: true }];
    const plan = planMigration(
      [tour('t1'), tour('t2', { helpCenter: true })],
      [...items, { id: 'item-2', setId: 't2' }],
      NOW
    );
    expect(plan.create).toEqual([]);
    expect(plan.flag).toEqual(['t1']);
  });

  it('skips Web tours, Picture guides and sets without a mode', () => {
    const plan = planMigration(
      [
        tour('web', { surface: 'web' }),
        { id: 'pic', title: 'Pictures', mode: 'guided' },
        { id: 'plain', title: 'Plain' },
      ],
      [],
      NOW
    );
    expect(plan).toEqual({ create: [], flag: [] });
  });

  it('takes an older set the index marks as a tour by its stored flag', () => {
    const plan = planMigration(
      [{ id: 'old', title: 'Old tour', mode: 'guided', hasLiveTour: true }],
      [],
      NOW
    );
    expect(plan.create.map((item) => item.setId)).toEqual(['old']);
    expect(plan.flag).toEqual(['old']);
  });

  it('does not flag a tour already marked helpCenter', () => {
    const plan = planMigration([tour('t1', { helpCenter: true })], [], NOW);
    expect(plan.create.map((item) => item.setId)).toEqual(['t1']);
    expect(plan.flag).toEqual([]);
  });

  it('picks a free id when the tour id is already an item id', () => {
    const plan = planMigration(
      [tour('t1')],
      [
        { id: 't1', setId: 'other' },
        { id: 't1-2', setId: 'another' },
      ],
      NOW
    );
    expect(plan.create.map((item) => item.id)).toEqual(['t1-3']);
  });

  it('truncates a fractional clock to an integer', () => {
    const plan = planMigration([tour('t1')], [], NOW + 0.7);
    expect(plan.create[0].createdAt).toBe(NOW);
    expect(Number.isInteger(plan.create[0].updatedAt)).toBe(true);
  });
});

describe('hiddenHelpItem', () => {
  it('trims and caps the title and description, with fallbacks', () => {
    const item = hiddenHelpItem(
      'x',
      { id: 's', title: '   ', description: ` ${'d'.repeat(1200)} ` },
      NOW
    );
    expect(item.title).toBe('Untitled guide');
    expect(item.description).toHaveLength(1000);
    expect(item.createdBy).toBe('migration');
    expect(
      hiddenHelpItem('x', { id: 's', title: 'a'.repeat(300) }, NOW).title
    ).toHaveLength(200);
  });
});
