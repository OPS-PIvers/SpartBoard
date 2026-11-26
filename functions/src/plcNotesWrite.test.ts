// plcNotesWriteV1 checks, case by case against the notes, meetings, recordings, noteDocs and comments rules tests.
import { describe, it, expect, vi } from 'vitest';

vi.mock('./firebaseAdmin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: Object.assign(vi.fn(), {
    FieldValue: { serverTimestamp: () => 'TS' },
  }),
}));
vi.mock('firebase-functions/v2/https', () => {
  class FakeHttpsError extends Error {
    code: string;
    details: unknown;
    constructor(code: string, message: string, details?: unknown) {
      super(message);
      this.code = code;
      this.details = details;
    }
  }
  return { onCall: (_o: unknown, h: unknown) => h, HttpsError: FakeHttpsError };
});

import type * as admin from './firebaseAdmin';
import {
  canEditPlcContent,
  checkWrite,
  parsePlcNotesWrite,
  PlcNotesWriteError,
  runPlcNotesWrite,
  ServerTime,
  valuesEqual,
  type Caller,
  type CheckContext,
  type PlcNotesWriteOp,
} from './plcNotesWrite';
import { makeStubFirestore, type StubData } from './testing/stubFirestore';

const ts = (ms: number) => ({
  seconds: Math.floor(ms / 1000),
  nanoseconds: (ms % 1000) * 1e6,
  toMillis: () => ms,
});
const NOW = new ServerTime();
const ctx = (
  uid = 'alice',
  extra: Partial<CheckContext> = {}
): CheckContext => ({
  uid,
  nowMs: 1_000_000,
  ...extra,
});
const merge = (prev: StubData, patch: StubData) => ({ ...prev, ...patch });

// ── notes ──

const note = (o: StubData = {}): StubData => ({
  id: 'n1',
  title: 'T',
  body: 'B',
  kind: 'freeform',
  meetingId: null,
  createdBy: 'alice',
  createdAt: NOW,
  lastEditedBy: 'alice',
  lastEditedAt: NOW,
  version: 0,
  ...o,
});
const storedNote = (o: StubData = {}): StubData =>
  note({ createdAt: ts(1), lastEditedAt: ts(2), version: 3, ...o });

describe('notes create (rules: plcNotesVersion, plcNotesTodosWave2)', () => {
  it('allows a note with kind/meetingId/version/deletedAt', () => {
    expect(
      checkWrite('notes', 'n1', null, note({ deletedAt: null }), ctx())
    ).toBe('ok');
  });
  it('allows legacy int times and absent optional fields', () => {
    const n = note({ createdAt: 5, lastEditedAt: 6 });
    delete n.kind;
    delete n.meetingId;
    delete n.version;
    expect(checkWrite('notes', 'n1', null, n, ctx())).toBe('ok');
  });
  it.each([
    ['an unknown field', { extra: 1 }],
    ['a non-int version', { version: 1.5 }],
    ['a string version', { version: '1' }],
    ['an out-of-union kind', { kind: 'other' }],
    ['a mismatched id', { id: 'other' }],
    ['createdBy not the caller', { createdBy: 'bob' }],
    ['lastEditedBy not the caller', { lastEditedBy: 'bob' }],
    ['a non-string title', { title: 1 }],
    ['a non-string meetingId', { meetingId: 3 }],
    ['over 200 action items', { actionItems: new Array(201).fill({}) }],
    ['a non-list actionItems', { actionItems: {} }],
    ['over 100 blocks', { blocks: new Array(101).fill({}) }],
    ['a non-int meetingAt', { meetingAt: 'soon' }],
    ['a non-string yState', { yState: 7 }],
    ['a string deletedAt', { deletedAt: 'x' }],
    ['a map createdAt', { createdAt: { seconds: 1, nanoseconds: 0 } }],
    ['an unsafe-integer version', { version: 9007199254740992 }],
    ['a -0 meetingAt', { meetingAt: -0 }],
    ['a huge int-millis createdAt', { createdAt: 1e300 }],
  ])('denies %s', (_label, patch) => {
    expect(checkWrite('notes', 'n1', null, note(patch), ctx())).toBe('invalid');
  });
  it('denies a missing title or body', () => {
    const n = note();
    delete n.body;
    expect(checkWrite('notes', 'n1', null, n, ctx())).toBe('invalid');
  });
  it('allows 200 action items, 100 blocks, int meetingAt', () => {
    expect(
      checkWrite(
        'notes',
        'n1',
        null,
        note({
          actionItems: new Array(200).fill({}),
          blocks: new Array(100).fill({}),
          meetingAt: 123,
        }),
        ctx()
      )
    ).toBe('ok');
  });
});

describe('notes update (rules: plcNotesVersion)', () => {
  const edit = (patch: StubData, prev = storedNote()) =>
    checkWrite('notes', 'n1', prev, merge(prev, patch), ctx('bob'));
  const stamp = { lastEditedBy: 'bob', lastEditedAt: NOW };

  it('allows a different member bumping version by exactly +1', () => {
    expect(edit({ ...stamp, title: 'X', version: 4 })).toBe('ok');
  });
  it.each([
    ['skips a version', 5],
    ['does not bump', 3],
    ['goes backwards', 2],
  ])('calls it a conflict when the write %s', (_l, version) => {
    expect(edit({ ...stamp, version })).toBe('versionConflict');
  });
  it('conflicts when the write introduces a version onto an unversioned note', () => {
    const prev = storedNote();
    delete prev.version;
    expect(edit({ ...stamp, version: 1 }, prev)).toBe('versionConflict');
  });
  it('allows an update where both stored and incoming omit version', () => {
    const prev = storedNote();
    delete prev.version;
    expect(edit({ ...stamp, body: 'Y' }, prev)).toBe('ok');
  });
  it('requires the editor to stamp themselves into lastEditedBy', () => {
    expect(edit({ lastEditedAt: NOW, version: 4 })).toBe('invalid');
  });
  it('keeps createdBy and createdAt immutable', () => {
    expect(edit({ ...stamp, version: 4, createdBy: 'bob' })).toBe('invalid');
    expect(edit({ ...stamp, version: 4, createdAt: ts(9) })).toBe('invalid');
    expect(edit({ ...stamp, version: 4, id: 'n2' })).toBe('invalid');
  });
  it('denies a note whose stored doc lacks createdAt (unchanged needs both)', () => {
    const prev = storedNote();
    delete prev.createdAt;
    expect(edit({ ...stamp, version: 4 }, prev)).toBe('invalid');
  });
  it('allows a soft-delete tombstone and a restore with the bump', () => {
    expect(edit({ ...stamp, version: 4, deletedAt: 99 })).toBe('ok');
    expect(edit({ ...stamp, version: 4, deletedAt: null })).toBe('ok');
  });
  it('denies a shape break even with a good version', () => {
    expect(edit({ ...stamp, version: 4, kind: 'bad' })).toBe('invalid');
    expect(edit({ ...stamp, version: 4, junk: 1 })).toBe('invalid');
  });
});

// ── meetings ──

const meeting = (o: StubData = {}): StubData => ({
  id: 'm1',
  heldAt: NOW,
  facilitatorUid: 'alice',
  attendeeUids: [],
  assessmentIds: [],
  decisions: [],
  actionItems: [],
  status: 'in-progress',
  createdBy: 'alice',
  updatedAt: NOW,
  ...o,
});
const storedMeeting = (o: StubData = {}) =>
  meeting({ heldAt: ts(1), updatedAt: ts(2), ...o });

describe('meetings (rules: plcMeetings)', () => {
  it('allows the locked schema, with or without agenda/notesBody', () => {
    expect(checkWrite('meetings', 'm1', null, meeting(), ctx())).toBe('ok');
    expect(
      checkWrite(
        'meetings',
        'm1',
        null,
        meeting({ agenda: 'a', notesBody: 'b', status: 'completed' }),
        ctx()
      )
    ).toBe('ok');
  });
  it.each([
    ['a mismatched id', { id: 'x' }],
    ['createdBy not the caller', { createdBy: 'bob' }],
    ['an unknown status', { status: 'draft' }],
    ['decisions not a list', { decisions: {} }],
    ['attendeeUids not a list', { attendeeUids: 'a' }],
    ['an extra field', { extra: true }],
    ['a non-string agenda', { agenda: 1 }],
    ['a double heldAt', { heldAt: 1.5 }],
  ])('denies create with %s', (_l, patch) => {
    expect(checkWrite('meetings', 'm1', null, meeting(patch), ctx())).toBe(
      'invalid'
    );
  });
  it('denies create missing facilitatorUid', () => {
    const m = meeting();
    delete m.facilitatorUid;
    expect(checkWrite('meetings', 'm1', null, m, ctx())).toBe('invalid');
  });
  const upd = (patch: StubData) =>
    checkWrite(
      'meetings',
      'm1',
      storedMeeting(),
      merge(storedMeeting(), patch),
      ctx('bob')
    );
  it('any member updates working fields, soft-deletes and restores', () => {
    expect(upd({ status: 'completed', decisions: [{}], updatedAt: NOW })).toBe(
      'ok'
    );
    expect(upd({ deletedAt: 5, updatedAt: NOW })).toBe('ok');
    expect(upd({ deletedAt: null, updatedAt: NOW })).toBe('ok');
  });
  it.each([
    ['createdBy', { createdBy: 'bob' }],
    ['heldAt', { heldAt: ts(7) }],
    ['facilitatorUid', { facilitatorUid: 'bob' }],
    ['status to unknown', { status: 'x' }],
    ['an extra field', { extra: 1 }],
  ])('denies update mutating %s', (_l, patch) => {
    expect(upd(patch)).toBe('invalid');
  });
});

// ── recordings ──

const recording = (o: StubData = {}): StubData => ({
  noteId: 'n1',
  recorderUid: 'alice',
  status: 'recording',
  parts: [],
  durationMs: 0,
  lastHeartbeatAt: NOW,
  createdAt: NOW,
  ...o,
});

describe('recordings (rules: plcRecordings)', () => {
  const create = (r: StubData, noteExists = true) =>
    checkWrite('recordings', 'r1', null, r, ctx('alice', { noteExists }));
  it('allows the recorder to start a recording on an existing note', () => {
    expect(create(recording())).toBe('ok');
    expect(create(recording({ audioExpiresAt: 1_000_000 + 2592000000 }))).toBe(
      'ok'
    );
  });
  it('denies a note that does not exist', () => {
    expect(create(recording(), false)).toBe('invalid');
  });
  it.each([
    ['someone else as recorder', { recorderUid: 'bob' }],
    ['a paused start', { status: 'paused' }],
    ['over 200 parts', { parts: new Array(201).fill({}) }],
    ['over 61 minutes', { durationMs: 3660001 }],
    ['negative duration', { durationMs: -1 }],
    ['a double duration', { durationMs: 1.5 }],
    [
      'an audio expiry past 30 days',
      { audioExpiresAt: 1_000_000 + 2592000001 },
    ],
    ['an extra field', { transcript: 'x' }],
    ['a non-string noteId', { noteId: 3 }],
  ])('denies create with %s', (_l, patch) => {
    expect(create(recording(patch))).toBe('invalid');
  });
  it('denies create missing a required field', () => {
    const r = recording();
    delete r.createdAt;
    expect(create(r)).toBe('invalid');
  });
  const stored = (o: StubData = {}) =>
    recording({ lastHeartbeatAt: ts(1), createdAt: ts(1), ...o });
  const upd = (patch: StubData, prev = stored(), uid = 'alice') =>
    checkWrite('recordings', 'r1', prev, merge(prev, patch), ctx(uid));
  it('allows the recorder to pause, add parts and heartbeat', () => {
    expect(
      upd({
        status: 'paused',
        parts: [{}],
        durationMs: 10,
        lastHeartbeatAt: NOW,
      })
    ).toBe('ok');
  });
  it('denies a teammate updating the recording', () => {
    expect(upd({ lastHeartbeatAt: NOW }, stored(), 'bob')).toBe('invalid');
  });
  it('denies leaving the live states or writing server-owned fields', () => {
    expect(upd({ status: 'finalizing' })).toBe('invalid');
    expect(
      upd({ lastHeartbeatAt: NOW }, stored({ status: 'finalizing' }))
    ).toBe('invalid');
    expect(upd({ noteId: 'n2' })).toBe('invalid');
    expect(upd({ audioExpiresAt: 5 })).toBe('invalid');
  });
  it('allows rewriting an unchanged non-live field', () => {
    expect(upd({ noteId: 'n1', lastHeartbeatAt: NOW })).toBe('ok');
  });
});

// ── noteDocs ──

describe('noteDocs (rules: plcNoteDocs)', () => {
  const nd = (o: StubData = {}): StubData => ({
    fileId: 'f',
    url: 'https://docs.google.com/document/d/abc/edit',
    createdBy: 'alice',
    createdAt: NOW,
    ...o,
  });
  it('allows the first create', () => {
    expect(checkWrite('noteDocs', 'n1', null, nd(), ctx())).toBe('ok');
  });
  it.each([
    ['createdBy not the caller', { createdBy: 'bob' }],
    [
      'a non-Docs url',
      { url: 'https://evil.example/https://docs.google.com/' },
    ],
    ['a lookalike host', { url: 'https://docsxgoogle.com/a' }],
    ['an extra field', { title: 'x' }],
    ['a non-string fileId', { fileId: 1 }],
  ])('denies %s', (_l, patch) => {
    expect(checkWrite('noteDocs', 'n1', null, nd(patch), ctx())).toBe(
      'invalid'
    );
  });
  it('denies any update (first doc wins)', () => {
    expect(checkWrite('noteDocs', 'n1', nd(), nd(), ctx())).toBe('invalid');
  });
});

// ── comments ──

const comment = (o: StubData = {}): StubData => ({
  id: 'c1',
  targetType: 'note',
  targetId: 'n1',
  authorUid: 'alice',
  authorName: 'Alice',
  body: 'hi',
  mentions: [],
  createdAt: NOW,
  ...o,
});

describe('comments (rules: plcComments)', () => {
  it('allows a comment authored by the caller', () => {
    expect(checkWrite('comments', 'c1', null, comment(), ctx())).toBe('ok');
    expect(
      checkWrite(
        'comments',
        'c1',
        null,
        comment({ targetType: 'dataCard', editedAt: null }),
        ctx()
      )
    ).toBe('ok');
  });
  it.each([
    ['someone else as author', { authorUid: 'bob' }],
    ['a mismatched id', { id: 'c2' }],
    ['a targetType outside the union', { targetType: 'todo' }],
    ['non-list mentions', { mentions: 'bob' }],
    ['an extra field', { pinned: true }],
    ['a string editedAt', { editedAt: 'now' }],
  ])('denies create with %s', (_l, patch) => {
    expect(checkWrite('comments', 'c1', null, comment(patch), ctx())).toBe(
      'invalid'
    );
  });
  const stored = (o: StubData = {}) => comment({ createdAt: ts(1), ...o });
  const upd = (patch: StubData, uid: string, prev = stored()) =>
    checkWrite('comments', 'c1', prev, merge(prev, patch), ctx(uid));
  it('the author edits body and editedAt, and soft-deletes', () => {
    expect(upd({ body: 'edited', editedAt: 5 }, 'alice')).toBe('ok');
    expect(upd({ deletedAt: NOW }, 'alice')).toBe('ok');
  });
  it('a non-author member soft-deletes and restores but cannot edit', () => {
    expect(upd({ deletedAt: NOW }, 'bob')).toBe('ok');
    expect(upd({ deletedAt: null }, 'bob', stored({ deletedAt: ts(3) }))).toBe(
      'ok'
    );
    expect(upd({ body: 'mine' }, 'bob')).toBe('invalid');
    expect(upd({ editedAt: 9 }, 'bob')).toBe('invalid');
  });
  it('a non-author may leave an existing editedAt as it is', () => {
    expect(upd({ deletedAt: 1 }, 'bob', stored({ editedAt: ts(4) }))).toBe(
      'ok'
    );
  });
  it.each([
    ['authorUid', { authorUid: 'bob' }],
    ['targetId', { targetId: 'n2' }],
    ['mentions', { mentions: ['carol'] }],
    ['authorName', { authorName: 'Eve' }],
    ['createdAt', { createdAt: ts(8) }],
  ])('denies mutating %s', (_l, patch) => {
    expect(upd(patch, 'alice')).toBe('invalid');
  });
});

// ── helpers ──

describe('canEditPlcContent (plcCanEditContent)', () => {
  it('allows a member, a legacy array-only member and an unkeyed member', () => {
    expect(
      canEditPlcContent(
        { memberUids: ['a'], members: { a: { role: 'member' } } },
        'a'
      )
    ).toBe(true);
    expect(canEditPlcContent({ memberUids: ['a'] }, 'a')).toBe(true);
    expect(canEditPlcContent({ memberUids: ['a'], members: {} }, 'a')).toBe(
      true
    );
  });
  it('denies a viewer, a removed member and a malformed doc', () => {
    expect(
      canEditPlcContent(
        { memberUids: ['a'], members: { a: { role: 'viewer' } } },
        'a'
      )
    ).toBe(false);
    expect(
      canEditPlcContent(
        { memberUids: ['b'], members: { a: { role: 'member' } } },
        'a'
      )
    ).toBe(false);
    expect(canEditPlcContent({ members: { a: { role: 'member' } } }, 'a')).toBe(
      false
    );
    expect(
      canEditPlcContent({ memberUids: ['a'], members: { a: 'lead' } }, 'a')
    ).toBe(false);
  });
});

describe('valuesEqual', () => {
  it('compares timestamps by instant and lists/maps by content', () => {
    expect(valuesEqual(ts(5), ts(5))).toBe(true);
    expect(valuesEqual(ts(5), ts(6))).toBe(false);
    expect(valuesEqual(ts(5), 5)).toBe(false);
    expect(valuesEqual([{ a: 1 }], [{ a: 1 }])).toBe(true);
    expect(valuesEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(valuesEqual(NOW, NOW)).toBe(false);
  });
});

describe('parsePlcNotesWrite', () => {
  const w = (o: StubData = {}) => ({
    coll: 'notes',
    id: 'n1',
    op: 'create',
    data: {},
    ...o,
  });
  it('accepts a well-formed request', () => {
    expect(
      parsePlcNotesWrite({ plcId: 'p', writes: [w()] }).writes[0].serverTime
    ).toEqual([]);
  });
  it.each([
    ['no writes', { plcId: 'p', writes: [] }],
    [
      'six writes',
      { plcId: 'p', writes: [1, 2, 3, 4, 5, 6].map((i) => w({ id: `n${i}` })) },
    ],
    ['a slash in the plc id', { plcId: 'p/x', writes: [w()] }],
    ['a slash in the doc id', { plcId: 'p', writes: [w({ id: 'a/b' })] }],
    ['another collection', { plcId: 'p', writes: [w({ coll: 'todos' })] }],
    ['a delete op', { plcId: 'p', writes: [w({ op: 'delete' })] }],
    ['the same doc twice', { plcId: 'p', writes: [w(), w()] }],
    [
      'a non-number expect',
      { plcId: 'p', writes: [w({ expect: { version: '1' } })] },
    ],
    [
      'a non-string serverTime',
      { plcId: 'p', writes: [w({ serverTime: [1] })] },
    ],
    [
      'a serverTime outside the keys',
      { plcId: 'p', writes: [w({ serverTime: ['__proto__'] })] },
    ],
    [
      'an expect key outside the keys',
      { plcId: 'p', writes: [w({ expect: { other: 1 } })] },
    ],
    [
      'a non-finite expect',
      { plcId: 'p', writes: [w({ expect: { version: Infinity } })] },
    ],
  ])('rejects %s', (_l, raw) => {
    expect(() => parsePlcNotesWrite(raw)).toThrow(PlcNotesWriteError);
  });
});

// ── runner ──

const PLC = {
  memberUids: ['alice', 'bob', 'val'],
  members: {
    alice: { role: 'lead' },
    bob: { role: 'member' },
    val: { role: 'viewer' },
  },
};
const caller = (uid: string, o: Partial<Caller> = {}): Caller => ({
  uid,
  emailLower: `${uid}@x.edu`,
  pinLogin: false,
  ...o,
});
const op = (
  o: Partial<PlcNotesWriteOp> &
    Pick<PlcNotesWriteOp, 'coll' | 'id' | 'op' | 'data'>
): PlcNotesWriteOp => ({
  serverTime: [],
  ...o,
});
const newNote = (id: string, uid = 'alice') =>
  op({
    coll: 'notes',
    id,
    op: 'create',
    data: {
      id,
      title: '',
      body: '',
      createdBy: uid,
      lastEditedBy: uid,
      version: 0,
    },
    serverTime: ['createdAt', 'lastEditedAt'],
  });
const reasonOf = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'ok';
  } catch (e) {
    if (e instanceof PlcNotesWriteError) return e.reason;
    throw e;
  }
};
const run = (
  stub: ReturnType<typeof makeStubFirestore>,
  c: Caller,
  writes: PlcNotesWriteOp[]
) =>
  runPlcNotesWrite(
    stub.db as unknown as admin.firestore.Firestore,
    c,
    { plcId: 'p', writes },
    {
      serverTimestamp: 'SERVER_TS',
      nowMs: 1_000_000,
    }
  );

describe('runPlcNotesWrite', () => {
  it('creates a note with server timestamps', async () => {
    const stub = makeStubFirestore({ 'plcs/p': PLC });
    expect(await reasonOf(run(stub, caller('alice'), [newNote('n1')]))).toBe(
      'ok'
    );
    expect(stub.get('plcs/p/notes/n1')).toMatchObject({
      createdAt: 'SERVER_TS',
      lastEditedAt: 'SERVER_TS',
      version: 0,
    });
  });
  it('denies a viewer, a non-member, a PIN token and a missing PLC', async () => {
    const stub = makeStubFirestore({ 'plcs/p': PLC });
    expect(
      await reasonOf(run(stub, caller('val'), [newNote('n1', 'val')]))
    ).toBe('notAllowed');
    expect(
      await reasonOf(run(stub, caller('eve'), [newNote('n1', 'eve')]))
    ).toBe('notAllowed');
    expect(
      await reasonOf(
        run(stub, caller('alice', { pinLogin: true }), [newNote('n1')])
      )
    ).toBe('notAllowed');
    expect(
      await reasonOf(run(makeStubFirestore(), caller('alice'), [newNote('n1')]))
    ).toBe('plcNotFound');
    expect(stub.writes).toEqual([]);
  });
  it('denies a deactivated operator-org member', async () => {
    const stub = makeStubFirestore({
      'plcs/p': PLC,
      'organizations/orono/members/alice@x.edu': { status: 'inactive' },
    });
    expect(await reasonOf(run(stub, caller('alice'), [newNote('n1')]))).toBe(
      'notAllowed'
    );
  });
  it('refuses a create over an existing doc and an update to a missing one', async () => {
    const stub = makeStubFirestore({
      'plcs/p': PLC,
      'plcs/p/notes/n1': storedNote(),
    });
    expect(await reasonOf(run(stub, caller('alice'), [newNote('n1')]))).toBe(
      'alreadyExists'
    );
    expect(
      await reasonOf(
        run(stub, caller('alice'), [
          op({
            coll: 'notes',
            id: 'n9',
            op: 'update',
            data: { lastEditedBy: 'alice' },
          }),
        ])
      )
    ).toBe('notFound');
  });
  it('reports a version conflict and a stale precondition', async () => {
    const stub = makeStubFirestore({
      'plcs/p': PLC,
      'plcs/p/notes/n1': storedNote(),
    });
    const upd = (version: number, expectMs?: Record<string, number | null>) =>
      op({
        coll: 'notes',
        id: 'n1',
        op: 'update',
        data: { lastEditedBy: 'bob', version },
        serverTime: ['lastEditedAt'],
        ...(expectMs ? { expect: expectMs } : {}),
      });
    expect(await reasonOf(run(stub, caller('bob'), [upd(9)]))).toBe(
      'versionConflict'
    );
    expect(
      await reasonOf(run(stub, caller('bob'), [upd(4, { version: 2 })]))
    ).toBe('stale');
    expect(
      await reasonOf(
        run(stub, caller('bob'), [upd(4, { version: 3, lastEditedAt: 1 })])
      )
    ).toBe('stale');
    expect(
      await reasonOf(
        run(stub, caller('bob'), [upd(4, { version: 3, lastEditedAt: 2 })])
      )
    ).toBe('ok');
    expect(stub.get('plcs/p/notes/n1')).toMatchObject({
      version: 4,
      lastEditedBy: 'bob',
    });
  });
  it('matches a sub-millisecond stored timestamp against the web SDK millis', async () => {
    // Admin toMillis floors; the web SDK keeps the fraction.
    const stored = {
      seconds: 1764000000,
      nanoseconds: 123456000,
      toMillis: () => 1764000000123,
    };
    const stub = makeStubFirestore({
      'plcs/p': PLC,
      'plcs/p/notes/n1': storedNote({ lastEditedAt: stored }),
    });
    const write = op({
      coll: 'notes',
      id: 'n1',
      op: 'update',
      data: { lastEditedBy: 'bob', version: 4 },
      serverTime: ['lastEditedAt'],
      expect: { version: 3, lastEditedAt: 1764000000123.456 },
    });
    expect(await reasonOf(run(stub, caller('bob'), [write]))).toBe('ok');
  });
  it('writes a batch all or nothing', async () => {
    const stub = makeStubFirestore({
      'plcs/p': PLC,
      'plcs/p/meetings/m1': storedMeeting(),
    });
    const good = op({
      coll: 'meetings',
      id: 'm1',
      op: 'update',
      data: { status: 'completed' },
      serverTime: ['updatedAt'],
    });
    const bad = op({ coll: 'meetings', id: 'm1x', op: 'update', data: {} });
    expect(
      await reasonOf(run(stub, caller('bob'), [newNote('n2', 'bob'), bad]))
    ).toBe('notFound');
    expect(stub.writes).toEqual([]);
    expect(
      await reasonOf(run(stub, caller('bob'), [newNote('n2', 'bob'), good]))
    ).toBe('ok');
    expect(stub.get('plcs/p/meetings/m1')).toMatchObject({
      status: 'completed',
      updatedAt: 'SERVER_TS',
    });
    expect(stub.has('plcs/p/notes/n2')).toBe(true);
  });
  it('checks the recording note exists', async () => {
    const rec = op({
      coll: 'recordings',
      id: 'r1',
      op: 'create',
      data: {
        noteId: 'n1',
        recorderUid: 'alice',
        status: 'recording',
        parts: [],
        durationMs: 0,
      },
      serverTime: ['lastHeartbeatAt', 'createdAt'],
    });
    const none = makeStubFirestore({ 'plcs/p': PLC });
    expect(await reasonOf(run(none, caller('alice'), [rec]))).toBe('invalid');
    const withNote = makeStubFirestore({
      'plcs/p': PLC,
      'plcs/p/notes/n1': storedNote(),
    });
    expect(await reasonOf(run(withNote, caller('alice'), [rec]))).toBe('ok');
  });
  it('treats a server-time field as a timestamp, never a string', async () => {
    const stub = makeStubFirestore({ 'plcs/p': PLC });
    const n = newNote('n1');
    expect(
      await reasonOf(
        run(stub, caller('alice'), [
          { ...n, serverTime: [...n.serverTime, 'title'] },
        ])
      )
    ).toBe('invalid');
  });
});
