import { describe, it, expect } from 'vitest';
import type { PlcActionItem } from '@/types';
import {
  applyVisibleReorder,
  filterActionItems,
  isActionItemOverdue,
  isDefaultActionItemView,
  sortActionItems,
  visibleActionItems,
  DEFAULT_ACTION_ITEM_VIEW,
  type ActionItemView,
} from '@/utils/plcActionItemView';

const NOW = new Date(2026, 8, 18, 10, 30).getTime();
const day = (offset: number) => new Date(2026, 8, 18 + offset).getTime();

function item(over: Partial<PlcActionItem> & { id: string }): PlcActionItem {
  return {
    text: 'Task',
    done: false,
    createdBy: 'u0',
    createdAt: 0,
    ...over,
  };
}

const view = (over: Partial<ActionItemView> = {}): ActionItemView => ({
  ...DEFAULT_ACTION_ITEM_VIEW,
  ...over,
});

const ids = (items: readonly PlcActionItem[]) => items.map((i) => i.id);

const NAMES: Record<string, string> = { u1: 'Alice', u2: 'bob', u3: 'Carol' };
const nameFor = (uid: string) => NAMES[uid] ?? '';

describe('isActionItemOverdue', () => {
  it('is false on the due date itself', () => {
    expect(isActionItemOverdue(item({ id: 'a', dueAt: day(0) }), NOW)).toBe(
      false
    );
  });

  it('is true once the due date has passed', () => {
    expect(isActionItemOverdue(item({ id: 'a', dueAt: day(-1) }), NOW)).toBe(
      true
    );
  });

  it('is false for a done item', () => {
    expect(
      isActionItemOverdue(item({ id: 'a', dueAt: day(-1), done: true }), NOW)
    ).toBe(false);
  });

  it('is false with no due date', () => {
    expect(isActionItemOverdue(item({ id: 'a' }), NOW)).toBe(false);
  });
});

describe('filterActionItems', () => {
  const items = [
    item({ id: 'open-late', dueAt: day(-2) }),
    item({ id: 'open-today', dueAt: day(0), assigneeUid: 'u1' }),
    item({ id: 'open-week', dueAt: day(3), assigneeUid: 'u2' }),
    item({ id: 'open-far', dueAt: day(30) }),
    item({ id: 'open-none', assigneeUid: 'u1' }),
    item({ id: 'done-late', dueAt: day(-2), done: true }),
  ];

  it('filters by status', () => {
    expect(
      ids(filterActionItems(items, view({ status: 'done' }), NOW))
    ).toEqual(['done-late']);
    expect(
      ids(filterActionItems(items, view({ status: 'open' }), NOW))
    ).not.toContain('done-late');
  });

  it('filters overdue to open items only', () => {
    expect(
      ids(filterActionItems(items, view({ due: 'overdue' }), NOW))
    ).toEqual(['open-late']);
  });

  it('filters to today and the next seven days', () => {
    expect(ids(filterActionItems(items, view({ due: 'today' }), NOW))).toEqual([
      'open-today',
    ]);
    expect(ids(filterActionItems(items, view({ due: 'week' }), NOW))).toEqual([
      'open-today',
      'open-week',
    ]);
  });

  it('filters to items with no due date', () => {
    expect(ids(filterActionItems(items, view({ due: 'none' }), NOW))).toEqual([
      'open-none',
    ]);
  });

  it('filters by assignee and by unassigned', () => {
    expect(
      ids(filterActionItems(items, view({ assignee: 'u1' }), NOW))
    ).toEqual(['open-today', 'open-none']);
    expect(
      ids(filterActionItems(items, view({ assignee: 'unassigned' }), NOW))
    ).toEqual(['open-late', 'open-far', 'done-late']);
  });

  it('combines filters', () => {
    const next = filterActionItems(
      items,
      view({ status: 'open', due: 'week', assignee: 'u2' }),
      NOW
    );
    expect(ids(next)).toEqual(['open-week']);
  });
});

describe('sortActionItems', () => {
  const items = [
    item({ id: 'c', text: 'Charlie', createdAt: 30, dueAt: day(5) }),
    item({ id: 'a', text: 'alpha', createdAt: 10, done: true, dueAt: day(1) }),
    item({ id: 'b', text: 'Bravo', createdAt: 20, assigneeUid: 'u2' }),
    item({ id: 'd', text: 'delta', createdAt: 40, assigneeUid: 'u1' }),
  ];

  it('leaves manual order untouched', () => {
    expect(ids(sortActionItems(items, 'manual', nameFor))).toEqual([
      'c',
      'a',
      'b',
      'd',
    ]);
  });

  it('puts open items first, then soonest due', () => {
    expect(ids(sortActionItems(items, 'status', nameFor))).toEqual([
      'c',
      'b',
      'd',
      'a',
    ]);
  });

  it('sorts by due date with undated items last', () => {
    expect(ids(sortActionItems(items, 'due', nameFor))).toEqual([
      'a',
      'c',
      'b',
      'd',
    ]);
  });

  it('sorts by assignee name case-insensitively, unassigned last', () => {
    expect(ids(sortActionItems(items, 'assignee', nameFor))).toEqual([
      'd',
      'b',
      'c',
      'a',
    ]);
  });

  it('sorts newest created first', () => {
    expect(ids(sortActionItems(items, 'created', nameFor))).toEqual([
      'd',
      'c',
      'b',
      'a',
    ]);
  });

  it('sorts by text A-Z ignoring case', () => {
    expect(ids(sortActionItems(items, 'text', nameFor))).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
  });

  it('breaks ties on stored order', () => {
    const tied = [
      item({ id: 'x', text: 'same', createdAt: 1 }),
      item({ id: 'y', text: 'same', createdAt: 1 }),
      item({ id: 'z', text: 'same', createdAt: 1 }),
    ];
    expect(ids(sortActionItems(tied, 'text', nameFor))).toEqual([
      'x',
      'y',
      'z',
    ]);
  });

  it('does not mutate the input', () => {
    const input = [...items];
    sortActionItems(input, 'text', nameFor);
    expect(ids(input)).toEqual(['c', 'a', 'b', 'd']);
  });
});

describe('applyVisibleReorder', () => {
  const all = [
    item({ id: 'a' }),
    item({ id: 'b', done: true }),
    item({ id: 'c' }),
    item({ id: 'd', done: true }),
    item({ id: 'e' }),
  ];

  it('reorders the whole list when nothing is filtered out', () => {
    const next = applyVisibleReorder(all, [
      all[4],
      all[0],
      all[1],
      all[2],
      all[3],
    ]);
    expect(ids(next)).toEqual(['e', 'a', 'b', 'c', 'd']);
  });

  it('keeps hidden items in their slots', () => {
    const visible = filterActionItems(all, view({ status: 'open' }), NOW);
    expect(ids(visible)).toEqual(['a', 'c', 'e']);
    const next = applyVisibleReorder(all, [visible[2], visible[0], visible[1]]);
    expect(ids(next)).toEqual(['e', 'b', 'a', 'd', 'c']);
  });

  it('is a no-op when the visible order is unchanged', () => {
    const visible = filterActionItems(all, view({ status: 'done' }), NOW);
    expect(ids(applyVisibleReorder(all, visible))).toEqual(ids(all));
  });
});

describe('visibleActionItems', () => {
  it('filters before sorting', () => {
    const items = [
      item({ id: 'a', text: 'zulu', done: true }),
      item({ id: 'b', text: 'yankee' }),
      item({ id: 'c', text: 'xray' }),
    ];
    const next = visibleActionItems(
      items,
      view({ status: 'open', sort: 'text' }),
      NOW,
      nameFor
    );
    expect(ids(next)).toEqual(['c', 'b']);
  });
});

describe('isDefaultActionItemView', () => {
  it('is true only for the untouched view', () => {
    expect(isDefaultActionItemView(DEFAULT_ACTION_ITEM_VIEW)).toBe(true);
    expect(isDefaultActionItemView(view({ status: 'open' }))).toBe(false);
    expect(isDefaultActionItemView(view({ sort: 'due' }))).toBe(false);
  });
});
