import { describe, it, expect } from 'vitest';
import {
  buildTaskPayload,
  diffActionItems,
  dueDateForTasks,
  isActivePlcMember,
  liveItems,
  mapDocId,
  parentLink,
  payloadHash,
  scopeIncludesTasks,
  type SyncedActionItem,
} from './googleTasksCore';

const item = (over: Partial<SyncedActionItem> = {}): SyncedActionItem => ({
  id: 'a',
  text: 'Email parents',
  done: false,
  assigneeUid: 'u1',
  dueAt: null,
  ...over,
});

describe('diffActionItems', () => {
  it('upserts a new assigned item and ignores unassigned ones', () => {
    expect(
      diffActionItems([], [item(), item({ id: 'b', assigneeUid: null })])
    ).toEqual([
      { kind: 'upsert', uid: 'u1', item: item(), statusChanged: true },
    ]);
  });

  it('is a no-op when synced fields are unchanged (CRDT mirror rewrite)', () => {
    expect(diffActionItems([item()], [item()])).toEqual([]);
  });

  it('upserts on text, due date and done changes; only done pushes status', () => {
    for (const [over, statusChanged] of [
      [{ text: 'x' }, false],
      [{ dueAt: 5 }, false],
      [{ done: true }, true],
    ] as const) {
      expect(diffActionItems([item()], [item(over)])).toEqual([
        { kind: 'upsert', uid: 'u1', item: item(over), statusChanged },
      ]);
    }
  });

  it('reassignment deletes from the old assignee and creates for the new', () => {
    expect(diffActionItems([item()], [item({ assigneeUid: 'u2' })])).toEqual([
      { kind: 'delete', uid: 'u1', itemId: 'a' },
      {
        kind: 'upsert',
        uid: 'u2',
        item: item({ assigneeUid: 'u2' }),
        statusChanged: true,
      },
    ]);
  });

  it('unassigning or removing an item deletes its task', () => {
    expect(diffActionItems([item()], [item({ assigneeUid: null })])).toEqual([
      { kind: 'delete', uid: 'u1', itemId: 'a' },
    ]);
    expect(diffActionItems([item()], [])).toEqual([
      { kind: 'delete', uid: 'u1', itemId: 'a' },
    ]);
  });
});

describe('liveItems', () => {
  it('treats a soft-deleted or missing parent as having no items', () => {
    const raw = { actionItems: [item()] };
    expect(liveItems(raw)).toHaveLength(1);
    expect(liveItems({ ...raw, deletedAt: 123 })).toEqual([]);
    expect(liveItems({ ...raw, deletedAt: null })).toHaveLength(1);
    expect(liveItems(undefined)).toEqual([]);
  });

  it('drops malformed entries', () => {
    expect(
      liveItems({ actionItems: [null, { text: 'no id' }, { id: 'k' }] })
    ).toEqual([
      { id: 'k', text: '', done: false, assigneeUid: null, dueAt: null },
    ]);
  });
});

describe('dueDateForTasks', () => {
  it('uses the district calendar date, not the UTC date', () => {
    // 2026-10-07 21:00 Central is already 2026-10-08 in UTC.
    const lateEvening = Date.UTC(2026, 9, 8, 2, 0);
    expect(dueDateForTasks(lateEvening)).toBe('2026-10-07T00:00:00.000Z');
    // Local midnight in Central.
    expect(dueDateForTasks(Date.UTC(2026, 9, 7, 5, 0))).toBe(
      '2026-10-07T00:00:00.000Z'
    );
    expect(dueDateForTasks(null)).toBeNull();
  });
});

describe('task payload', () => {
  it('builds title, notes heading with link, due and status', () => {
    const payload = buildTaskPayload({
      item: item({ done: true, dueAt: Date.UTC(2026, 9, 7, 5) }),
      teamName: 'Grade 6 Math',
      parentTitle: 'Oct 6 meeting',
      link: 'https://x/plc/p/docs',
    });
    expect(payload).toEqual({
      title: 'Email parents',
      notes: 'Grade 6 Math · Oct 6 meeting\nhttps://x/plc/p/docs',
      due: '2026-10-07T00:00:00.000Z',
      status: 'completed',
    });
    expect(payloadHash(payload)).toBe(payloadHash({ ...payload }));
    expect(payloadHash(payload)).not.toBe(
      payloadHash({ ...payload, status: 'needsAction' })
    );
  });

  it('links docs to the doc and notes to Notes and Docs', () => {
    expect(parentLink('https://o', 'p', 'doc', 'd1')).toBe(
      'https://o/plc/p/docs/d1'
    );
    expect(parentLink('https://o', 'p', 'note', 'n1')).toBe(
      'https://o/plc/p/docs'
    );
  });
});

describe('helpers', () => {
  it('map ids cannot collide through underscores in ids', () => {
    expect(mapDocId('p', 'note', 'x_y', 'z')).not.toBe(
      mapDocId('p', 'note', 'x', 'y_z')
    );
  });

  it('detects the Tasks scope in a grant', () => {
    expect(
      scopeIncludesTasks(
        'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/tasks'
      )
    ).toBe(true);
    expect(
      scopeIncludesTasks('https://www.googleapis.com/auth/tasks.readonly')
    ).toBe(false);
    expect(scopeIncludesTasks(undefined)).toBe(false);
  });

  it('checks active membership from the members map or memberUids', () => {
    expect(
      isActivePlcMember({ members: { u1: { status: 'active' } } }, 'u1')
    ).toBe(true);
    expect(
      isActivePlcMember({ members: { u1: { status: 'removed' } } }, 'u1')
    ).toBe(false);
    expect(isActivePlcMember({ memberUids: ['u1'] }, 'u1')).toBe(true);
    expect(isActivePlcMember(undefined, 'u1')).toBe(false);
  });
});
