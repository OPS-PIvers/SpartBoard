import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlcNoteBlock } from '@/types';

const store = new Map<string, Record<string, unknown> | undefined>();
const writes: {
  op: 'set' | 'update';
  path: string;
  data: Record<string, unknown>;
}[] = [];

vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...parts: string[]) => ({ path: parts.join('/') }),
  serverTimestamp: () => 'SERVER_TS',
  deleteField: () => 'DELETE',
  updateDoc: vi.fn(),
  runTransaction: async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      get: (ref: { path: string }) => {
        const data = store.get(ref.path);
        return Promise.resolve({ exists: () => !!data, data: () => data });
      },
      set: (ref: { path: string }, data: Record<string, unknown>) =>
        writes.push({ op: 'set', path: ref.path, data }),
      update: (ref: { path: string }, data: Record<string, unknown>) =>
        writes.push({ op: 'update', path: ref.path, data }),
    }),
}));

const { ensureMeetingNote, mutateNoteBlocks } = await import('./plcNoteWrites');

const PATH = 'plcs/p1/notes/meeting-2026-10-14';
const planned = {
  id: 'meeting-2026-10-14',
  title: 'Department meeting Oct 14',
  body: '## Agenda\n',
  blocks: [] as PlcNoteBlock[],
  meetingAt: 1_800_000_000_000,
};
const agenda = (id: string): PlcNoteBlock => ({
  id,
  kind: 'agenda',
  text: id,
  section: 'Agenda',
  createdBy: 'u1',
  createdAt: 1,
});

beforeEach(() => {
  store.clear();
  writes.length = 0;
});

describe('ensureMeetingNote', () => {
  it('creates a missing planned note at version 0', async () => {
    await expect(ensureMeetingNote('p1', 'u1', planned)).resolves.toBe(
      'created'
    );
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      op: 'set',
      path: PATH,
      data: {
        kind: 'meeting',
        version: 0,
        meetingAt: planned.meetingAt,
        createdBy: 'u1',
      },
    });
  });

  it('leaves a live note alone', async () => {
    store.set(PATH, { title: 'Ours', version: 3, deletedAt: null });
    await expect(ensureMeetingNote('p1', 'u1', planned)).resolves.toBe(
      'existing'
    );
    expect(writes).toEqual([]);
  });

  it('restores a trashed note and bumps its version', async () => {
    store.set(PATH, { title: 'Ours', version: 3, deletedAt: 123 });
    await expect(ensureMeetingNote('p1', 'u2', planned)).resolves.toBe(
      'restored'
    );
    expect(writes).toEqual([
      {
        op: 'update',
        path: PATH,
        data: {
          deletedAt: null,
          meetingAt: planned.meetingAt,
          lastEditedBy: 'u2',
          lastEditedAt: 'SERVER_TS',
          version: 4,
        },
      },
    ]);
  });

  it('restores a trashed legacy note without adding a version', async () => {
    store.set(PATH, { title: 'Old', deletedAt: 123 });
    await ensureMeetingNote('p1', 'u1', planned);
    expect(writes[0].data).not.toHaveProperty('version');
  });
});

describe('mutateNoteBlocks', () => {
  it('applies the change to fresh blocks and bumps the version', async () => {
    store.set(PATH, { version: 2, blocks: [agenda('a')] });
    await mutateNoteBlocks('p1', planned.id, 'u1', (list) => [
      ...list,
      agenda('b'),
    ]);
    expect(writes[0].op).toBe('update');
    expect(writes[0].data).toMatchObject({ version: 3, lastEditedBy: 'u1' });
    expect(
      (writes[0].data.blocks as { id: string }[]).map((b) => b.id)
    ).toEqual(['a', 'b']);
  });

  it('never adds a version to a legacy note', async () => {
    store.set(PATH, { blocks: [] });
    await mutateNoteBlocks('p1', planned.id, 'u1', (list) => list);
    expect(writes[0].data).not.toHaveProperty('version');
  });

  it('fails when the note does not exist', async () => {
    await expect(
      mutateNoteBlocks('p1', planned.id, 'u1', (list) => list)
    ).rejects.toThrow('Note not found');
  });
});
