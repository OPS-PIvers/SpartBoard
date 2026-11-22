/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access -- in-memory store rows. */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./functionsInit', () => ({}));
vi.mock('./firebaseAdmin', () => ({ firestore: () => ({}), auth: () => ({}) }));
vi.mock('firebase-admin/firestore', async () => {
  const fakes = await import('./writingTestFakes');
  return {
    FieldValue: {
      delete: () => fakes.DELETE,
      serverTimestamp: () => fakes.SERVER_TS,
    },
  };
});

import { fakeFirestore } from './writingTestFakes';
import type { WritingCaller } from './writingResponses';
import {
  displayName,
  handlePeerReview,
  handleSetPeerReview,
  parseGroups,
  peerEdges,
  type PeerName,
} from './writingPeerReview';

const SID = 's1';
const SESSION = `writing_assignment_sessions/${SID}`;
const RECORD = `users/t1/writing_assignment_records/${SID}`;
const store = new Map<string, any>();
const db = fakeFirestore(store);

const teacher: WritingCaller = { uid: 't1', student: false, classIds: [] };
const stu = (uid: string): WritingCaller => ({
  uid,
  student: true,
  classIds: ['c1'],
});
const NAMES = new Map<string, PeerName>([
  ['a', { givenName: 'Ana', familyName: 'García' }],
  ['b', { givenName: 'Bo', familyName: 'Lee' }],
  ['c', { givenName: 'Cy', familyName: 'Ng' }],
  ['d', { givenName: 'Di', familyName: 'Ola' }],
]);
const resolve = vi.fn(() => Promise.resolve(NAMES));
const granted = vi.fn<(uid: string) => Promise<boolean>>(() =>
  Promise.resolve(true)
);

const setReview = (data: object, caller: WritingCaller = teacher) =>
  handleSetPeerReview(
    db,
    caller,
    { sessionId: SID, ...data },
    1_000,
    resolve,
    granted
  );
const peer = (uid: string, data: object) =>
  handlePeerReview(
    db,
    stu(uid),
    { sessionId: SID, ...data },
    2_000,
    resolve,
    granted
  );

const comment = {
  action: 'add',
  kind: 'comment',
  start: 0,
  end: 3,
  quote: 'The',
  body: 'Nice start',
};
const edit = {
  action: 'add',
  kind: 'edit',
  start: 4,
  end: 7,
  quote: 'day',
  insert: 'morning',
};

beforeEach(() => {
  store.clear();
  resolve.mockClear();
  granted.mockReset();
  granted.mockResolvedValue(true);
  store.set(SESSION, { teacherUid: 't1', classIds: ['c1'], status: 'active' });
  store.set(`${SESSION}/responses/b`, { html: '<p>The day</p>' });
});

describe('peer groups', () => {
  it('pairs review each other and three go in a round', () => {
    expect(peerEdges([['a', 'b']])).toEqual([
      { reviewer: 'a', author: 'b' },
      { reviewer: 'b', author: 'a' },
    ]);
    expect(peerEdges([['a', 'b', 'c']]).map((e) => e.author)).toEqual([
      'b',
      'c',
      'a',
    ]);
  });

  it('refuses a single, a group of four and a repeated student', () => {
    expect(() => parseGroups([['a']])).toThrow();
    expect(() => parseGroups([['a', 'b', 'c', 'd']])).toThrow();
    expect(() =>
      parseGroups([
        ['a', 'b'],
        ['b', 'c'],
      ])
    ).toThrow();
  });

  it('shows names as Last, First', () => {
    expect(displayName({ givenName: 'Bo', familyName: 'Lee' })).toBe('Lee, Bo');
    expect(displayName({ givenName: 'tester1', familyName: '' })).toBe(
      'tester1'
    );
  });
});

describe('setWritingPeerReviewV1', () => {
  it('writes each student a link, the session access and the record groups', async () => {
    await setReview({ access: 'comment', groups: [['a', 'b']] });
    expect(store.get(`${SESSION}/peer_links/a`)).toMatchObject({
      reviews: 'b',
      reviewedBy: ['b'],
    });
    expect(store.get(SESSION).peerReview).toEqual({
      access: 'comment',
      startedAt: 1_000,
      endedAt: null,
    });
    expect(store.get(RECORD).peerGroups).toEqual([{ members: ['a', 'b'] }]);
  });

  it('keeps names out of every stored doc', async () => {
    await setReview({ access: 'edit', groups: [['a', 'b', 'c']] });
    const dump = JSON.stringify([...store.values()]);
    expect(dump).not.toContain('García');
    expect(dump).not.toContain('Lee');
  });

  it('drops links for students taken out of the pairs', async () => {
    await setReview({
      access: 'view',
      groups: [
        ['a', 'b'],
        ['c', 'd'],
      ],
    });
    await setReview({ access: 'view', groups: [['a', 'b']] });
    expect(store.has(`${SESSION}/peer_links/c`)).toBe(false);
    expect(store.has(`${SESSION}/peer_links/a`)).toBe(true);
  });

  it('drops a link the record never listed, as after two overlapping saves', async () => {
    store.set(`${SESSION}/peer_links/d`, { reviews: 'c', reviewedBy: ['c'] });
    await setReview({ access: 'view', groups: [['a', 'b']] });
    expect(store.has(`${SESSION}/peer_links/d`)).toBe(false);
  });

  it('refuses a student outside the teacher roster', async () => {
    await expect(
      setReview({ access: 'view', groups: [['a', 'zz']] })
    ).rejects.toThrow(/your classes/);
  });

  it('refuses another teacher and students', async () => {
    await expect(
      setReview(
        { access: 'view', groups: [['a', 'b']] },
        {
          uid: 't2',
          student: false,
          classIds: [],
        }
      )
    ).rejects.toThrow(/Not your/);
    await expect(
      setReview({ access: 'view', groups: [['a', 'b']] }, stu('a'))
    ).rejects.toThrow(/Teacher/);
  });

  it('refuses a teacher without the peer review flag and writes nothing', async () => {
    granted.mockResolvedValue(false);
    await expect(
      setReview({ access: 'view', groups: [['a', 'b']] })
    ).rejects.toThrow(/not available/);
    expect(granted).toHaveBeenCalledWith('t1');
    expect(store.get(SESSION).peerReview).toBeUndefined();
    expect(store.has(`${SESSION}/peer_links/a`)).toBe(false);
  });

  it('still lets a teacher who lost the flag end peer review', async () => {
    await setReview({ access: 'comment', groups: [['a', 'b']] });
    granted.mockResolvedValue(false);
    await setReview({ end: true });
    expect(store.get(SESSION).peerReview.endedAt).toBe(1_000);
    expect(store.has(`${SESSION}/peer_links/a`)).toBe(false);
  });

  it('ends peer review and removes every link', async () => {
    await setReview({ access: 'comment', groups: [['a', 'b']] });
    await setReview({ end: true });
    expect(store.get(SESSION).peerReview.endedAt).toBe(1_000);
    expect(store.has(`${SESSION}/peer_links/a`)).toBe(false);
  });
});

describe('writingPeerReviewV1', () => {
  beforeEach(async () => {
    await setReview({ access: 'comment', groups: [['a', 'b']] });
  });

  it('tells a student who they read and who reads them, with names', async () => {
    expect(await peer('a', { action: 'info' })).toEqual({
      running: true,
      access: 'comment',
      reviews: { uid: 'b', name: 'Lee, Bo' },
      reviewedBy: [{ uid: 'b', name: 'Lee, Bo' }],
    });
  });

  it('says nothing runs for an unpaired student', async () => {
    expect(await peer('c', { action: 'info' })).toEqual({ running: false });
    await expect(peer('c', { action: 'read' })).rejects.toThrow(/not open/);
  });

  it('reads only the partner html, never another student', async () => {
    const read: any = await peer('a', { action: 'read' });
    expect(read.html).toBe('<p>The day</p>');
    expect(read).not.toHaveProperty('summary');
    expect(read).not.toHaveProperty('grade');
  });

  it('adds a comment stamped with the partner as its author', async () => {
    const { id } = (await peer('a', comment)) as { id: string };
    expect(store.get(`${SESSION}/responses/b/peer/${id}`)).toMatchObject({
      by: 'a',
      kind: 'comment',
      body: 'Nice start',
      status: 'open',
    });
  });

  it('refuses edits at comment access and anything at view access', async () => {
    await expect(peer('a', edit)).rejects.toThrow(/access/);
    await setReview({ access: 'view', groups: [['a', 'b']] });
    await expect(peer('a', comment)).rejects.toThrow(/access/);
  });

  it('takes a suggested edit at edit access', async () => {
    await setReview({ access: 'edit', groups: [['a', 'b']] });
    const { id } = (await peer('a', edit)) as { id: string };
    expect(store.get(`${SESSION}/responses/b/peer/${id}`).insert).toBe(
      'morning'
    );
  });

  it('refuses a quote that does not match its range', async () => {
    await expect(peer('a', { ...comment, end: 9 })).rejects.toThrow(/quote/);
  });

  it('refuses a quote that is not in the writing', async () => {
    await expect(
      peer('a', { ...comment, quote: 'made up', end: comment.start + 7 })
    ).rejects.toThrow(/not in the writing/);
  });

  it('lets a partner delete only their own open mark', async () => {
    const { id } = (await peer('a', comment)) as { id: string };
    await expect(peer('b', { action: 'delete', markId: id })).rejects.toThrow();
    store.set(`${SESSION}/responses/b/peer/${id}`, {
      ...store.get(`${SESSION}/responses/b/peer/${id}`),
      status: 'resolved',
    });
    await expect(peer('a', { action: 'delete', markId: id })).rejects.toThrow(
      /no longer/
    );
  });

  it('closes everything once the teacher ends it or the session ends', async () => {
    await setReview({ end: true });
    await expect(peer('a', comment)).rejects.toThrow(/not open/);
    await setReview({ access: 'comment', groups: [['a', 'b']] });
    store.set(SESSION, { ...store.get(SESSION), status: 'ended' });
    await expect(peer('a', { action: 'read' })).rejects.toThrow(/not open/);
  });

  it('closes peer review for students once the teacher loses the flag', async () => {
    granted.mockResolvedValue(false);
    expect(await peer('a', { action: 'info' })).toEqual({ running: false });
    await expect(peer('a', { action: 'read' })).rejects.toThrow(/not open/);
    await expect(peer('a', comment)).rejects.toThrow(/not open/);
    expect(granted).toHaveBeenCalledWith('t1');
  });

  it('refuses a teacher caller', async () => {
    await expect(
      handlePeerReview(
        db,
        teacher,
        { sessionId: SID, action: 'info' },
        0,
        resolve,
        granted
      )
    ).rejects.toThrow(/Student/);
  });
});
