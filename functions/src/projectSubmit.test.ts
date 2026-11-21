/* eslint-disable @typescript-eslint/no-explicit-any,
   @typescript-eslint/no-unsafe-assignment,
   @typescript-eslint/no-unsafe-member-access,
   @typescript-eslint/no-unsafe-return,
   @typescript-eslint/no-unsafe-argument,
   @typescript-eslint/require-await -- a hand-rolled Firestore fake. */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';

vi.mock('./functionsInit', () => ({}));
vi.mock('./firebaseAdmin', () => ({ firestore: () => ({}) }));

import { handleSubmitProjectGroup } from './projectSubmit';

const RUN = 'project_runs/t_p1';
const GROUP = `${RUN}/groups/g1`;
const store = new Map<string, any>();
const writes: Array<{ kind: string; path: string; data: any }> = [];

const ref = (path: string): any => ({
  path,
  collection: (name: string) => ({
    doc: (id?: string) => ref(`${path}/${name}/${id ?? 'auto-id'}`),
  }),
  get id() {
    return path.split('/').pop();
  },
});

const fakeDb = {
  collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
  runTransaction: async (fn: (tx: any) => Promise<unknown>) =>
    fn({
      get: async (r: any) => ({ data: () => store.get(r.path) }),
      update: (r: any, data: any) =>
        writes.push({ kind: 'update', path: r.path, data }),
      set: (r: any, data: any) =>
        writes.push({ kind: 'set', path: r.path, data }),
    }),
} as unknown as Firestore;

const submit = (uid: string | null, data: unknown = {}, now = 1000) =>
  handleSubmitProjectGroup(
    fakeDb,
    uid,
    { runId: 't_p1', groupId: 'g1', ...(data as object) },
    now
  );

beforeEach(() => {
  store.clear();
  writes.length = 0;
  store.set(RUN, { studentSubmit: true, acceptingUpdates: true, dueAt: 2000 });
  store.set(GROUP, { memberUids: ['m1', 'm2'] });
});

describe('handleSubmitProjectGroup', () => {
  it('submits for the whole group and logs an event', async () => {
    await expect(submit('m2')).resolves.toEqual({
      submittedAt: 1000,
      late: false,
    });
    expect(writes[0]).toEqual({
      kind: 'update',
      path: GROUP,
      data: {
        submittedAt: 1000,
        submittedByUid: 'm2',
        submittedLate: false,
        updatedAt: 1000,
      },
    });
    expect(writes[1].data).toMatchObject({
      kind: 'submission',
      actorUid: 'm2',
      actorRole: 'student',
      detail: 'submitted',
    });
  });

  it('marks a submit after the due date late', async () => {
    await expect(submit('m1', {}, 3000)).resolves.toEqual({
      submittedAt: 3000,
      late: true,
    });
    expect(writes[0].data.submittedLate).toBe(true);
  });

  it('is never late without a due date', async () => {
    store.set(RUN, { studentSubmit: true, acceptingUpdates: true });
    await expect(submit('m1', {}, 9e12)).resolves.toMatchObject({
      late: false,
    });
  });

  it('refuses a caller outside the group, and a signed-out one', async () => {
    await expect(submit('outsider')).rejects.toMatchObject({
      code: 'permission-denied',
    });
    await expect(submit(null)).rejects.toMatchObject({
      code: 'unauthenticated',
    });
    expect(writes).toHaveLength(0);
  });

  it('refuses a run without turn-in, or one the teacher closed', async () => {
    store.set(RUN, { acceptingUpdates: true });
    await expect(submit('m1')).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    store.set(RUN, { studentSubmit: true, acceptingUpdates: false });
    await expect(submit('m1')).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    expect(writes).toHaveLength(0);
  });

  it('leaves an earlier submission alone', async () => {
    store.set(GROUP, {
      memberUids: ['m1', 'm2'],
      submittedAt: 500,
      submittedLate: false,
    });
    await expect(submit('m2', {}, 5000)).resolves.toEqual({
      submittedAt: 500,
      late: false,
    });
    expect(writes).toHaveLength(0);
  });

  it('rejects ids that are not document ids', async () => {
    await expect(submit('m1', { runId: 'a/b' })).rejects.toMatchObject({
      code: 'invalid-argument',
    });
  });
});
