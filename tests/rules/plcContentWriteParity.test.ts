// Parity: plcContentWriteV1's ported checks (functions/src/plcContentRules.ts) must allow exactly what firestore.rules allows.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  Timestamp,
  deleteDoc,
  deleteField,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  plcContentWriteAllowed,
  resolveWrite,
  SENTINEL_KEY,
  type Data,
  type PlcContentCollection,
} from '@/functions/src/plcContentRules';

const PROJECT_ID = 'spartboard-plc-content-parity';
const PLC_ID = 'plc-parity';
const RULES_PATH = fileURLToPath(
  new URL('../../firestore.rules', import.meta.url)
);

// A: lead, B: member, C: co-lead, V: viewer, N: not a member, R: removed co-lead still indexed, L: array-only member.
const CALLERS = ['A', 'B', 'C', 'V', 'N', 'R', 'L'] as const;
type Caller = (typeof CALLERS)[number];
const uidOf = (c: Caller) => `uid-${c}`;

const entry = (uid: string, role: string, status = 'active') => ({
  uid,
  role,
  status,
});
const PLC_DOC = {
  name: 'Parity PLC',
  leadUid: uidOf('A'),
  memberUids: ['A', 'B', 'C', 'V', 'R', 'L'].map((c) => uidOf(c as Caller)),
  members: {
    [uidOf('A')]: entry(uidOf('A'), 'lead'),
    [uidOf('B')]: entry(uidOf('B'), 'member'),
    [uidOf('C')]: entry(uidOf('C'), 'coLead'),
    [uidOf('V')]: entry(uidOf('V'), 'viewer'),
    [uidOf('R')]: entry(uidOf('R'), 'coLead', 'removed'),
  },
  createdAt: 1,
  updatedAt: 1,
};

// Marks a value as serverTimestamp() / deleteField() in a case, translated per side.
const SERVER_TS = { kind: 'serverTs' } as const;
const DELETE = { kind: 'delete' } as const;
type Special = typeof SERVER_TS | typeof DELETE;
const isSpecial = (v: unknown): v is Special => v === SERVER_TS || v === DELETE;

const TS = Timestamp.fromMillis(1_700_000_000_000);

const sharer = (owner: string) => ({
  sharedBy: owner,
  sharedByEmail: `${owner}@x.edu`,
  sharedByName: owner,
  sharedAt: 1000,
});

function baseDoc(coll: PlcContentCollection, id: string, owner: string): Data {
  switch (coll) {
    case 'quizzes':
      return {
        id,
        title: 'Quiz',
        questionCount: 5,
        syncGroupId: 'g1',
        ...sharer(owner),
        updatedAt: 1000,
        sessionMode: 'teacher',
        sessionOptions: { shuffleQuestions: true },
        attemptLimit: null,
        quizId: 'q1',
        folderId: null,
        archived: false,
        deletedAt: null,
      };
    case 'assessments':
      return {
        id,
        title: 'Unit test',
        kind: 'quiz',
        syncGroupId: 'g1',
        unitLabel: 'Unit 1',
        opensAt: null,
        dueAt: 2000,
        status: 'active',
        createdBy: owner,
        createdAt: 1000,
        updatedAt: 1000,
        deletedAt: null,
        sourceQuizId: 'q1',
        folderId: null,
      };
    case 'question_banks':
      return {
        id,
        title: 'Bank',
        questionCount: 3,
        syncGroupId: 'g1',
        targetIds: ['t1'],
        ...sharer(owner),
        updatedAt: 1000,
        deletedAt: null,
      };
    case 'video_activities':
      return {
        id,
        title: 'Video',
        youtubeUrl: 'https://youtu.be/x',
        questionCount: 2,
        syncGroupId: 'g1',
        ...sharer(owner),
        updatedAt: 1000,
      };
    case 'rubrics':
      return {
        id,
        title: 'Rubric',
        description: 'd',
        criteria: [{ id: 'c1' }],
        createdAt: 900,
        updatedAt: 1000,
        ...sharer(owner),
      };
    case 'flashcard_sets':
      return {
        id,
        title: 'Set',
        description: 'd',
        termLanguage: 'en',
        definitionLanguage: 'es',
        cards: [{ id: 'k1', term: 'a', definition: 'b' }],
        createdAt: 900,
        updatedAt: 1000,
        ...sharer(owner),
        speak: { enabled: true },
      };
    case 'flashcard_results':
      return {
        id,
        setId: 's1',
        setTitle: 'Set',
        kind: 'check',
        classLabel: 'Period 1',
        students: 20,
        completed: 12,
        averagePercent: 72.5,
        cards: [],
        ...sharer(owner),
        updatedAt: 1000,
      };
    case 'assignments':
      return {
        id,
        quizTitle: 'Quiz',
        quizId: 'q1',
        syncGroupId: 'g1',
        sessionMode: 'auto',
        sessionOptions: {},
        attemptLimit: 2,
        ...sharer(owner),
        updatedAt: 1000,
      };
    case 'assignment_index':
      return {
        id,
        kind: 'quiz',
        ownerUid: owner,
        ownerName: 'A',
        ownerEmail: 'a@x.edu',
        title: 'Quiz',
        sheetUrl: 'https://docs.google.com/spreadsheets/d/1',
        status: 'active',
        createdAt: 1000,
      };
    case 'docs':
      return {
        id,
        title: 'Doc',
        url: 'https://docs.google.com/document/d/1',
        createdBy: owner,
        createdByName: 'A',
        createdAt: TS,
        updatedAt: TS,
        deletedAt: null,
        actionItems: [],
      };
  }
}

// Values each field is flipped to (DELETE drops it).
const VARIANTS: unknown[] = [
  DELETE,
  null,
  'str',
  '',
  7,
  -1,
  -0,
  7.5,
  1e300,
  true,
  {},
  { a: 1 },
  [],
  SERVER_TS,
];
const EXTRA_KEYS = [
  'order',
  'dirtyAt',
  'zzz',
  'description',
  'speak',
  'actionItems',
];

interface Case {
  name: string;
  coll: PlcContentCollection;
  docId: string;
  caller: Caller;
  existing: Data | null;
  op: 'set' | 'update' | 'delete';
  data?: Data;
}

let n = 0;
const nextId = () => `d${++n}`;

function variantsOf(d: Data, keys: string[]): Array<[string, Data]> {
  const out: Array<[string, Data]> = [];
  for (const k of keys) {
    for (const v of VARIANTS) {
      const next = { ...d };
      if (v === DELETE) delete next[k];
      else next[k] = v;
      out.push([`${k}=${JSON.stringify(v)}`, next]);
    }
  }
  return out;
}

function casesFor(coll: PlcContentCollection): Case[] {
  const cases: Case[] = [];
  const owner = uidOf('A');
  const keyList = (d: Data) => [...Object.keys(d), ...EXTRA_KEYS];

  // Create: every caller as owner, impersonation, a wrong id, then each field flipped.
  for (const c of CALLERS) {
    const id = nextId();
    cases.push({
      name: `create by ${c}`,
      coll,
      docId: id,
      caller: c,
      existing: null,
      op: 'set',
      data: baseDoc(coll, id, uidOf(c)),
    });
  }
  {
    const id = nextId();
    cases.push({
      name: 'create impersonating A',
      coll,
      docId: id,
      caller: 'B',
      existing: null,
      op: 'set',
      data: baseDoc(coll, id, owner),
    });
    const id2 = nextId();
    cases.push({
      name: 'create with a wrong id',
      coll,
      docId: id2,
      caller: 'B',
      existing: null,
      op: 'set',
      data: baseDoc(coll, 'other', uidOf('B')),
    });
  }
  const createBase = baseDoc(coll, 'X', uidOf('B'));
  for (const k of keyList(createBase)) {
    for (const v of VARIANTS) {
      const id = nextId();
      const d = baseDoc(coll, id, uidOf('B'));
      if (v === DELETE) delete d[k];
      else d[k] = v;
      cases.push({
        name: `create ${k}=${JSON.stringify(v)}`,
        coll,
        docId: id,
        caller: 'B',
        existing: null,
        op: 'set',
        data: d,
      });
    }
  }

  // Update of A's doc: a title edit by every caller, then each field patched by B and by A.
  const titleKey =
    coll === 'assignments'
      ? 'quizTitle'
      : coll === 'flashcard_results'
        ? 'setTitle'
        : 'title';
  for (const c of CALLERS) {
    const id = nextId();
    cases.push({
      name: `update by ${c}`,
      coll,
      docId: id,
      caller: c,
      existing: baseDoc(coll, id, owner),
      op: 'update',
      data: { [titleKey]: 'New', updatedAt: 2000 },
    });
  }
  for (const c of ['A', 'B'] as const) {
    for (const k of keyList(createBase)) {
      for (const v of VARIANTS) {
        const id = nextId();
        cases.push({
          name: `update by ${c} ${k}=${JSON.stringify(v)}`,
          coll,
          docId: id,
          caller: c,
          existing: baseDoc(coll, id, owner),
          op: 'update',
          data: { [k]: v },
        });
      }
    }
  }
  // Legacy doc missing an attribution field, and a server-written dirtyAt that must round-trip.
  {
    const id = nextId();
    const legacy = baseDoc(coll, id, owner);
    delete legacy[
      coll === 'docs' || coll === 'assessments'
        ? 'createdAt'
        : coll === 'assignment_index'
          ? 'createdAt'
          : 'sharedByEmail'
    ];
    cases.push({
      name: 'update of a legacy doc',
      coll,
      docId: id,
      caller: 'B',
      existing: legacy,
      op: 'update',
      data: { updatedAt: 2000 },
    });
    const id2 = nextId();
    cases.push({
      name: 'update keeping dirtyAt',
      coll,
      docId: id2,
      caller: 'B',
      existing: { ...baseDoc(coll, id2, owner), dirtyAt: TS },
      op: 'update',
      data: { updatedAt: 2000 },
    });
    const id3 = nextId();
    cases.push({
      name: 'update clearing dirtyAt',
      coll,
      docId: id3,
      caller: 'B',
      existing: { ...baseDoc(coll, id3, owner), dirtyAt: TS },
      op: 'update',
      data: { dirtyAt: null },
    });
  }
  // Set over an existing doc is an update: whole-doc replacements by B.
  for (const [label, d] of variantsOf(
    baseDoc(coll, 'X', owner),
    Object.keys(createBase)
  )) {
    const id = nextId();
    cases.push({
      name: `set over existing ${label}`,
      coll,
      docId: id,
      caller: 'B',
      existing: baseDoc(coll, id, owner),
      op: 'set',
      data: { ...d, ...('id' in d ? { id } : {}) },
    });
  }
  // Delete: every caller, on an existing doc and on a missing one.
  for (const c of CALLERS) {
    const id = nextId();
    cases.push({
      name: `delete by ${c}`,
      coll,
      docId: id,
      caller: c,
      existing: baseDoc(coll, id, owner),
      op: 'delete',
    });
    const id2 = nextId();
    cases.push({
      name: `delete missing by ${c}`,
      coll,
      docId: id2,
      caller: c,
      existing: null,
      op: 'delete',
    });
  }
  return cases;
}

const toClient = (d: Data, op: 'set' | 'update'): Data => {
  const out: Data = {};
  for (const [k, v] of Object.entries(d)) {
    if (v === DELETE) {
      if (op === 'update') out[k] = deleteField();
    } else out[k] = v === SERVER_TS ? serverTimestamp() : v;
  }
  return out;
};

const toCallable = (d: Data): Data => {
  const out: Data = {};
  for (const [k, v] of Object.entries(d)) {
    out[k] = isSpecial(v)
      ? { [SENTINEL_KEY]: v === SERVER_TS ? 'serverTime' : 'deleteField' }
      : v;
  }
  return out;
};

function serverAllows(c: Case): boolean | 'not-found' {
  if (c.op === 'update' && !c.existing) return 'not-found';
  const method =
    c.op === 'delete' ? 'delete' : c.existing ? 'update' : 'create';
  const data = c.op === 'delete' ? undefined : toCallable(c.data ?? {});
  // The callable refuses deleteField outside an update before any rule runs.
  if (c.op === 'set' && Object.values(c.data ?? {}).includes(DELETE)) {
    const dropped: Data = {};
    for (const [k, v] of Object.entries(c.data ?? {}))
      if (v !== DELETE) dropped[k] = v;
    return serverAllows({ ...c, data: dropped });
  }
  const { incoming } =
    c.op === 'delete'
      ? { incoming: {} }
      : resolveWrite(
          { op: c.op, coll: c.coll, id: c.docId, data },
          c.existing,
          {
            serverTime: () => null,
            deleteField: () => null,
            now: () => Timestamp.now(),
          }
        );
  return plcContentWriteAllowed({
    method,
    coll: c.coll,
    docId: c.docId,
    uid: uidOf(c.caller),
    plc: PLC_DOC,
    incoming,
    existing: c.existing,
  });
}

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(RULES_PATH, 'utf8'),
      host: process.env.FIRESTORE_EMULATOR_HOST?.split(':')[0] ?? '127.0.0.1',
      port: Number(
        process.env.FIRESTORE_EMULATOR_HOST?.split(':')[1] ?? '8080'
      ),
    },
  });
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `plcs/${PLC_ID}`), PLC_DOC);
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

async function rulesAllow(c: Case): Promise<boolean> {
  const db = testEnv
    .authenticatedContext(uidOf(c.caller), {
      email: `${uidOf(c.caller)}@x.edu`,
    })
    .firestore();
  const ref = doc(db, `plcs/${PLC_ID}/${c.coll}/${c.docId}`);
  try {
    if (c.op === 'delete') await deleteDoc(ref);
    else if (c.op === 'update')
      await updateDoc(ref, toClient(c.data ?? {}, 'update'));
    else await setDoc(ref, toClient(c.data ?? {}, 'set'));
    return true;
  } catch (err) {
    if ((err as { code?: string }).code === 'permission-denied') return false;
    throw err;
  }
}

const COLLECTIONS: PlcContentCollection[] = [
  'quizzes',
  'assessments',
  'question_banks',
  'video_activities',
  'rubrics',
  'flashcard_sets',
  'flashcard_results',
  'assignments',
  'assignment_index',
  'docs',
];

describe('plcContentWriteV1 checks match firestore.rules', () => {
  for (const coll of COLLECTIONS) {
    it(`${coll}: every case gets the same answer`, async () => {
      const cases = casesFor(coll);
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        const seeded = cases.flatMap((c) =>
          c.existing ? [{ id: c.docId, data: c.existing }] : []
        );
        for (let i = 0; i < seeded.length; i += 400) {
          const batch = writeBatch(ctx.firestore());
          for (const c of seeded.slice(i, i + 400)) {
            batch.set(
              doc(ctx.firestore(), `plcs/${PLC_ID}/${coll}/${c.id}`),
              c.data
            );
          }
          await batch.commit();
        }
      });
      const mismatches: string[] = [];
      let allowed = 0;
      for (let i = 0; i < cases.length; i += 25) {
        const chunk = cases.slice(i, i + 25);
        const results = await Promise.all(chunk.map((c) => rulesAllow(c)));
        chunk.forEach((c, j) => {
          const server = serverAllows(c);
          const rules = results[j];
          if (rules) allowed++;
          // An update to a missing doc is denied by the rules and is not-found on the server; both refuse.
          const serverAllowed = server === 'not-found' ? false : server;
          if (serverAllowed !== rules)
            mismatches.push(
              `${c.name}: rules ${rules ? 'allow' : 'deny'}, server ${serverAllowed ? 'allow' : 'deny'}`
            );
        });
      }
      expect(mismatches).toEqual([]);
      // The matrix must exercise both outcomes.
      expect(allowed).toBeGreaterThan(5);
      expect(cases.length - allowed).toBeGreaterThan(5);
    }, 240_000);
  }
});
