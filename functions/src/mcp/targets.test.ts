import { describe, expect, it } from 'vitest';
import type { ToolContext } from './activity';
import { mergeSteps, publicStep } from './glTools';
import { toFriendlyQuestion, type StoredQuestion } from './quizStore';
import type { TargetTag } from './standards';
import { prepareTargets } from './targets';

type Data = Record<string, unknown>;

function fakeDb(seed: Record<string, Data>) {
  const docs = new Map(Object.entries(seed));
  const reads: string[] = [];
  const snap = (path: string) => ({
    id: path.split('/').pop(),
    exists: docs.has(path),
    data: () => docs.get(path),
    get: (k: string) => docs.get(path)?.[k],
  });
  const doc = (path: string) => ({
    path,
    get: () => {
      reads.push(path);
      return Promise.resolve(snap(path));
    },
  });
  const db = {
    doc,
    getAll: (...refs: { path: string }[]) =>
      Promise.resolve(refs.map((r) => snap(r.path))),
    collection: (path: string) => {
      const q = {
        where: (_f: string, _op: string, uid: string) => ({
          limit: () => ({
            get: () => {
              reads.push(path);
              const rows = [...docs.entries()]
                .filter(
                  ([k, v]) =>
                    k.split('/').length === 2 &&
                    k.startsWith(`${path}/`) &&
                    (v.memberUids as string[] | undefined)?.includes(uid)
                )
                .map(([k]) => snap(k));
              return Promise.resolve({ empty: rows.length === 0, docs: rows });
            },
          }),
          get: () => Promise.resolve({ docs: [] }),
        }),
      };
      return q;
    },
    runTransaction: async <T>(fn: (tx: Data) => Promise<T>) =>
      fn({
        get: (ref: { path: string }) => Promise.resolve(snap(ref.path)),
        set: (ref: { path: string }, data: Data) =>
          docs.set(ref.path, { ...(docs.get(ref.path) ?? {}), ...data }),
      }),
  };
  return { db, docs, reads };
}

const ctxFor = (db: unknown) =>
  ({ db, uid: 'u1', email: 'u1@example.org', grantId: 'g' }) as ToolContext;

const MINE = 'users/u1/userProfile/learningTargets';
const seed = () => ({
  [MINE]: {
    targets: [
      { id: 'p1', label: 'I can cite evidence', code: 'LT1' },
      { id: 'p2', label: 'Old target', archived: true },
    ],
    updatedAt: 1,
  },
  'plcs/g1': { memberUids: ['u1'] },
  'plcs/g1/meta/learningTargets': {
    targets: [
      { id: 'g-t', label: 'I can find the main idea', standardIds: ['s'] },
    ],
    updatedAt: 1,
  },
});

const standard: TargetTag = {
  id: 'mn:1',
  kind: 'standard',
  code: '6.1.2.1',
  label: 'Std',
};

describe('learning_targets', () => {
  it('matches My targets and PLC targets by wording or code, keeping standards', async () => {
    const { db } = fakeDb(seed());
    const apply = await prepareTargets(ctxFor(db), [
      {
        learning_targets: ['i can CITE  evidence', 'I can find the main idea'],
      },
    ]);
    expect(
      apply(1, [standard], {
        learning_targets: ['LT1', 'I can find the main idea'],
      })
    ).toEqual([
      standard,
      { id: 'p1', kind: 'personal', label: 'I can cite evidence', code: 'LT1' },
      {
        id: 'g-t',
        kind: 'plc',
        ownerId: 'g1',
        label: 'I can find the main idea',
        standardIds: ['s'],
      },
    ]);
  });

  it('adds unmatched wording to My targets once', async () => {
    const { db, docs } = fakeDb(seed());
    const inputs = [
      { learning_targets: ['I can compare two texts'] },
      { learning_targets: ['i can compare two texts'] },
    ];
    const apply = await prepareTargets(ctxFor(db), inputs);
    const a = apply(1, undefined, inputs[0]);
    const b = apply(2, undefined, inputs[1]);
    expect(a?.[0]).toMatchObject({
      kind: 'personal',
      label: 'I can compare two texts',
    });
    expect(b?.[0].id).toBe(a?.[0].id);
    const saved = docs.get(MINE)?.targets as { id: string; label: string }[];
    expect(saved).toHaveLength(3);
    expect(saved[2]).toMatchObject({
      id: a?.[0].id,
      label: 'I can compare two texts',
    });
  });

  it('does not match an archived target', async () => {
    const { db, docs } = fakeDb(seed());
    const apply = await prepareTargets(ctxFor(db), [
      { learning_targets: ['Old target'] },
    ]);
    const out = apply(1, undefined, { learning_targets: ['Old target'] });
    expect(out?.[0].id).not.toBe('p2');
    expect((docs.get(MINE)?.targets as unknown[]).length).toBe(3);
  });

  it('keeps a renamed tag already on the item instead of adding a new target', async () => {
    const { db, docs } = fakeDb(seed());
    const renamed: TargetTag = {
      id: 'gone',
      kind: 'personal',
      label: 'Snapshot label',
    };
    const apply = await prepareTargets(
      ctxFor(db),
      [{ learning_targets: ['Snapshot label'] }],
      [renamed]
    );
    expect(
      apply(1, undefined, { learning_targets: ['Snapshot label'] })
    ).toEqual([renamed]);
    expect((docs.get(MINE)?.targets as unknown[]).length).toBe(2);
  });

  it('omitted keeps targets, [] clears only the personal and PLC ones', async () => {
    const { db, reads } = fakeDb(seed());
    const mine: TargetTag = {
      id: 'p1',
      kind: 'personal',
      label: 'I can cite evidence',
    };
    const apply = await prepareTargets(ctxFor(db), [{}]);
    expect(reads).toEqual([]);
    expect(apply(1, [standard, mine], {})).toEqual([standard, mine]);
    expect(apply(1, [standard, mine], { learning_targets: [] })).toEqual([
      standard,
    ]);
    expect(apply(1, [mine], { learning_targets: [] })).toBeUndefined();
  });

  it('get_* shows standards and learning targets separately', () => {
    const q = {
      id: 'q',
      type: 'MC',
      text: 'Q',
      correctAnswer: 'a',
      incorrectAnswers: ['b'],
      timeLimit: 0,
      targets: [
        standard,
        { id: 'p1', kind: 'personal', label: 'I can cite evidence' },
      ],
    } as StoredQuestion;
    const out = toFriendlyQuestion(q);
    expect(out.standards).toEqual(['6.1.2.1']);
    expect(out.learning_targets).toEqual(['I can cite evidence']);
  });
});

describe('Guided Learning question steps', () => {
  const step = {
    id: 's1',
    xPct: 50,
    yPct: 50,
    imageIndex: 0,
    interactionType: 'tooltip' as const,
    text: 'Look here.',
  };

  it('rejects targets on a step that is not a question', () => {
    expect(() =>
      mergeSteps([], [{ ...step, standards: ['6.1.2.1'] }], 1)
    ).toThrow(/question steps only/);
  });

  it('never stores the raw input fields, and shows tags as fields', () => {
    const [merged] = mergeSteps(
      [],
      [
        {
          ...step,
          interactionType: 'question',
          question: {
            type: 'multiple-choice',
            text: 'Q?',
            choices: ['a', 'b'],
            correctAnswer: 'a',
          },
          learning_targets: ['x'],
        },
      ],
      1
    );
    expect(merged).not.toHaveProperty('learning_targets');
    const shown = publicStep({ ...merged, targets: [standard] });
    expect(shown).not.toHaveProperty('targets');
    expect(shown.standards).toEqual(['6.1.2.1']);
  });
});
