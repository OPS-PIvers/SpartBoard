import { describe, it, expect } from 'vitest';
import type { PlcActionItem, PlcMeeting, PlcNote, PlcTodo } from '@/types';
import {
  actionItemFromMeetingItem,
  buildImportedTodosNote,
  countOpenActionItems,
  liveTodos,
  mergeActionItems,
  newActionItem,
  openActionItemsByNote,
  parseActionItems,
  sanitizeActionItemsForWrite,
} from '@/utils/plcActionItems';

const actionItem = (overrides: Partial<PlcActionItem> = {}): PlcActionItem => ({
  id: 'ai1',
  text: 'Reteach fractions',
  done: false,
  createdBy: 'u1',
  createdAt: 1,
  ...overrides,
});

const note = (overrides: Partial<PlcNote> = {}): PlcNote => ({
  id: 'n1',
  title: 'Note',
  body: '',
  createdBy: 'u1',
  createdAt: 1,
  lastEditedBy: 'u1',
  lastEditedAt: 1,
  ...overrides,
});

describe('newActionItem', () => {
  it('builds an item with a fresh id and the given text', () => {
    const item = newActionItem('Reteach fractions', 'u1', 100);
    expect(item.text).toBe('Reteach fractions');
    expect(item.done).toBe(false);
    expect(item.createdBy).toBe('u1');
    expect(item.createdAt).toBe(100);
    expect(typeof item.id).toBe('string');
    expect(item.id.length).toBeGreaterThan(0);
  });

  it('carries optional assigneeUid/dueAt when provided', () => {
    const item = newActionItem('x', 'u1', 100, {
      assigneeUid: 'u2',
      dueAt: 200,
    });
    expect(item.assigneeUid).toBe('u2');
    expect(item.dueAt).toBe(200);
  });
});

describe('sanitizeActionItemsForWrite', () => {
  it('trims text and normalizes undefined optional fields to null', () => {
    const result = sanitizeActionItemsForWrite([
      actionItem({ text: '  hi  ' }),
    ]);
    expect(result).toEqual([
      {
        id: 'ai1',
        text: 'hi',
        done: false,
        assigneeUid: null,
        dueAt: null,
        createdBy: 'u1',
        createdAt: 1,
        doneAt: null,
      },
    ]);
  });

  it('drops entries whose trimmed text is empty', () => {
    const result = sanitizeActionItemsForWrite([
      actionItem({ text: '   ' }),
      actionItem({ id: 'ai2', text: 'keep' }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('ai2');
  });

  it('caps the list at MAX_ACTION_ITEMS', () => {
    const items = Array.from({ length: 250 }, (_, i) =>
      actionItem({ id: `ai${i}` })
    );
    const result = sanitizeActionItemsForWrite(items);
    expect(result).toHaveLength(200);
  });
});

describe('parseActionItems', () => {
  it('returns [] for non-array input', () => {
    expect(parseActionItems(undefined)).toEqual([]);
    expect(parseActionItems('nope')).toEqual([]);
  });

  it('drops malformed entries, keeps well-typed ones', () => {
    const raw = [
      { id: 'a1', text: 'ok', done: false, createdBy: 'u', createdAt: 1 },
      { id: 'bad', text: 'missing done' },
      null,
      'not-an-object',
    ];
    const result = parseActionItems(raw);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('a1');
  });

  it('tolerates explicit nulls for assigneeUid/dueAt/doneAt', () => {
    const raw = [
      {
        id: 'a1',
        text: 'ok',
        done: false,
        createdBy: 'u',
        createdAt: 1,
        assigneeUid: null,
        dueAt: null,
        doneAt: null,
      },
    ];
    const result = parseActionItems(raw);
    expect(result[0]?.assigneeUid).toBeNull();
    expect(result[0]?.dueAt).toBeNull();
    expect(result[0]?.doneAt).toBeNull();
  });
});

describe('openActionItemsByNote', () => {
  it('excludes soft-deleted notes and notes with no open items', () => {
    const notes: PlcNote[] = [
      note({ id: 'n1', actionItems: [actionItem({ done: true })] }),
      note({ id: 'n2', deletedAt: 5, actionItems: [actionItem()] }),
      note({ id: 'n3', actionItems: [actionItem({ id: 'ai2' })] }),
    ];
    const groups = openActionItemsByNote(notes);
    expect(groups.map((g) => g.note.id)).toEqual(['n3']);
  });

  it('sorts by lastEditedAt desc', () => {
    const notes: PlcNote[] = [
      note({ id: 'n1', lastEditedAt: 1, actionItems: [actionItem()] }),
      note({ id: 'n2', lastEditedAt: 5, actionItems: [actionItem()] }),
    ];
    const groups = openActionItemsByNote(notes);
    expect(groups.map((g) => g.note.id)).toEqual(['n2', 'n1']);
  });
});

describe('countOpenActionItems', () => {
  it('counts only open items on live notes', () => {
    const notes: PlcNote[] = [
      note({
        id: 'n1',
        actionItems: [
          actionItem({ done: false }),
          actionItem({ id: 'ai2', done: true }),
        ],
      }),
      note({ id: 'n2', deletedAt: 5, actionItems: [actionItem()] }),
    ];
    expect(countOpenActionItems(notes)).toBe(1);
  });
});

describe('liveTodos', () => {
  it('filters out soft-deleted todos', () => {
    const todos: PlcTodo[] = [
      { id: 't1', text: 'a', done: false, createdBy: 'u', createdAt: 1 },
      {
        id: 't2',
        text: 'b',
        done: false,
        createdBy: 'u',
        createdAt: 1,
        deletedAt: 5,
      },
    ];
    expect(liveTodos(todos).map((t) => t.id)).toEqual(['t1']);
  });
});

describe('buildImportedTodosNote', () => {
  it('carries todo ids as action item ids (idempotent with mergeActionItems)', () => {
    const todos: PlcTodo[] = [
      {
        id: 't1',
        text: 'Call parents',
        done: false,
        createdBy: 'u',
        createdAt: 1,
      },
    ];
    const result = buildImportedTodosNote(todos, 'u1', 1000);
    expect(result.actionItems).toEqual([
      {
        id: 't1',
        text: 'Call parents',
        done: false,
        createdBy: 'u',
        createdAt: 1,
      },
    ]);

    // Running the import twice and merging must not duplicate.
    const merged = mergeActionItems(result.actionItems, result.actionItems);
    expect(merged).toHaveLength(1);
  });
});

describe('actionItemFromMeetingItem', () => {
  it('projects a meeting action item into a PlcActionItem', () => {
    const item: PlcMeeting['actionItems'][number] = {
      id: 'ai1',
      text: 'Reteach fractions',
      assigneeUid: 'u2',
      dueAt: 500,
    };
    const result = actionItemFromMeetingItem(item, 'u1', 1000);
    expect(result).toEqual({
      id: 'ai1',
      text: 'Reteach fractions',
      done: false,
      createdBy: 'u1',
      createdAt: 1000,
      assigneeUid: 'u2',
      dueAt: 500,
    });
  });
});

describe('mergeActionItems', () => {
  it('appends only incoming items whose id is not already present', () => {
    const existing = [actionItem({ id: 'a1' })];
    const incoming = [actionItem({ id: 'a1' }), actionItem({ id: 'a2' })];
    const result = mergeActionItems(existing, incoming);
    expect(result.map((i) => i.id)).toEqual(['a1', 'a2']);
  });
});
