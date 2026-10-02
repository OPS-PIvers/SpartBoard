import { beforeEach, describe, expect, it, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { ToolContext } from './activity';
import {
  buildClaudeDraft,
  canEditPlc,
  draftBlocker,
  draftState,
  registerMeetingTools,
} from './meetingTools';

const granted = vi.hoisted(() => ({ value: true }));
vi.mock('../quizMediaArchive', () => ({
  isGlobalFeatureGranted: vi.fn(() => Promise.resolve(granted.value)),
}));

type Data = Record<string, unknown>;

// Just enough Firestore for the tool handlers: docs by path, transactions, batches and getAll.
function fakeDb(seed: Record<string, Data>) {
  const docs = new Map(Object.entries(seed));
  let seq = 0;
  const docRef = (path: string): Data => ({
    path,
    id: path.split('/').pop(),
    get: () => Promise.resolve(snap(path)),
    collection: (name: string) => collection(`${path}/${name}`),
  });
  const snap = (path: string) => ({
    id: path.split('/').pop(),
    exists: docs.has(path),
    data: () => docs.get(path),
    get: (k: string) => docs.get(path)?.[k],
  });
  const collection = (path: string): Data => ({
    doc: (id?: string) => docRef(`${path}/${id ?? `auto${(seq += 1)}`}`),
    where: (field: string, _op: string, value: unknown) => ({
      limit: () => ({
        get: () =>
          Promise.resolve({
            docs: [...docs.keys()]
              .filter(
                (k) =>
                  k.startsWith(`${path}/`) &&
                  k.split('/').length === path.split('/').length + 1 &&
                  ((docs.get(k)?.[field] as unknown[]) ?? []).includes(value)
              )
              .map(snap),
          }),
      }),
    }),
    orderBy: () => ({
      limit: () => ({
        get: () => {
          const rows = [...docs.keys()]
            .filter(
              (k) =>
                k.startsWith(`${path}/`) &&
                k.split('/').length === path.split('/').length + 1
            )
            .map(snap)
            .sort(
              (a, b) =>
                Number(b.data()?.createdAt ?? 0) -
                Number(a.data()?.createdAt ?? 0)
            );
          return Promise.resolve({ docs: rows, size: rows.length });
        },
      }),
    }),
  });
  const write = (ref: Data, data: Data, merge = true) => {
    const path = ref.path as string;
    docs.set(path, merge ? { ...(docs.get(path) ?? {}), ...data } : data);
  };
  const db = {
    collection,
    doc: docRef,
    getAll: (...refs: Data[]) =>
      Promise.resolve(refs.map((r) => snap(r.path as string))),
    runTransaction: async <T>(fn: (tx: Data) => Promise<T>) =>
      fn({
        get: (ref: Data) => Promise.resolve(snap(ref.path as string)),
        update: (ref: Data, data: Data) => write(ref, data),
        set: (ref: Data, data: Data, opts?: { merge?: boolean }) =>
          write(ref, data, Boolean(opts?.merge)),
      }),
    batch: () => {
      const staged: [Data, Data][] = [];
      return {
        set: (ref: Data, data: Data) => staged.push([ref, data]),
        commit: () => {
          staged.forEach(([r, d]) => write(r, d, false));
          return Promise.resolve();
        },
      };
    },
  };
  return { db, docs };
}

const plc = {
  name: 'Grade 7 Science',
  memberUids: ['teacher', 'viewer', 'other'],
  members: {
    teacher: { role: 'lead', displayName: 'Ana Ruiz' },
    viewer: { role: 'viewer', displayName: 'Ben Cole' },
    other: { role: 'member', displayName: 'Cara Lund' },
  },
};

const transcribed = {
  noteId: 'n1',
  status: 'transcribed',
  hasTranscript: true,
  createdAt: 2_000,
  durationMs: 1_830_000,
};

function seed(rec: Data = transcribed): Record<string, Data> {
  return {
    'plcs/g1': plc,
    'plcs/g1/notes/n1': { title: 'Oct 1 meeting', deletedAt: null },
    'plcs/g1/recordings/r1': rec,
    'plcs/g1/recordings/r1/transcript/main': {
      segments: [
        { speaker: 1, startMs: 0, text: 'Let us start with the lab.' },
        { speaker: 2, startMs: 65_000, text: 'Cara will book the room.' },
      ],
    },
  };
}

async function connect(db: unknown, uid = 'teacher') {
  const server = new McpServer({ name: 't', version: '1' });
  const ctx = {
    db,
    uid,
    email: `${uid}@example.org`,
    grantId: 'g',
  } as unknown as ToolContext;
  registerMeetingTools(server, ctx);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'c', version: '1' });
  await Promise.all([server.connect(a), client.connect(b)]);
  return async (name: string, args: Data) => {
    const res = (await client.callTool({ name, arguments: args })) as {
      isError?: boolean;
      content: { text: string }[];
    };
    const text = res.content[0].text;
    return res.isError ? { error: text } : (JSON.parse(text) as Data);
  };
}

const draftArgs = {
  group_id: 'g1',
  recording_id: 'r1',
  agenda: ['Lab safety'],
  decisions: ['- Run the lab on Friday'],
  action_items: [{ text: 'Book the lab room', owner: 'Cara' }],
};

beforeEach(() => {
  granted.value = true;
});

describe('meeting draft rules', () => {
  it('treats viewers and removed members as read-only', () => {
    expect(canEditPlc(plc, 'teacher')).toBe(true);
    expect(canEditPlc(plc, 'viewer')).toBe(false);
    expect(canEditPlc({ memberUids: ['legacy'] }, 'legacy')).toBe(true);
    expect(canEditPlc(plc, 'stranger')).toBe(false);
  });

  it('refuses a draft while one waits for review or a run is going', () => {
    expect(draftBlocker(transcribed)).toBeNull();
    expect(draftBlocker({ ...transcribed, draft: { generatedAt: 1 } })).toMatch(
      /waiting for review/
    );
    expect(
      draftBlocker({
        ...transcribed,
        draft: { generatedAt: 1 },
        draftResolvedAt: 5,
        draftResolution: 'dismissed',
      })
    ).toBeNull();
    expect(draftBlocker({ ...transcribed, status: 'queued' })).toMatch(
      /right now/
    );
    expect(draftBlocker({ ...transcribed, hasTranscript: false })).toMatch(
      /no transcript/
    );
    expect(
      draftState({ draft: {}, draftResolvedAt: 3, draftResolution: 'inserted' })
    ).toBe('inserted');
  });

  it('builds the Gemini draft shape, cleaned and with matched owners', () => {
    let n = 0;
    const draft = buildClaudeDraft(
      {
        agenda: ['Lab safety'],
        discussion: [],
        decisions: ['- Run the lab on Friday'],
        action_items: [
          { text: 'Book the lab room', owner: 'Cara' },
          { text: 'Email families' },
        ],
      },
      plc,
      'teacher',
      42,
      () => `a${(n += 1)}`
    );
    expect(draft).toEqual({
      markdown:
        '## Agenda\n- Lab safety\n\n## Decisions\n- Run the lab on Friday',
      actionItems: [
        { id: 'a1', text: 'Book the lab room', suggestedOwnerUid: 'other' },
        { id: 'a2', text: 'Email families', suggestedOwnerUid: null },
      ],
      generatedAt: 42,
      generatedBy: 'teacher',
      source: 'claude',
    });
  });

  it('refuses empty notes', () => {
    expect(() =>
      buildClaudeDraft(
        { agenda: [' '], discussion: [], decisions: [], action_items: [] },
        plc,
        'teacher',
        1,
        () => 'x'
      )
    ).toThrow(/empty/);
  });
});

describe('meeting tools', () => {
  it('lists meetings with note titles and skips trashed notes', async () => {
    const { db } = fakeDb({
      ...seed(),
      'plcs/g1/recordings/r2': {
        ...transcribed,
        noteId: 'n2',
        createdAt: 3_000,
      },
      'plcs/g1/notes/n2': { title: 'Trashed', deletedAt: 9 },
    });
    const call = await connect(db);
    const out = await call('list_group_meetings', {});
    expect(out.groups).toEqual([
      { group_id: 'g1', name: 'Grade 7 Science', can_edit: true },
    ]);
    expect(out.meetings).toEqual([
      expect.objectContaining({
        recording_id: 'r1',
        note_title: 'Oct 1 meeting',
        duration_minutes: 30.5,
        has_transcript: true,
        notes_draft: 'none',
      }),
    ]);
  });

  it('reads a transcript as speaker lines', async () => {
    const { db } = fakeDb(seed());
    const call = await connect(db, 'viewer');
    const out = await call('get_meeting_transcript', {
      group_id: 'g1',
      recording_id: 'r1',
    });
    expect(out.transcript).toBe(
      '[0:00] Speaker 1: Let us start with the lab.\n[1:05] Speaker 2: Cara will book the room.'
    );
    expect(out.speaker_count).toBe(2);
  });

  it('hides groups the caller is not in', async () => {
    const { db } = fakeDb(seed());
    const call = await connect(db, 'stranger');
    const out = await call('get_meeting_transcript', {
      group_id: 'g1',
      recording_id: 'r1',
    });
    expect(out.error).toMatch(/not found/);
  });

  it('writes only the draft slot and logs the change', async () => {
    const { db, docs } = fakeDb(seed());
    const call = await connect(db);
    const out = await call('write_meeting_notes_draft', draftArgs);
    expect(out).toMatchObject({ note_title: 'Oct 1 meeting', action_items: 1 });
    const rec = docs.get('plcs/g1/recordings/r1') as Data;
    expect(rec.draft).toMatchObject({
      source: 'claude',
      generatedBy: 'teacher',
      markdown:
        '## Agenda\n- Lab safety\n\n## Decisions\n- Run the lab on Friday',
    });
    expect(rec.draftResolvedAt).toBeNull();
    expect(docs.get('plcs/g1/notes/n1')).toEqual({
      title: 'Oct 1 meeting',
      deletedAt: null,
    });
    const log = [...docs.entries()].find(([k]) =>
      k.startsWith('users/teacher/claude_activity/')
    );
    expect(log?.[1]).toMatchObject({
      action: 'create',
      itemType: 'meeting_notes',
      title: 'Oct 1 meeting',
    });

    const again = await call('write_meeting_notes_draft', draftArgs);
    expect(again.error).toMatch(/waiting for review/);
  });

  it('refuses viewers and accounts without the flag', async () => {
    const { db } = fakeDb(seed());
    const asViewer = await connect(db, 'viewer');
    expect(
      (await asViewer('write_meeting_notes_draft', draftArgs)).error
    ).toMatch(/Only editors/);

    granted.value = false;
    const call = await connect(db);
    expect((await call('list_group_meetings', {})).error).toMatch(
      /not turned on/
    );
  });
});
