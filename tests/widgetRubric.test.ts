import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import Ajv from 'ajv';
import {
  letterFor,
  meetsLoopTarget,
  rollup,
} from '@/scripts/widget-grader/rollup';
import type {
  CriterionId,
  CriterionScore,
  GateId,
  Level,
  Rubric,
  Scorecard,
} from '@/scripts/widget-grader/types';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rubricDir = join(repoRoot, 'docs/widget-rubric');
const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(path, 'utf8')) as T;

const rubric = readJson<Rubric>(join(rubricDir, 'rubric.json'));
const schema = readJson<object>(join(rubricDir, 'scorecard.schema.json'));
const exclusions = readJson<Record<string, string>>(
  join(rubricDir, 'exclusions.json')
);

const widgetTypeBlock =
  /export type WidgetType =([\s\S]*?);/.exec(
    readFileSync(join(repoRoot, 'types.ts'), 'utf8')
  )?.[1] ?? '';
const widgetTypes = [...widgetTypeBlock.matchAll(/'([^']+)'/g)].map(
  (m) => m[1]
);

const planPath = [
  'docs/plans/WIDGET_RUBRIC.md',
  'docs/plans/shipped/WIDGET_RUBRIC.md',
]
  .map((p) => join(repoRoot, p))
  .find(existsSync);

const PLAN_IDS = [
  ...['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'],
  ...['I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7'],
  ...['V1', 'V2', 'V3', 'V4', 'V5', 'V6'],
  ...['C1', 'C2', 'C3', 'C4', 'C5', 'C6'],
  ...['R1', 'R2', 'R3', 'R4', 'R5'],
  ...['E1', 'E2', 'E3'],
];

const OMITTED_LEVELS: Partial<Record<string, string[]>> = {
  C4: ['0', '3', '4'],
  I5: ['1', '3', '4'],
  C6: ['1', '3', '4'],
  R2: ['0', '1', '3', '4'],
  R4: ['0', '2', '3', '4'],
  S1: ['0', '1', '2', '3', '4'],
};

const allCriteria = rubric.dimensions.flatMap((d) => d.criteria);

describe('rubric.json', () => {
  it('is version 1.1.0 with the six weighted dimensions', () => {
    expect(rubric.version).toBe('1.1.0');
    expect(rubric.dimensions.map((d) => [d.id, d.weight])).toEqual([
      ['layout', 25],
      ['interaction', 15],
      ['visual', 20],
      ['config', 15],
      ['robustness', 15],
      ['ecosystem', 10],
    ]);
    expect(rubric.dimensions.reduce((sum, d) => sum + d.weight, 0)).toBe(100);
  });

  it('lists exactly the plan criteria with unique ids', () => {
    const ids = allCriteria.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...PLAN_IDS].sort());
  });

  it('matches the criterion names and dimension weights in the plan doc', () => {
    if (!planPath) throw new Error('plan doc not found');
    const plan = readFileSync(planPath, 'utf8');
    const planned = [
      ...plan.matchAll(/^\*\*([SIVCRE][0-9]) ([^*]+?)\.\*\*/gm),
    ].map((m) => [m[1], m[2]]);
    expect(planned).toEqual(allCriteria.map((c) => [c.id, c.name]));
    const weights = [...plan.matchAll(/^### (.+) \((\d+)\)$/gm)].map((m) => [
      m[1],
      Number(m[2]),
    ]);
    expect(weights).toEqual(rubric.dimensions.map((d) => [d.name, d.weight]));
  });

  it('gives every criterion an applicability rule, a method and descriptors', () => {
    const kinds = [
      'all',
      'scrollableContent',
      'hasControls',
      'hasSettings',
      'animates',
      'holdsTeacherContent',
      'showsRosterData',
    ];
    for (const c of allCriteria) {
      expect(kinds, c.id).toContain(c.applicability.applies);
      expect(c.applicability.rule, c.id).not.toBe('');
      expect(['script', 'judge', 'both'], c.id).toContain(c.method);
      const levels = Object.keys(c.descriptors).sort();
      const expected = OMITTED_LEVELS[c.id] ?? ['1', '2', '3', '4'];
      expect(levels, c.id).toEqual(
        c.id === 'S1' ? ['0', '1', '2', '3', '4'] : expected.sort()
      );
      for (const text of Object.values(c.descriptors)) {
        expect(text, c.id).toMatch(/\S/);
      }
    }
  });

  it('defines the four gates and the R6 letter map', () => {
    expect(rubric.gates.map((g) => g.id)).toEqual(['G1', 'G2', 'G3', 'G4']);
    expect(rubric.letterGrades).toEqual([
      { letter: 'A', min: 3.5 },
      { letter: 'B', min: 3 },
      { letter: 'C', min: 2 },
      { letter: 'D', min: 1 },
      { letter: 'F', min: 0 },
    ]);
    expect(rubric.gateCap).toBe('D');
  });

  it('carries the R16 thresholds', () => {
    expect(rubric.thresholds).toMatchObject({
      touchHitAreaDefaultPx: 44,
      touchHitAreaMinimumPx: 32,
      primaryContentMinPx: 24,
      readableTextMinPx: 14,
      textContrast: 4.5,
      largeTextContrast: 3,
      windowTransparency: 0.8,
    });
    const byId = Object.fromEntries(allCriteria.map((c) => [c.id, c]));
    expect(byId.S5.thresholds).toMatchObject({
      primaryContentMinPx: 24,
      readableTextMinPx: 14,
      acrossRoomPx: 36,
    });
    expect(byId.I2.thresholds).toMatchObject({
      hitAreaDefaultPx: 44,
      hitAreaMinimumPx: 32,
      targetSpacingPx: 8,
    });
    expect(byId.R3.budgets).toHaveLength(5);
    expect(byId.R4.protectedData).toHaveLength(5);
    expect(byId.V1.banList).toHaveLength(9);
  });
});

describe('scorecards', () => {
  const validate = new Ajv({ allErrors: true }).compile(schema);
  const cardDir = join(rubricDir, 'scorecards');
  const files = readdirSync(cardDir).filter((f) => f.endsWith('.json'));

  it('has one card per board widget type', () => {
    expect(widgetTypes.length).toBeGreaterThan(60);
    for (const type of Object.keys(exclusions)) {
      expect(widgetTypes, `exclusion ${type}`).toContain(type);
      expect(exclusions[type], type).toMatch(/\S/);
    }
    const expected = widgetTypes.filter((t) => !(t in exclusions));
    expect(files.map((f) => f.replace(/\.json$/, '')).sort()).toEqual(
      [...expected].sort()
    );
  });

  it.each(files)('%s validates against the schema', (file) => {
    const card = readJson<Scorecard>(join(cardDir, file));
    expect(validate(card), JSON.stringify(validate.errors)).toBe(true);
    expect(card.widgetType).toBe(file.replace(/\.json$/, ''));
    // A minor rubric bump re-grades only the changed criteria (R26).
    expect(card.rubricVersion.split('.')[0]).toBe(rubric.version.split('.')[0]);
  });

  it('rejects malformed cards', () => {
    const base = readJson<Scorecard>(join(cardDir, 'clock.json'));
    const stamp = '2026-10-05T12:00:00Z';
    const score = (over: Partial<CriterionScore>) => ({
      ...base,
      criteria: {
        S1: {
          score: 3,
          source: 'paul',
          rubricVersion: '1.0.0',
          gradedAt: stamp,
          stale: false,
          ...over,
        },
      },
    });
    expect(validate(score({}))).toBe(true);
    expect(validate(score({ score: null }))).toBe(true);
    expect(validate(score({ score: 5 as Level }))).toBe(false);
    expect(validate(score({ source: 'robot' as 'paul' }))).toBe(false);
    expect(validate(score({ gradedAt: 'yesterday' }))).toBe(false);
    expect(
      validate({ ...base, gates: { G9: { pass: true, gradedAt: stamp } } })
    ).toBe(false);
    expect(validate({ ...base, stale: 'no' })).toBe(false);
  });
});

describe('rollup', () => {
  const stamp = '2026-10-05T12:00:00Z';
  const card = (
    scores: Partial<Record<CriterionId, number | null>>,
    gates: Partial<Record<GateId, boolean>> = {}
  ): Scorecard => ({
    widgetType: 'clock',
    rubricVersion: rubric.version,
    gradedAt: stamp,
    stale: false,
    criteria: Object.fromEntries(
      Object.entries(scores).map(([id, score]) => [
        id,
        {
          score,
          source: 'paul',
          rubricVersion: rubric.version,
          gradedAt: stamp,
          stale: false,
        },
      ])
    ),
    gates: Object.fromEntries(
      Object.entries(gates).map(([id, pass]) => [id, { pass, gradedAt: stamp }])
    ),
  });
  const uniform = (level: number): Scorecard =>
    card(Object.fromEntries(allCriteria.map((c) => [c.id, level])));

  it('maps letter boundaries per R6', () => {
    const cases: [number, string][] = [
      [4, 'A'],
      [3.5, 'A'],
      [3.49, 'B'],
      [3, 'B'],
      [2.99, 'C'],
      [2, 'C'],
      [1.99, 'D'],
      [1, 'D'],
      [0.99, 'F'],
      [0, 'F'],
    ];
    for (const [score, letter] of cases) {
      expect(letterFor(rubric, score), String(score)).toBe(letter);
    }
  });

  it('takes the mean within a dimension and the weighted mean across them', () => {
    const result = rollup(
      rubric,
      card({ S1: 4, S2: 2, I1: 2, V1: 0, C3: 4, R3: 4, E2: 4 })
    );
    const byId = Object.fromEntries(
      result.dimensions.map((d) => [d.id, d.score])
    );
    expect(byId).toEqual({
      layout: 3,
      interaction: 2,
      visual: 0,
      config: 4,
      robustness: 4,
      ecosystem: 4,
    });
    // (3*25 + 0*20 + 2*15 + 4*15 + 4*15 + 4*10) / 100
    expect(result.weighted).toBeCloseTo(2.65, 10);
    expect(result.letter).toBe('C');
    expect(result.gateCapped).toBe(false);
  });

  it('skips N/A and ungraded criteria, and renormalizes weights', () => {
    const result = rollup(rubric, card({ S1: null, S2: 4, V1: 2 }));
    expect(result.dimensions.find((d) => d.id === 'layout')).toMatchObject({
      score: 4,
      scored: 1,
    });
    expect(
      result.dimensions.find((d) => d.id === 'ecosystem')?.score
    ).toBeNull();
    // (4*25 + 2*20) / 45
    expect(result.weighted).toBeCloseTo(140 / 45, 10);
  });

  it('returns no grade for an empty card', () => {
    const result = rollup(rubric, card({}));
    expect(result.weighted).toBeNull();
    expect(result.letter).toBeNull();
    expect(result.gateCapped).toBe(false);
  });

  it('caps at D on any gate failure but never raises a lower grade', () => {
    const capped = rollup(rubric, {
      ...uniform(4),
      gates: card({}, { G1: false, G2: true }).gates,
    });
    expect(capped.uncappedLetter).toBe('A');
    expect(capped.letter).toBe('D');
    expect(capped.gateCapped).toBe(true);
    expect(capped.gateFailures).toEqual(['G1']);

    const alreadyD = rollup(rubric, {
      ...uniform(1),
      gates: card({}, { G3: false }).gates,
    });
    expect(alreadyD.letter).toBe('D');
    expect(alreadyD.gateCapped).toBe(false);

    const alreadyF = rollup(rubric, {
      ...uniform(0),
      gates: card({}, { G4: false }).gates,
    });
    expect(alreadyF.letter).toBe('F');

    const passing = rollup(rubric, {
      ...uniform(4),
      gates: card({}, { G1: true, G2: true, G3: true, G4: true }).gates,
    });
    expect(passing.letter).toBe('A');
    expect(passing.gateFailures).toEqual([]);
  });

  it('applies the R7 loop target', () => {
    expect(meetsLoopTarget(rubric, rollup(rubric, uniform(3)))).toBe(true);
    expect(
      meetsLoopTarget(rubric, rollup(rubric, card({ S1: 3, V1: 2 })))
    ).toBe(false);
    expect(
      meetsLoopTarget(
        rubric,
        rollup(rubric, { ...uniform(4), gates: card({}, { G2: false }).gates })
      )
    ).toBe(false);
    expect(meetsLoopTarget(rubric, rollup(rubric, card({})))).toBe(false);
  });
});
