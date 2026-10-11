// Unit tests for the PLC goal coach: prompt context, response parsing, gating and refunds.
import { describe, it, expect, vi } from 'vitest';

vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: vi.fn(),
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
vi.mock('./functionsInit', () => ({}));
vi.mock('./classlinkShared', () => ({ ALLOWED_ORIGINS: [] }));
vi.mock('./aiGeneration', () => ({
  enforceAiFeatureAccess: vi.fn(),
  getGeminiModelConfig: vi.fn(),
  refundAiUsage: vi.fn(),
  resolveCallerIsAdmin: vi.fn(),
  vertexClientOptions: vi.fn(),
}));

import * as admin from 'firebase-admin';
import { enforceAiFeatureAccess, resolveCallerIsAdmin } from './aiGeneration';
import {
  adminSkipsGoalCoachQuota,
  plcGoalCoachV1,
  EMPTY_GOAL_REASON,
  parseGoalCoachRequest,
  runGoalCoach,
  type GoalCoachDeps,
} from './plcGoalCoach';
import {
  buildGoalCoachPrompt,
  buildGoalCoachSchema,
  buildTeamContext,
  parseGoalCoachResponse,
} from './plcGoalCoachAi';
import {
  DEFAULT_GOAL_COACH_RUBRIC,
  resolveGoalCoachRubric,
} from './plcGoalCoachRubric';
import { makeStubFirestore, type StubData } from './testing/stubFirestore';

const PLC = 'plc-1';
const MEMBER = 'u-member';
const REMOVED = 'u-removed';
const OUTSIDER = 'u-out';
const CHARGE = { docIds: ['a', 'b', 'c'] };
const ADMIN_CHARGE = { docIds: ['admin'] };
const RUBRIC = [...DEFAULT_GOAL_COACH_RUBRIC];
const GOAL = {
  title: 'Students will improve at citing evidence.',
  measure: 'Unit 4 CFA',
  practices: ['Model annotation weekly'],
};

const plcDoc = (): StubData => ({
  memberUids: [MEMBER, REMOVED, 'u-2'],
  members: {
    [MEMBER]: { role: 'member', status: 'active', displayName: 'Pat Lee' },
    [REMOVED]: { role: 'member', status: 'removed', displayName: 'Gone' },
    'u-2': { role: 'lead', status: 'active', displayName: 'Sam Ray' },
  },
});

// Private fields seeded beside the team-level ones; none of them may reach the prompt.
const seed = (): Record<string, StubData> => ({
  [`plcs/${PLC}`]: plcDoc(),
  [`plcs/${PLC}/assessments/a1`]: {
    title: 'Unit 4 CFA',
    updatedAt: 2,
    deletedAt: null,
    createdBy: 'u-secret-creator',
  },
  [`plcs/${PLC}/assessments/a2`]: { title: 'Trashed quiz', deletedAt: 5 },
  [`plcs/${PLC}/assessments/a3`]: { title: 'Tiny pilot', updatedAt: 1 },
  [`plcs/${PLC}/aggregates/a1`]: {
    teamAveragePercent: 71.6,
    teacherCount: 2,
    studentCount: 48,
    scoredStudentCount: 44,
    computedFromSessionIds: ['session-secret-1'],
    scoreDistribution: [{ min: 0, max: 10, count: 1 }],
    perClass: [{ className: 'Period 3 Honors', average: 52 }],
    perTeacher: [{ teacherName: 'Ms Hidden', average: 60 }],
    students: [{ name: 'Jordan Pupil', score: 12 }],
  },
  [`plcs/${PLC}/aggregates/a3`]: {
    teamAveragePercent: 40,
    teacherCount: 1,
    scoredStudentCount: 3,
  },
  [`plcs/${PLC}/meta/learningTargets`]: {
    targets: [
      { id: 't1', code: 'RL.6.1', label: 'Cite textual evidence' },
      { id: 't2', label: 'Old target', archived: true },
    ],
  },
});

const goodResponse = (overrides: Record<string, boolean> = {}) =>
  JSON.stringify({
    criteria: RUBRIC.map((c) => ({
      id: c.id,
      met: overrides[c.id] ?? true,
      reason: `Reason for ${c.id}. Extra sentence.`,
    })),
    suggestions: RUBRIC.map((c) => ({
      criterionId: c.id,
      suggestedEdit: `Edit for ${c.id}`,
    })),
  });

function setup(
  opts: { admin?: boolean; extra?: Record<string, StubData> } = {}
) {
  const fs = makeStubFirestore({ ...seed(), ...opts.extra });
  const deps: GoalCoachDeps = {
    db: fs.db as never,
    isAdmin: vi.fn(() => Promise.resolve(opts.admin === true)),
    charge: vi.fn(() => Promise.resolve(CHARGE)),
    refund: vi.fn(() => Promise.resolve()),
    record: vi.fn(() => Promise.resolve(ADMIN_CHARGE)),
    generate: vi.fn(() =>
      Promise.resolve(goodResponse({ 'baseline-target': false }))
    ),
  };
  return { fs, deps };
}

describe('parseGoalCoachRequest', () => {
  it('refuses an empty or whitespace goal with the empty-goal reason', () => {
    for (const title of ['', '   \n\t ', undefined]) {
      let caught: { code?: string; details?: unknown } | null = null;
      try {
        parseGoalCoachRequest({ plcId: PLC, goal: { title, measure: 'CFA' } });
      } catch (e) {
        caught = e as { code?: string; details?: unknown };
      }
      expect(caught?.code).toBe('invalid-argument');
      expect(caught?.details).toEqual({ reason: EMPTY_GOAL_REASON });
    }
  });

  it('rejects path-like ids and trims the draft', () => {
    expect(() =>
      parseGoalCoachRequest({ plcId: 'a/b', goal: { title: 'x' } })
    ).toThrow('Malformed identifier.');
    expect(
      parseGoalCoachRequest({
        plcId: PLC,
        goal: {
          title: '  Raise   scores ',
          practices: ['', ' Exit tickets ', 4],
        },
      })
    ).toEqual({
      plcId: PLC,
      goal: { title: 'Raise scores', measure: '', practices: ['Exit tickets'] },
    });
  });
});

describe('prompt building', () => {
  it('sends team-level names and totals but never student, class or teacher data', async () => {
    const { deps } = setup();
    await runGoalCoach({ plcId: PLC, goal: GOAL }, MEMBER, {}, deps);
    const prompt = vi.mocked(deps.generate).mock.calls[0][0];
    expect(prompt).toContain('Unit 4 CFA: team average 72%');
    expect(prompt).toContain(
      'results from 2 of 2 teachers, 44 students scored'
    );
    expect(prompt).toContain('RL.6.1: Cite textual evidence');
    expect(prompt).toContain(GOAL.title);
    for (const secret of [
      'Jordan Pupil',
      'Period 3 Honors',
      'Ms Hidden',
      'session-secret-1',
      'u-secret-creator',
      'Pat Lee',
      'Sam Ray',
      MEMBER,
      'Trashed quiz',
      'Old target',
    ]) {
      expect(prompt).not.toContain(secret);
    }
  });

  it('withholds a team average built from fewer than five scored students', () => {
    const ctx = buildTeamContext({
      plc: plcDoc(),
      assessments: [{ id: 'a3', data: { title: 'Tiny pilot' } }],
      aggregates: new Map([
        [
          'a3',
          { teamAveragePercent: 40, teacherCount: 1, scoredStudentCount: 3 },
        ],
      ]),
      learningTargets: undefined,
    });
    expect(ctx.assessments[0].teamAveragePercent).toBeNull();
    const prompt = buildGoalCoachPrompt(GOAL, RUBRIC, ctx);
    expect(prompt).toContain('Tiny pilot: team average not available yet');
    expect(prompt).not.toContain('40%');
  });

  it('lists every rubric criterion and constrains ids in the schema', () => {
    const prompt = buildGoalCoachPrompt(
      { title: 'Goal', measure: '', practices: [] },
      RUBRIC,
      { memberCount: 1, assessments: [], learningTargets: [] }
    );
    for (const c of RUBRIC) expect(prompt).toContain(c.id);
    const schema = buildGoalCoachSchema(RUBRIC) as unknown as {
      properties: {
        criteria: { items: { properties: { id: { enum: string[] } } } };
      };
    };
    expect(schema.properties.criteria.items.properties.id.enum).toEqual(
      RUBRIC.map((c) => c.id)
    );
  });
});

describe('parseGoalCoachResponse', () => {
  it('returns one result per criterion and suggestions only for unmet ones', () => {
    const out = parseGoalCoachResponse(
      goodResponse({ 'time-frame': false, 'named-measure': false }),
      RUBRIC
    );
    expect(out.criteria.map((c) => c.id)).toEqual(RUBRIC.map((c) => c.id));
    expect(out.criteria[0].reason).toBe('Reason for student-focused.');
    expect(out.suggestions.map((s) => s.criterionId).sort()).toEqual([
      'named-measure',
      'time-frame',
    ]);
  });

  it('drops unknown ids and duplicate suggestions', () => {
    const out = parseGoalCoachResponse(
      JSON.stringify({
        criteria: [
          ...RUBRIC.map((c) => ({
            id: c.id,
            met: c.id !== 'time-frame',
            reason: 'r.',
          })),
          { id: 'made-up', met: false, reason: 'x' },
        ],
        suggestions: [
          { criterionId: 'time-frame', suggestedEdit: 'By May' },
          { criterionId: 'time-frame', suggestedEdit: 'Second' },
          { criterionId: 'made-up', suggestedEdit: 'nope' },
          { criterionId: 'time-frame', suggestedEdit: '   ' },
        ],
      }),
      RUBRIC
    );
    expect(out.criteria).toHaveLength(RUBRIC.length);
    expect(out.suggestions).toEqual([
      { criterionId: 'time-frame', suggestedEdit: 'By May' },
    ]);
  });

  it('throws when a criterion is missing or met is not a boolean', () => {
    expect(() =>
      parseGoalCoachResponse(
        JSON.stringify({ criteria: [], suggestions: [] }),
        RUBRIC
      )
    ).toThrow('missed criterion');
    const bad = JSON.parse(goodResponse()) as {
      criteria: Array<{ met: unknown }>;
    };
    bad.criteria[1].met = 'yes';
    expect(() => parseGoalCoachResponse(JSON.stringify(bad), RUBRIC)).toThrow(
      'named-measure'
    );
  });
});

describe('resolveGoalCoachRubric', () => {
  it('falls back to the default for a missing or unusable override', () => {
    expect(resolveGoalCoachRubric(undefined)).toEqual(RUBRIC);
    expect(
      resolveGoalCoachRubric([{ id: 'Bad Id', label: 'x', description: 'y' }])
    ).toEqual(RUBRIC);
  });

  it('uses a valid override and drops duplicates', () => {
    const custom = [
      { id: 'evidence', label: 'Evidence', description: 'Names evidence.' },
      { id: 'evidence', label: 'Again', description: 'Dup.' },
    ];
    expect(resolveGoalCoachRubric(custom)).toEqual([custom[0]]);
  });

  it('runs the call with the admin override from team_type_defaults', async () => {
    const { deps } = setup({
      extra: {
        'admin_settings/team_type_defaults': {
          goalCoachRubric: [
            {
              id: 'evidence',
              label: 'Evidence',
              description: 'Names evidence.',
            },
          ],
        },
      },
    });
    vi.mocked(deps.generate).mockResolvedValue(
      JSON.stringify({
        criteria: [{ id: 'evidence', met: true, reason: 'It does.' }],
        suggestions: [],
      })
    );
    const out = await runGoalCoach(
      { plcId: PLC, goal: GOAL },
      MEMBER,
      {},
      deps
    );
    expect(out.criteria).toEqual([
      { id: 'evidence', label: 'Evidence', met: true, reason: 'It does.' },
    ]);
  });
});

describe('runGoalCoach gating', () => {
  it('denies a non-member and a removed member before charging', async () => {
    for (const uid of [OUTSIDER, REMOVED]) {
      const { deps } = setup();
      await expect(
        runGoalCoach({ plcId: PLC, goal: GOAL }, uid, {}, deps)
      ).rejects.toMatchObject({ code: 'permission-denied' });
      expect(deps.charge).not.toHaveBeenCalled();
      expect(deps.generate).not.toHaveBeenCalled();
    }
  });

  it('denies a missing team', async () => {
    const { deps } = setup();
    await expect(
      runGoalCoach({ plcId: 'nope', goal: GOAL }, MEMBER, {}, deps)
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('stops a teacher when the flag gate refuses and never calls the model', async () => {
    const { deps } = setup();
    vi.mocked(deps.charge).mockRejectedValue(
      Object.assign(new Error('plc-goal-coach is currently disabled.'), {
        code: 'permission-denied',
      })
    );
    await expect(
      runGoalCoach({ plcId: PLC, goal: GOAL }, MEMBER, {}, deps)
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(deps.generate).not.toHaveBeenCalled();
  });

  it('charges a teacher and returns the parsed result', async () => {
    const { deps } = setup();
    const out = await runGoalCoach(
      { plcId: PLC, goal: GOAL },
      MEMBER,
      {},
      deps
    );
    expect(deps.charge).toHaveBeenCalledTimes(1);
    expect(out.suggestions).toEqual([
      {
        criterionId: 'baseline-target',
        suggestedEdit: 'Edit for baseline-target',
      },
    ]);
  });

  it('counts an admin check without charging the quota', async () => {
    const { deps } = setup({ admin: true });
    await runGoalCoach({ plcId: PLC, goal: GOAL }, MEMBER, {}, deps);
    expect(deps.charge).not.toHaveBeenCalled();
    expect(deps.record).toHaveBeenCalledWith({}, MEMBER);
  });

  it('refunds the charge when the model fails', async () => {
    const { deps } = setup();
    vi.mocked(deps.generate).mockRejectedValue(new Error('boom'));
    await expect(
      runGoalCoach({ plcId: PLC, goal: GOAL }, MEMBER, {}, deps)
    ).rejects.toMatchObject({ code: 'internal' });
    expect(deps.refund).toHaveBeenCalledWith(CHARGE);
  });
});

describe('adminSkipsGoalCoachQuota', () => {
  const isAdmin = (v: boolean) => vi.fn(() => Promise.resolve(v));

  it('lets an admin through while no flag doc is switched off', async () => {
    const fs = makeStubFirestore({});
    expect(
      await adminSkipsGoalCoachQuota(fs.db as never, {}, isAdmin(true))
    ).toBe(true);
  });

  it('sends an admin to the gate when the flag is switched off', async () => {
    const fs = makeStubFirestore({
      'global_permissions/plc-goal-coach': { enabled: false },
    });
    expect(
      await adminSkipsGoalCoachQuota(fs.db as never, {}, isAdmin(true))
    ).toBe(false);
  });

  it('sends an admin to the gate when gemini-functions is switched off', async () => {
    const fs = makeStubFirestore({
      'global_permissions/gemini-functions': { enabled: false },
    });
    expect(
      await adminSkipsGoalCoachQuota(fs.db as never, {}, isAdmin(true))
    ).toBe(false);
  });

  it('never skips for a non-admin', async () => {
    const fs = makeStubFirestore({});
    expect(
      await adminSkipsGoalCoachQuota(fs.db as never, {}, isAdmin(false))
    ).toBe(false);
  });
});

describe('plcGoalCoachV1 handler', () => {
  const handler = plcGoalCoachV1 as unknown as (req: {
    auth?: { uid: string; token: Record<string, unknown> } | null;
    data: unknown;
  }) => Promise<unknown>;

  it('requires sign-in', async () => {
    await expect(
      handler({ auth: null, data: { plcId: PLC, goal: GOAL } })
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('gates a teacher on the plc-goal-coach flag with no missing-doc pass', async () => {
    const fs = makeStubFirestore(seed());
    vi.mocked(admin.firestore).mockReturnValue(fs.db as never);
    vi.mocked(resolveCallerIsAdmin).mockResolvedValue(false);
    vi.mocked(enforceAiFeatureAccess).mockRejectedValue(
      Object.assign(new Error('Admin access required to use AI generation.'), {
        code: 'permission-denied',
      })
    );
    await expect(
      handler({
        auth: { uid: MEMBER, token: {} },
        data: { plcId: PLC, goal: GOAL },
      })
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(enforceAiFeatureAccess).toHaveBeenCalledWith(
      fs.db,
      {},
      MEMBER,
      'plc-goal-coach',
      false,
      expect.objectContaining({ key: 'plc-goal-coach-checks' })
    );
  });
});
