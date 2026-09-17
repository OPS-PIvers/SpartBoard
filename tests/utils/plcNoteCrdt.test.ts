import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import type { PlcActionItem } from '@/types';
import {
  applyActionItems,
  applyTextEdit,
  decodeUpdate,
  encodeDocSnapshot,
  encodeUpdate,
  isNoteDocEmpty,
  noteActionItems,
  noteBody,
  readNoteContent,
  seedNoteDoc,
} from '@/utils/plcNoteCrdt';

/** Two docs wired to each other through explicitly flushed update queues. */
function peers() {
  const a = new Y.Doc();
  const b = new Y.Doc();
  const toB: Uint8Array[] = [];
  const toA: Uint8Array[] = [];
  a.on('update', (u: Uint8Array) => toB.push(u));
  b.on('update', (u: Uint8Array) => toA.push(u));
  const sync = () => {
    // Drain repeatedly: applying an update can emit another.
    while (toA.length > 0 || toB.length > 0) {
      const forB = toB.splice(0, toB.length);
      const forA = toA.splice(0, toA.length);
      forB.forEach((u) => Y.applyUpdate(b, u));
      forA.forEach((u) => Y.applyUpdate(a, u));
    }
  };
  return { a, b, sync };
}

const item = (
  over: Partial<PlcActionItem> & { id: string }
): PlcActionItem => ({
  text: 'task',
  done: false,
  createdBy: 'me',
  createdAt: 0,
  ...over,
});

describe('applyTextEdit', () => {
  it('splices only the changed run', () => {
    const doc = new Y.Doc();
    const text = noteBody(doc);
    applyTextEdit(text, 'the quick brown fox');

    const deltas: unknown[] = [];
    text.observe((e) => deltas.push(e.changes.delta));
    applyTextEdit(text, 'the quick red fox');

    expect(text.toJSON()).toBe('the quick red fox');
    expect(deltas).toEqual([
      [{ retain: 10 }, { delete: 5 }, { insert: 'red' }],
    ]);
  });

  it('is a no-op when the text is unchanged', () => {
    const doc = new Y.Doc();
    const text = noteBody(doc);
    applyTextEdit(text, 'stable');
    let updates = 0;
    doc.on('update', () => (updates += 1));
    applyTextEdit(text, 'stable');
    expect(updates).toBe(0);
  });

  it('does not tear a surrogate pair', () => {
    const doc = new Y.Doc();
    const text = noteBody(doc);
    applyTextEdit(text, 'done 🎉');
    applyTextEdit(text, 'done 🎈');
    expect(text.toJSON()).toBe('done 🎈');
    expect([...text.toJSON()]).toHaveLength(6);
  });

  it('handles clearing and refilling', () => {
    const doc = new Y.Doc();
    const text = noteBody(doc);
    applyTextEdit(text, 'something');
    applyTextEdit(text, '');
    expect(text.toJSON()).toBe('');
    applyTextEdit(text, 'else');
    expect(text.toJSON()).toBe('else');
  });
});

describe('concurrent body edits', () => {
  it('keeps both edits when two teachers type in different places', () => {
    const { a, b, sync } = peers();
    applyTextEdit(noteBody(a), 'Agenda\n\nDecisions\n');
    sync();

    // Offline from each other, both type.
    applyTextEdit(noteBody(a), 'Agenda: standards\n\nDecisions\n');
    applyTextEdit(noteBody(b), 'Agenda\n\nDecisions: retake policy\n');
    sync();

    expect(noteBody(a).toJSON()).toBe(noteBody(b).toJSON());
    expect(noteBody(a).toJSON()).toContain('standards');
    expect(noteBody(a).toJSON()).toContain('retake policy');
  });

  it('converges when both append to the same line', () => {
    const { a, b, sync } = peers();
    applyTextEdit(noteBody(a), 'Next steps: ');
    sync();

    applyTextEdit(noteBody(a), 'Next steps: order books');
    applyTextEdit(noteBody(b), 'Next steps: book the room');
    sync();

    expect(noteBody(a).toJSON()).toBe(noteBody(b).toJSON());
    expect(noteBody(a).toJSON()).toContain('order books');
    expect(noteBody(a).toJSON()).toContain('book the room');
  });

  it('converges under randomized interleaved editing', () => {
    // Deterministic LCG so a failure is reproducible.
    let seed = 1337;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const words = ['alpha', 'beta', 'gamma', 'delta', 'omega'];

    const { a, b, sync } = peers();
    applyTextEdit(noteBody(a), 'start');
    sync();

    for (let round = 0; round < 250; round += 1) {
      for (const doc of [a, b]) {
        if (rand() < 0.5) continue;
        const text = noteBody(doc);
        const current = text.toJSON();
        const at = Math.floor(rand() * (current.length + 1));
        const next =
          rand() < 0.3 && current.length > 3
            ? current.slice(0, at) +
              current.slice(Math.min(current.length, at + 3))
            : current.slice(0, at) +
              words[Math.floor(rand() * words.length)] +
              current.slice(at);
        applyTextEdit(text, next);
      }
      if (rand() < 0.4) sync();
    }
    sync();

    expect(noteBody(a).toJSON()).toBe(noteBody(b).toJSON());
  });
});

describe('applyActionItems', () => {
  it('appends, patches and removes by id', () => {
    const doc = new Y.Doc();
    const items = noteActionItems(doc);

    applyActionItems(doc, items, [item({ id: '1' }), item({ id: '2' })]);
    expect(readNoteContent(doc).actionItems.map((i) => i.id)).toEqual([
      '1',
      '2',
    ]);

    applyActionItems(doc, items, [
      item({ id: '1', done: true, doneAt: 99 }),
      item({ id: '2' }),
      item({ id: '3', text: 'new' }),
    ]);
    const after = readNoteContent(doc).actionItems;
    expect(after.map((i) => i.id)).toEqual(['1', '2', '3']);
    expect(after[0].done).toBe(true);
    expect(after[0].doneAt).toBe(99);
    expect(after[2].text).toBe('new');

    applyActionItems(doc, items, [item({ id: '3', text: 'new' })]);
    expect(readNoteContent(doc).actionItems.map((i) => i.id)).toEqual(['3']);
  });

  it('keeps both ticks when two teachers check different items', () => {
    const { a, b, sync } = peers();
    const base = [item({ id: '1' }), item({ id: '2' })];
    applyActionItems(a, noteActionItems(a), base);
    sync();

    applyActionItems(a, noteActionItems(a), [
      item({ id: '1', done: true }),
      item({ id: '2' }),
    ]);
    applyActionItems(b, noteActionItems(b), [
      item({ id: '1' }),
      item({ id: '2', done: true }),
    ]);
    sync();

    expect(readNoteContent(a).actionItems).toEqual(
      readNoteContent(b).actionItems
    );
    expect(readNoteContent(a).actionItems.map((i) => i.done)).toEqual([
      true,
      true,
    ]);
  });

  it('drops an optional field that was cleared', () => {
    const doc = new Y.Doc();
    const items = noteActionItems(doc);
    applyActionItems(doc, items, [item({ id: '1', dueAt: 500 })]);
    expect(readNoteContent(doc).actionItems[0].dueAt).toBe(500);
    applyActionItems(doc, items, [item({ id: '1' })]);
    expect(readNoteContent(doc).actionItems[0].dueAt).toBeUndefined();
  });
});

describe('seeding and encoding', () => {
  it('reports an untouched doc as empty', () => {
    const doc = new Y.Doc();
    expect(isNoteDocEmpty(doc)).toBe(true);
    seedNoteDoc(doc, { title: 'T', body: '', actionItems: [] });
    expect(isNoteDocEmpty(doc)).toBe(false);
  });

  it('round-trips a seeded note through base64', () => {
    const source = new Y.Doc();
    seedNoteDoc(source, {
      title: 'Meeting notes',
      body: '## Agenda\n- one',
      actionItems: [item({ id: '1', text: 'follow up', assigneeUid: 'u2' })],
    });

    const restored = new Y.Doc();
    Y.applyUpdate(restored, decodeUpdate(encodeDocSnapshot(source)));

    expect(readNoteContent(restored)).toEqual(readNoteContent(source));
  });

  it('round-trips an incremental update', () => {
    const source = new Y.Doc();
    const captured: string[] = [];
    source.on('update', (u: Uint8Array) => captured.push(encodeUpdate(u)));
    applyTextEdit(noteBody(source), 'hello');

    const target = new Y.Doc();
    captured.forEach((u) => Y.applyUpdate(target, decodeUpdate(u)));
    expect(noteBody(target).toJSON()).toBe('hello');
  });
});
