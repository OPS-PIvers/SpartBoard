// Unit tests for plcSettingsV1: each case mirrors an allow or deny the firestore.rules branch made.
import { describe, it, expect, vi } from 'vitest';

vi.mock('./firebaseAdmin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: Object.assign(vi.fn(), {
    FieldValue: { serverTimestamp: () => 'TS', delete: () => 'DEL' },
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
  SettingsError,
  parseSettingsAction,
  runSettingsAction,
  type Caller,
} from './plcSettings';
import { makeStubFirestore, type StubData } from './testing/stubFirestore';

const fv = { ts: () => 'TS', del: () => 'DEL' };
const NOW = 1_700_000_000_000;

const m = (uid: string, role: string, extra: StubData = {}) => ({
  uid,
  email: `${uid}@orono.k12.mn.us`,
  displayName: uid,
  role,
  status: 'active',
  joinedAt: 1,
  ...extra,
});

const plc = (overrides: StubData = {}): StubData => ({
  name: 'Team',
  orgId: 'orono',
  leadUid: 'lead',
  memberUids: ['lead', 'co', 'mem', 'view', 'mentor', 'mentee'],
  members: {
    lead: m('lead', 'lead'),
    co: m('co', 'coLead'),
    mem: m('mem', 'member'),
    view: m('view', 'viewer'),
    mentor: m('mentor', 'member', { mentorRole: 'mentor' }),
    mentee: m('mentee', 'member', { mentorRole: 'mentee' }),
    gone: m('gone', 'coLead', { status: 'removed' }),
  },
  ...overrides,
});

const caller = (uid: string, over: Partial<Caller> = {}): Caller => ({
  uid,
  emailLower: `${uid}@orono.k12.mn.us`,
  emailVerified: true,
  viewAs: false,
  deactivated: false,
  pinLogin: false,
  studentRole: false,
  anonymous: false,
  ...over,
});

const staff = (uid: string, extra: StubData = {}) => ({
  [`organizations/orono/members/${uid}@orono.k12.mn.us`]: {
    status: 'active',
    roleId: 'teacher',
    ...extra,
  },
});

function setup(seed: Record<string, StubData> = {}) {
  const stub = makeStubFirestore({ 'plcs/p': plc(), ...seed });
  const db = stub.db as unknown as admin.firestore.Firestore;
  const run = (who: Caller, raw: StubData) =>
    runSettingsAction(db, who, parseSettingsAction(raw), fv, () => NOW);
  return { stub, run };
}

async function reasonOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof SettingsError) return e.reason;
    throw e;
  }
  return 'allowed';
}

describe('parseSettingsAction', () => {
  it('rejects unknown actions, missing ids and path ids', () => {
    expect(() => parseSettingsAction({ action: 'nope' })).toThrow(
      SettingsError
    );
    expect(() => parseSettingsAction({ action: 'delete' })).toThrow(
      SettingsError
    );
    expect(() =>
      parseSettingsAction({ action: 'delete', plcId: 'a/b' })
    ).toThrow(SettingsError);
    expect(() => parseSettingsAction(null)).toThrow(SettingsError);
  });

  it('refuses a malformed layout, calendar, template or labels', () => {
    const bad = [
      { action: 'setLayout', plcId: 'p', layout: { pages: [] } },
      { action: 'setCalendar', plcId: 'p', url: 'https://evil.example/x' },
      {
        action: 'setMeetingNoteTemplate',
        plcId: 'p',
        markdown: 'x'.repeat(20001),
      },
      { action: 'setNormingLabels', plcId: 'p', labels: { extra: 'x' } },
      {
        action: 'setNormingLabels',
        plcId: 'p',
        labels: { high: 'x'.repeat(41) },
      },
      { action: 'setMeetingCadence', plcId: 'p', cadence: 'weekly' },
      { action: 'rename', plcId: 'p', name: 'X', groupType: 'building' },
      {
        action: 'saveLearningTargets',
        plcId: 'p',
        targets: new Array(1001).fill({}),
      },
      {
        action: 'setMasteryCutoffs',
        plcId: 'p',
        cutoffs: { proficient: 50, approaching: 60 },
      },
      {
        action: 'setMasteryCutoffs',
        plcId: 'p',
        cutoffs: { proficient: 101, approaching: 60 },
      },
      {
        action: 'addWorkspaceDoc',
        plcId: 'p',
        workspaceId: 'w',
        link: { id: 'd', title: 't', url: 'http://x' },
      },
    ];
    for (const raw of bad) {
      expect(() => parseSettingsAction(raw), JSON.stringify(raw)).toThrow(
        SettingsError
      );
    }
  });
});

describe('create', () => {
  const create = {
    action: 'create',
    name: '  Grade 5  ',
    displayName: 'New Lead',
    orgId: 'orono',
    buildingId: 'b1',
  };

  it('lets district staff create a PLC they lead alone', async () => {
    const { stub, run } = setup(staff('new'));
    const res = await run(caller('new'), create);
    const doc = stub.get(`plcs/${res.plcId}`);
    expect(doc).toEqual({
      name: 'Grade 5',
      orgId: 'orono',
      buildingId: 'b1',
      members: {
        new: {
          uid: 'new',
          email: 'new@orono.k12.mn.us',
          displayName: 'New Lead',
          role: 'lead',
          joinedAt: 'TS',
          status: 'active',
        },
      },
      leadUid: 'new',
      memberUids: ['new'],
      memberEmails: { new: 'new@orono.k12.mn.us' },
      createdAt: 'TS',
      updatedAt: 'TS',
    });
  });

  it('keeps a valid layout with its switches and a teacher group type', async () => {
    const { stub, run } = setup(staff('new'));
    const layout = {
      pages: [],
      landing: 'home',
      cards: [],
      hero: { mode: 'default' },
    };
    const res = await run(caller('new'), {
      ...create,
      groupType: 'mentoring',
      layout,
      features: { notes: true },
    });
    const doc = stub.get(`plcs/${res.plcId}`)!;
    expect(doc.groupType).toBe('mentoring');
    expect(doc.layout).toEqual(layout);
    expect(doc.features).toEqual({ notes: true });
  });

  it('refuses callers who are not live district staff', async () => {
    const cases: Array<[Caller, Record<string, StubData>]> = [
      [caller('new'), {}],
      [caller('new'), staff('new', { roleId: 'student' })],
      [caller('new'), staff('new', { status: 'suspended' })],
      [caller('new', { emailVerified: false }), staff('new')],
      [caller('new', { studentRole: true }), staff('new')],
      [caller('new', { pinLogin: true }), staff('new')],
      [caller('new', { deactivated: true }), staff('new')],
      [caller('new', { emailLower: 'new@gmail.com' }), staff('new')],
    ];
    for (const [who, seed] of cases) {
      const { run } = setup(seed);
      expect(await reasonOf(run(who, create))).toBe('notAllowed');
    }
  });
});

describe('rename and delete', () => {
  it('lets only the lead rename, and keeps building groups building', async () => {
    const { stub, run } = setup();
    await run(caller('lead'), {
      action: 'rename',
      plcId: 'p',
      name: 'New name',
      groupType: 'department',
    });
    expect(stub.get('plcs/p')).toMatchObject({
      name: 'New name',
      groupType: 'department',
      updatedAt: 'TS',
    });
    expect(
      await reasonOf(
        run(caller('co'), { action: 'rename', plcId: 'p', name: 'X' })
      )
    ).toBe('notAllowed');
    const b = setup({ 'plcs/p': plc({ groupType: 'building' }) });
    expect(
      await reasonOf(
        b.run(caller('lead'), {
          action: 'rename',
          plcId: 'p',
          name: 'X',
          groupType: 'plc',
        })
      )
    ).toBe('notAllowed');
    await b.run(caller('lead'), { action: 'rename', plcId: 'p', name: 'Kept' });
    expect(b.stub.get('plcs/p')).toMatchObject({
      name: 'Kept',
      groupType: 'building',
    });
  });

  it('lets the lead delete the PLC with its invites', async () => {
    const { stub, run } = setup({
      'plc_invitations/i1': { plcId: 'p', status: 'pending' },
      'plc_invitations/i2': { plcId: 'other', status: 'pending' },
    });
    await run(caller('lead'), { action: 'delete', plcId: 'p' });
    expect(stub.has('plcs/p')).toBe(false);
    expect(stub.has('plc_invitations/i1')).toBe(false);
    expect(stub.has('plc_invitations/i2')).toBe(true);
  });

  it('lets a same-org admin delete, never another org or a View as tab', async () => {
    const admin = {
      'admins/ad@orono.k12.mn.us': {},
      ...staff('ad'),
    };
    const ok = setup(admin);
    await ok.run(caller('ad'), { action: 'delete', plcId: 'p' });
    expect(ok.stub.has('plcs/p')).toBe(false);

    const other = setup({ ...admin, 'plcs/p': plc({ orgId: 'elsewhere' }) });
    expect(
      await reasonOf(other.run(caller('ad'), { action: 'delete', plcId: 'p' }))
    ).toBe('notAllowed');
    const viewAs = setup(admin);
    expect(
      await reasonOf(
        viewAs.run(caller('ad', { viewAs: true }), {
          action: 'delete',
          plcId: 'p',
        })
      )
    ).toBe('notAllowed');
    const member = setup();
    expect(
      await reasonOf(member.run(caller('co'), { action: 'delete', plcId: 'p' }))
    ).toBe('notAllowed');
  });

  it('reports a missing PLC', async () => {
    const { run } = setup();
    expect(
      await reasonOf(
        run(caller('lead'), { action: 'rename', plcId: 'x', name: 'Y' })
      )
    ).toBe('plcNotFound');
  });
});

describe('member settings', () => {
  it('sets the shared sheet only while empty and returns the canonical URL', async () => {
    const { stub, run } = setup();
    const first = await run(caller('mem'), {
      action: 'setSharedSheetUrl',
      plcId: 'p',
      url: 'https://docs.google.com/a',
    });
    expect(first.url).toBe('https://docs.google.com/a');
    const second = await run(caller('view'), {
      action: 'setSharedSheetUrl',
      plcId: 'p',
      url: 'https://docs.google.com/b',
    });
    expect(second.url).toBe('https://docs.google.com/a');
    await run(caller('mem'), { action: 'clearSharedSheetUrl', plcId: 'p' });
    expect(stub.get('plcs/p')!.sharedSheetUrl).toBeNull();
    expect(
      await reasonOf(
        run(caller('outsider'), {
          action: 'setSharedSheetUrl',
          plcId: 'p',
          url: 'https://docs.google.com/c',
        })
      )
    ).toBe('notAllowed');
  });

  it('lets any current member set features and the digest flag', async () => {
    const { stub, run } = setup();
    await run(caller('view'), {
      action: 'setFeatures',
      plcId: 'p',
      features: { notes: false },
    });
    await run(caller('mem'), {
      action: 'setDigestOptIn',
      plcId: 'p',
      optIn: true,
    });
    expect(stub.get('plcs/p')).toMatchObject({
      features: { notes: false },
      digestOptIn: true,
    });
    const before = stub.writes.length;
    await run(caller('mem'), {
      action: 'setDigestOptIn',
      plcId: 'p',
      optIn: true,
    });
    expect(stub.writes.length).toBe(before);
    for (const raw of [
      { action: 'setFeatures', plcId: 'p', features: { notes: true } },
      { action: 'setDigestOptIn', plcId: 'p', optIn: false },
    ]) {
      expect(await reasonOf(run(caller('gone'), raw))).toBe('notAllowed');
    }
  });
});

describe('lead and co-lead settings', () => {
  const layout = {
    pages: ['home'],
    landing: 'home',
    cards: [],
    hero: { mode: 'pinned' },
  };
  const actions: StubData[] = [
    { action: 'setMeetingCadence', plcId: 'p', cadence: { every: 'week' } },
    { action: 'setNormingLabels', plcId: 'p', labels: { high: 'Strong' } },
    { action: 'setLayout', plcId: 'p', layout, features: { goals: true } },
    { action: 'setMeetingNoteTemplate', plcId: 'p', markdown: '# Notes' },
    {
      action: 'setCalendar',
      plcId: 'p',
      url: 'https://calendar.google.com/calendar/embed?src=x',
    },
    { action: 'setMentorRole', plcId: 'p', uid: 'mem', mentorRole: 'mentor' },
  ];

  it('lets a co-lead write each setting', async () => {
    const { stub, run } = setup({
      'plcs/p': plc({ features: { notes: true } }),
    });
    for (const raw of actions) await run(caller('co'), raw);
    const d = stub.get('plcs/p')!;
    expect(d).toMatchObject({
      meetingCadence: { every: 'week' },
      normingLevelLabels: { high: 'Strong' },
      layout,
      features: { notes: true, goals: true },
      meetingNoteTemplate: '# Notes',
      calendarEmbedUrl: 'https://calendar.google.com/calendar/embed?src=x',
    });
    expect((d.members as Record<string, StubData>).mem.mentorRole).toBe(
      'mentor'
    );
  });

  it('refuses plain members, viewers, removed co-leads and outsiders', async () => {
    for (const uid of ['mem', 'view', 'gone', 'outsider']) {
      const { run } = setup();
      for (const raw of actions) {
        expect(
          await reasonOf(run(caller(uid), raw)),
          `${uid} ${String(raw.action)}`
        ).toBe('notAllowed');
      }
    }
  });

  it('clears each setting with null', async () => {
    const { stub, run } = setup();
    for (const [action, key] of [
      ['setMeetingCadence', 'cadence'],
      ['setNormingLabels', 'labels'],
      ['setLayout', 'layout'],
      ['setMeetingNoteTemplate', 'markdown'],
      ['setCalendar', 'url'],
    ]) {
      await run(caller('lead'), { action, plcId: 'p', [key]: null });
    }
    expect(stub.get('plcs/p')).toMatchObject({
      meetingCadence: 'DEL',
      normingLevelLabels: 'DEL',
      layout: 'DEL',
      meetingNoteTemplate: 'DEL',
      calendarEmbedUrl: 'DEL',
    });
  });

  it('never tags the lead or someone without a member entry, and clears a tag', async () => {
    const { stub, run } = setup();
    for (const uid of ['lead', 'nobody']) {
      expect(
        await reasonOf(
          run(caller('co'), {
            action: 'setMentorRole',
            plcId: 'p',
            uid,
            mentorRole: 'mentee',
          })
        )
      ).toBe('notAllowed');
    }
    await run(caller('co'), {
      action: 'setMentorRole',
      plcId: 'p',
      uid: 'mentor',
      mentorRole: null,
    });
    const members = stub.get('plcs/p')!.members as Record<string, StubData>;
    expect(members.mentor).not.toHaveProperty('mentorRole');
    expect(members.mentee.mentorRole).toBe('mentee');
  });
});

describe('meta docs', () => {
  it('lets non-viewer members save learning targets', async () => {
    const { stub, run } = setup();
    await run(caller('mem'), {
      action: 'saveLearningTargets',
      plcId: 'p',
      targets: [{ id: 't1', label: 'Fractions' }],
      masteryCutoffs: { proficient: 80, approaching: 60 },
    });
    expect(stub.get('plcs/p/meta/learningTargets')).toEqual({
      targets: [{ id: 't1', label: 'Fractions' }],
      masteryCutoffs: { proficient: 80, approaching: 60 },
      updatedAt: NOW,
    });
    for (const uid of ['view', 'outsider']) {
      expect(
        await reasonOf(
          run(caller(uid), {
            action: 'saveLearningTargets',
            plcId: 'p',
            targets: [],
          })
        )
      ).toBe('notAllowed');
    }
  });

  it('sets mastery cutoffs and keeps the saved targets', async () => {
    const { stub, run } = setup({
      'plcs/p/meta/learningTargets': { targets: [{ id: 't' }], updatedAt: 1 },
    });
    await run(caller('mem'), {
      action: 'setMasteryCutoffs',
      plcId: 'p',
      cutoffs: { proficient: 70, approaching: 50 },
    });
    expect(stub.get('plcs/p/meta/learningTargets')).toEqual({
      targets: [{ id: 't' }],
      masteryCutoffs: { proficient: 70, approaching: 50 },
      updatedAt: NOW,
    });
    const fresh = setup();
    await fresh.run(caller('mem'), {
      action: 'setMasteryCutoffs',
      plcId: 'p',
      cutoffs: { proficient: 70, approaching: 50 },
    });
    expect(fresh.stub.get('plcs/p/meta/learningTargets')!.targets).toEqual([]);
  });

  const body = {
    name: 'Team scale',
    flags: [],
    categoriesEnabled: false,
    categories: [],
    scale: {},
    method: 'mean',
    studentVisibility: {},
    autoFlags: false,
  };

  it('lets leads and co-leads save and delete gradebook settings', async () => {
    const { stub, run } = setup();
    await run(caller('co'), {
      action: 'saveGradebookSettings',
      plcId: 'p',
      body,
    });
    expect(stub.get('plcs/p/meta/gradebookSettings')).toEqual({
      ...body,
      updatedBy: 'co',
      updatedAt: NOW,
    });
    await run(caller('lead'), {
      action: 'deleteGradebookSettings',
      plcId: 'p',
    });
    expect(stub.has('plcs/p/meta/gradebookSettings')).toBe(false);
  });

  it('refuses gradebook writes from members, anonymous tokens and bad bodies', async () => {
    const { run } = setup();
    const save = { action: 'saveGradebookSettings', plcId: 'p', body };
    expect(await reasonOf(run(caller('mem'), save))).toBe('notAllowed');
    expect(await reasonOf(run(caller('co', { anonymous: true }), save))).toBe(
      'notAllowed'
    );
    expect(
      await reasonOf(
        run(caller('mem'), { action: 'deleteGradebookSettings', plcId: 'p' })
      )
    ).toBe('notAllowed');
    for (const bad of [
      { ...body, name: '' },
      { ...body, method: 'median' },
      { ...body, extra: 1 },
      { ...body, flags: new Array(27).fill('x') },
    ]) {
      expect(await reasonOf(run(caller('co'), { ...save, body: bad }))).toBe(
        'notAllowed'
      );
    }
  });
});

describe('mentoring workspaces', () => {
  const mentoring = () => ({ 'plcs/p': plc({ groupType: 'mentoring' }) });
  const ws = (extra: StubData = {}) => ({
    mentorUid: 'mentor',
    menteeUid: 'mentee',
    memberUids: ['mentor', 'mentee'],
    mentorName: 'Mentor',
    menteeName: 'Mentee',
    actionItems: [],
    docs: [],
    taskStatus: {},
    ...extra,
  });
  const pair = (extra: StubData = {}) => ({
    ...mentoring(),
    'plcs/p/workspaces/mentor_mentee': ws(extra),
  });
  const pairing = {
    action: 'createPairing',
    plcId: 'p',
    mentorUid: 'mentor',
    menteeUid: 'mentee',
    mentorName: 'Mentor',
    menteeName: 'Mentee',
  };

  it('lets a facilitator pair a tagged mentor and mentee', async () => {
    const { stub, run } = setup(mentoring());
    const res = await run(caller('co'), pairing);
    expect(res.workspaceId).toBe('mentor_mentee');
    expect(stub.get('plcs/p/workspaces/mentor_mentee')).toEqual({
      ...ws(),
      createdAt: 'TS',
      updatedAt: 'TS',
    });
  });

  it('refuses pairings outside the rule', async () => {
    const cases: Array<[Record<string, StubData>, string, StubData]> = [
      [{}, 'co', pairing],
      [mentoring(), 'mem', pairing],
      [mentoring(), 'co', { ...pairing, mentorUid: 'mem' }],
      [
        mentoring(),
        'co',
        { ...pairing, mentorUid: 'mentee', menteeUid: 'mentor' },
      ],
      [mentoring(), 'co', { ...pairing, menteeUid: 'mentor' }],
    ];
    for (const [seed, uid, raw] of cases) {
      const { run } = setup(seed);
      expect(await reasonOf(run(caller(uid), raw))).toBe('notAllowed');
    }
  });

  it('removes a pairing with its check-ins and submissions', async () => {
    const { stub, run } = setup({
      ...pair(),
      'plcs/p/workspaces/mentor_mentee/checkins/c1': { id: 'c1' },
      'plcs/p/workspaces/mentor_mentee/submissions/t_mentee': {
        id: 't_mentee',
      },
    });
    expect(
      await reasonOf(
        run(caller('mentor'), {
          action: 'removePairing',
          plcId: 'p',
          workspaceId: 'mentor_mentee',
        })
      )
    ).toBe('notAllowed');
    await run(caller('lead'), {
      action: 'removePairing',
      plcId: 'p',
      workspaceId: 'mentor_mentee',
    });
    expect(
      [...stub.store.keys()].filter((k) => k.includes('workspaces'))
    ).toEqual([]);
  });

  it('adds doc links for the pair and facilitators only', async () => {
    const { stub, run } = setup(pair());
    const add = (id: string, ifAbsent = false) => ({
      action: 'addWorkspaceDoc',
      plcId: 'p',
      workspaceId: 'mentor_mentee',
      link: {
        id,
        title: 'Doc',
        url: 'https://docs.google.com/d',
        taskId: 't1',
      },
      ifAbsent,
    });
    expect((await run(caller('mentee'), add('a'))).listed).toBe(true);
    expect((await run(caller('co'), add('a', true))).listed).toBe(false);
    expect((await run(caller('co'), add('b'))).listed).toBe(true);
    const docs = stub.get('plcs/p/workspaces/mentor_mentee')!
      .docs as StubData[];
    expect(docs.map((d) => d.id)).toEqual(['a', 'b']);
    expect(docs[0]).toMatchObject({ addedBy: 'mentee', addedAt: NOW });
    for (const uid of ['mem', 'view', 'outsider']) {
      expect(await reasonOf(run(caller(uid), add('c')))).toBe('notAllowed');
    }
    const missing = setup(mentoring());
    expect((await missing.run(caller('co'), add('a'))).listed).toBe(false);
  });

  it('caps doc links at 100', async () => {
    const full = Array.from({ length: 100 }, (_, i) => ({
      id: `d${i}`,
      url: 'https://x',
    }));
    const { run } = setup(pair({ docs: full }));
    expect(
      await reasonOf(
        run(caller('mentor'), {
          action: 'addWorkspaceDoc',
          plcId: 'p',
          workspaceId: 'mentor_mentee',
          link: { id: 'new', title: 'T', url: 'https://x' },
          ifAbsent: false,
        })
      )
    ).toBe('notAllowed');
  });

  it('lets the pair add and toggle action items, never a facilitator outside it', async () => {
    const { stub, run } = setup(pair());
    const item = {
      id: 'i1',
      text: 'Plan',
      done: false,
      assigneeUid: null,
      dueAt: null,
      createdBy: 'mentor',
      createdAt: 5,
      doneAt: null,
    };
    await run(caller('mentor'), {
      action: 'addActionItem',
      plcId: 'p',
      workspaceId: 'mentor_mentee',
      item,
    });
    await run(caller('mentee'), {
      action: 'toggleActionItem',
      plcId: 'p',
      workspaceId: 'mentor_mentee',
      itemId: 'i1',
    });
    expect(stub.get('plcs/p/workspaces/mentor_mentee')!.actionItems).toEqual([
      { ...item, done: true, doneAt: NOW },
    ]);
    expect(
      await reasonOf(
        run(caller('co'), {
          action: 'toggleActionItem',
          plcId: 'p',
          workspaceId: 'mentor_mentee',
          itemId: 'i1',
        })
      )
    ).toBe('notAllowed');
  });

  it('refuses a pair partner who is now a viewer or no longer a member', async () => {
    const viewer = setup({
      'plcs/p': plc({
        groupType: 'mentoring',
        members: {
          ...(plc().members as StubData),
          mentee: m('mentee', 'viewer'),
        },
      }),
      'plcs/p/workspaces/mentor_mentee': ws(),
    });
    const toggle = {
      action: 'toggleActionItem',
      plcId: 'p',
      workspaceId: 'mentor_mentee',
      itemId: 'x',
    };
    expect(await reasonOf(viewer.run(caller('mentee'), toggle))).toBe(
      'notAllowed'
    );
    const left = setup({
      'plcs/p': plc({ groupType: 'mentoring', memberUids: ['lead', 'mentor'] }),
      'plcs/p/workspaces/mentor_mentee': ws(),
    });
    expect(await reasonOf(left.run(caller('mentee'), toggle))).toBe(
      'notAllowed'
    );
  });

  it('submits a task for whoever it names and records the status once', async () => {
    const { stub, run } = setup({
      ...pair({
        docs: [
          { id: 'task-t1', taskId: 't1', url: 'https://docs.google.com/x' },
        ],
      }),
      'plcs/p/tasks/t1': { submitter: 'mentee' },
      'plcs/p/tasks/t2': { submitter: 'both' },
    });
    const submit = (uid: string, taskId: string) =>
      run(caller(uid), {
        action: 'submitTask',
        plcId: 'p',
        workspaceId: 'mentor_mentee',
        taskId,
        name: uid,
      });
    expect(await reasonOf(submit('mentor', 't1'))).toBe('notAllowed');
    expect(await reasonOf(submit('mentee', 'missing'))).toBe('notAllowed');
    expect(await reasonOf(submit('co', 't2'))).toBe('notAllowed');
    await submit('mentee', 't1');
    expect(
      stub.get('plcs/p/workspaces/mentor_mentee/submissions/t1_mentee')
    ).toEqual({
      id: 't1_mentee',
      taskId: 't1',
      submittedBy: 'mentee',
      submittedByName: 'mentee',
      submittedAt: 'TS',
      docUrl: 'https://docs.google.com/x',
    });
    expect(stub.get('plcs/p/workspaces/mentor_mentee')!.taskStatus).toEqual({
      t1_mentee: { submittedAt: 'TS', submittedBy: 'mentee' },
    });
    const before = stub.writes.filter((w) =>
      w.path.endsWith('mentor_mentee')
    ).length;
    await submit('mentee', 't1');
    expect(
      stub.writes.filter((w) => w.path.endsWith('mentor_mentee')).length
    ).toBe(before);
    await submit('mentor', 't2');
    expect(
      stub.has('plcs/p/workspaces/mentor_mentee/submissions/t2_mentor')
    ).toBe(true);
  });

  it('lets the pair write check-ins and keeps their author fields', async () => {
    const { stub, run } = setup(pair());
    const { checkInId } = await run(caller('mentor'), {
      action: 'createCheckIn',
      plcId: 'p',
      workspaceId: 'mentor_mentee',
      title: 'Week 1',
      body: 'Notes',
      name: 'Mentor',
    });
    const path = `plcs/p/workspaces/mentor_mentee/checkins/${checkInId}`;
    expect(stub.get(path)).toEqual({
      id: checkInId,
      title: 'Week 1',
      body: 'Notes',
      createdBy: 'mentor',
      createdByName: 'Mentor',
      createdAt: 'TS',
      updatedAt: 'TS',
    });
    await run(caller('mentee'), {
      action: 'updateCheckIn',
      plcId: 'p',
      workspaceId: 'mentor_mentee',
      checkInId,
      body: 'More',
    });
    expect(stub.get(path)).toMatchObject({ body: 'More', createdBy: 'mentor' });
    for (const uid of ['co', 'mem']) {
      expect(
        await reasonOf(
          run(caller(uid), {
            action: 'createCheckIn',
            plcId: 'p',
            workspaceId: 'mentor_mentee',
            title: 'T',
            body: 'B',
            name: uid,
          })
        )
      ).toBe('notAllowed');
    }
    expect(() =>
      parseSettingsAction({
        action: 'createCheckIn',
        plcId: 'p',
        workspaceId: 'w',
        title: 'x'.repeat(201),
        body: '',
        name: '',
      })
    ).toThrow(SettingsError);
  });
});

describe('caller gates', () => {
  it('refuses deactivated operator-org members and PIN tokens on every action', async () => {
    const { run } = setup(staff('lead', { status: 'suspended' }));
    expect(
      await reasonOf(
        run(caller('lead'), { action: 'rename', plcId: 'p', name: 'X' })
      )
    ).toBe('notAllowed');
    const pin = setup();
    expect(
      await reasonOf(
        pin.run(caller('mem', { pinLogin: true }), {
          action: 'setFeatures',
          plcId: 'p',
          features: {},
        })
      )
    ).toBe('notAllowed');
  });
});

describe('review follow-ups', () => {
  it('lets a lead missing from memberUids write settings, as the lead rule branch did', async () => {
    const { stub, run } = setup({
      'plcs/p': plc({ memberUids: ['co', 'mem'] }),
    });
    await run(caller('lead'), {
      action: 'setFeatures',
      plcId: 'p',
      features: { notes: true },
    });
    await run(caller('lead'), {
      action: 'setMeetingNoteTemplate',
      plcId: 'p',
      markdown: 'x',
    });
    expect(stub.get('plcs/p')).toMatchObject({
      features: { notes: true },
      meetingNoteTemplate: 'x',
    });
  });

  it('treats clearing the sheet on a deleted PLC as a no-op', async () => {
    const { run } = setup();
    expect(
      await reasonOf(
        run(caller('mem'), { action: 'clearSharedSheetUrl', plcId: 'gone' })
      )
    ).toBe('allowed');
  });

  it('drops a 201st action item instead of failing', async () => {
    const items = Array.from({ length: 200 }, (_, i) => ({ id: `i${i}` }));
    const { stub, run } = setup({
      'plcs/p': plc({ groupType: 'mentoring' }),
      'plcs/p/workspaces/mentor_mentee': {
        mentorUid: 'mentor',
        menteeUid: 'mentee',
        memberUids: ['mentor', 'mentee'],
        actionItems: items,
      },
    });
    await run(caller('mentor'), {
      action: 'addActionItem',
      plcId: 'p',
      workspaceId: 'mentor_mentee',
      item: {
        id: 'new',
        text: 'x',
        done: false,
        createdBy: 'mentor',
        createdAt: 1,
      },
    });
    expect(
      (stub.get('plcs/p/workspaces/mentor_mentee')!.actionItems as unknown[])
        .length
    ).toBe(200);
  });

  it('refuses inherited member keys, newline URLs and outsiders probing workspaces', async () => {
    const { run } = setup();
    expect(
      await reasonOf(
        run(caller('co'), {
          action: 'setMentorRole',
          plcId: 'p',
          uid: '__proto__',
          mentorRole: 'mentor',
        })
      )
    ).toBe('notAllowed');
    expect(() =>
      parseSettingsAction({
        action: 'setCalendar',
        plcId: 'p',
        url: 'https://calendar.google.com/calendar/embed?src=a\nb',
      })
    ).toThrow(SettingsError);
    expect(
      await reasonOf(
        run(caller('outsider'), {
          action: 'toggleActionItem',
          plcId: 'p',
          workspaceId: 'nope',
          itemId: 'x',
        })
      )
    ).toBe('notAllowed');
  });
});
