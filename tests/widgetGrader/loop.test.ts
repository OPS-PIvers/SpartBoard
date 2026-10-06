import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  buildQueue,
  distanceFromTarget,
  needsRegrade,
  pickTarget,
  preflight,
  type PlatformFile,
  type UsageFile,
} from '@/scripts/widget-grader/queue';
import {
  compareFill,
  compareScorecards,
  findDrift,
  findGaming,
  newWidgetGate,
  recordSpotCheck,
  reviewMode,
  sampleSpotCards,
  spotCardsFromExamples,
  type SpotCard,
  type SupervisedLoop,
} from '@/scripts/widget-grader/loop';
import type {
  CriterionId,
  CriterionScore,
  GateId,
  Level,
  Rubric,
  Scorecard,
} from '@/scripts/widget-grader/types';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const rubric = JSON.parse(
  readFileSync(join(root, 'docs/widget-rubric/rubric.json'), 'utf8')
) as Rubric;
const platform = JSON.parse(
  readFileSync(join(root, 'docs/widget-rubric/platform.json'), 'utf8')
) as PlatformFile;

const AT = '2026-10-05T00:00:00.000Z';

const criteriaOf = (dim: string): CriterionId[] =>
  rubric.dimensions.find((d) => d.id === dim)?.criteria.map((c) => c.id) ?? [];

/** Every criterion at `base`, with overrides. */
function card(
  widgetType: string,
  base: Level,
  overrides: Partial<Record<CriterionId, Level>> = {},
  gates: Partial<Record<GateId, boolean>> = {}
): Scorecard {
  const criteria: Scorecard['criteria'] = {};
  for (const d of rubric.dimensions)
    for (const c of d.criteria)
      criteria[c.id] = {
        score: overrides[c.id] ?? base,
        source: 'judge',
        rubricVersion: rubric.version,
        gradedAt: AT,
        stale: false,
      };
  return {
    widgetType,
    rubricVersion: rubric.version,
    gradedAt: AT,
    stale: false,
    criteria,
    gates: Object.fromEntries(
      Object.entries(gates).map(([g, pass]) => [g, { pass, gradedAt: AT }])
    ),
  };
}

const empty = (widgetType: string): Scorecard => ({
  widgetType,
  rubricVersion: rubric.version,
  gradedAt: null,
  stale: false,
  criteria: {},
  gates: {},
});

const allAt = (dim: string, level: Level) =>
  Object.fromEntries(criteriaOf(dim).map((id) => [id, level])) as Partial<
    Record<CriterionId, Level>
  >;

describe('queue: distance and picking', () => {
  it('weights each dimension shortfall below 3.0', () => {
    expect(distanceFromTarget(rubric, card('a', 3))).toBe(0);
    // layout (25) one level short
    expect(distanceFromTarget(rubric, card('a', 3, allAt('layout', 2)))).toBe(
      0.25
    );
    expect(distanceFromTarget(rubric, empty('a'))).toBeNull();
  });

  it('picks the lowest dimension, then its lowest criterion (R8)', () => {
    const c = card('a', 3, {
      ...allAt('visual', 2),
      ...allAt('layout', 2),
      S3: 1,
      V2: 0,
    });
    const pick = pickTarget(rubric, c);
    expect(pick?.dimension).toBe('visual');
    expect(pick?.criterionId).toBe('V2');
  });

  it('skips paused criteria and moves to the next one', () => {
    const c = card('a', 3, { ...allAt('layout', 2), S3: 1 });
    expect(pickTarget(rubric, c, { S3: {} })?.criterionId).not.toBe('S3');
    expect(pickTarget(rubric, c, { S3: {} })?.dimension).toBe('layout');
  });
});

describe('queue: ordering', () => {
  const cards = [
    card('big-gap', 3, allAt('layout', 1)),
    card('small-gap', 3, allAt('ecosystem', 2)),
    card('done', 3),
    empty('fresh'),
    card('broken', 4, {}, { G2: false }),
  ];

  it('puts gate failures first, then gap, and lists ungraded and at-target widgets', () => {
    const q = buildQueue({ rubric, scorecards: cards });
    expect(q.usedUsage).toBe(false);
    expect(
      q.items.map((i) => (i.kind === 'platform' ? i.criterionId : i.widgetType))
    ).toEqual(['broken', 'big-gap', 'small-gap']);
    expect(q.items[0]).toMatchObject({ kind: 'gate', dimension: 'layout' });
    expect(q.ungraded).toEqual(['fresh']);
    expect(q.atTarget).toEqual(['done']);
  });

  it('treats gate-baseline failures as gate failures', () => {
    const q = buildQueue({
      rubric,
      scorecards: [card('a', 3, allAt('layout', 1)), card('b', 3)],
      gateBaseline: { b: ['G3'] },
    });
    expect(q.items[0]).toMatchObject({
      kind: 'gate',
      widgetType: 'b',
      dimension: 'robustness',
    });
  });

  it('multiplies the gap by prod usage when usage.json exists (R9)', () => {
    const usage: UsageFile = {
      generatedAt: AT,
      project: 'spartboard',
      boards: 1000,
      counts: { 'small-gap': 900, 'big-gap': 2 },
    };
    const q = buildQueue({ rubric, scorecards: cards, usage });
    expect(q.usedUsage).toBe(true);
    expect(
      q.items.filter((i) => i.kind === 'widget').map((i) => i.widgetType)
    ).toEqual(['small-gap', 'big-gap']);
  });

  it('skips widgets with an open loop PR', () => {
    const q = buildQueue({
      rubric,
      scorecards: cards,
      openLoops: [{ widgetType: 'big-gap' }],
    });
    expect(
      q.items.some((i) => 'widgetType' in i && i.widgetType === 'big-gap')
    ).toBe(false);
  });

  it('sends stale and old-major scorecards to re-grade (R26)', () => {
    const stale = { ...card('s', 1), stale: true };
    const oldMajor = { ...card('o', 1), rubricVersion: '0.9.0' };
    const oneStale = card('c', 1);
    oneStale.criteria.S1 = {
      ...(oneStale.criteria.S1 as CriterionScore),
      stale: true,
    };
    expect(needsRegrade(rubric, card('ok', 1))).toBe(false);
    const q = buildQueue({ rubric, scorecards: [stale, oldMajor, oneStale] });
    expect(q.regrade).toEqual(['c', 'o', 's']);
    expect(q.items).toEqual([]);
  });

  it('queues Platform gaps ahead of the first loop on a criterion the Platform lifts', () => {
    const p: PlatformFile = {
      ...platform,
      scores: { P2: { score: 1 }, P4: { score: 3 } },
    };
    const q = buildQueue({
      rubric,
      platform: p,
      scorecards: [
        card('layout-low', 3, allAt('layout', 1)),
        card('drag-low', 3, { ...allAt('interaction', 2), I1: 1 }),
      ],
    });
    expect(
      q.items.map((i) => (i.kind === 'platform' ? i.criterionId : i.widgetType))
    ).toEqual(['layout-low', 'P2', 'drag-low']);
  });
});

describe('queue: preflight (R22, R25)', () => {
  const pass = {
    latest: { pass: true, rubricVersion: rubric.version, checkedAt: AT },
  };
  it('needs a passing calibration under the current major version', () => {
    expect(preflight({ rubric, agreement: null, openLoopPrs: 0 }).ok).toBe(
      false
    );
    expect(
      preflight({
        rubric,
        agreement: { latest: { ...pass.latest, pass: false } },
        openLoopPrs: 0,
      }).ok
    ).toBe(false);
    expect(
      preflight({
        rubric: { ...rubric, version: '2.0.0' },
        agreement: pass,
        openLoopPrs: 0,
      }).ok
    ).toBe(false);
    expect(preflight({ rubric, agreement: pass, openLoopPrs: 2 }).ok).toBe(
      true
    );
  });
  it('stops at 3 open loop PRs', () => {
    expect(preflight({ rubric, agreement: pass, openLoopPrs: 3 })).toEqual({
      ok: false,
      reasons: ['3 loop PRs already open'],
    });
  });
});

describe('loop: no-regression check (R20)', () => {
  it('passes a pure improvement and lists the gains', () => {
    const c = compareScorecards(rubric, card('a', 2), card('a', 2, { S1: 3 }));
    expect(c.ok).toBe(true);
    expect(c.gains).toEqual([{ criterionId: 'S1', before: 2, after: 3 }]);
  });
  it('rejects any drop, a lost score, or a gate failure', () => {
    expect(
      compareScorecards(rubric, card('a', 2), card('a', 3, { V2: 1 })).drops
    ).toEqual([{ criterionId: 'V2', before: 2, after: 1 }]);
    const lost = card('a', 3);
    delete lost.criteria.E1;
    expect(compareScorecards(rubric, card('a', 3), lost).ok).toBe(false);
    expect(
      compareScorecards(rubric, card('a', 2), card('a', 3, {}, { G1: false }))
        .ok
    ).toBe(false);
  });
});

describe('loop: fill check', () => {
  const render = (size: string, f: number, variant = 'base') => ({
    size: { name: size },
    fixture: 'typical',
    values: { variant, contentFraction: f },
  });
  it('flags a base render whose content shrank inside the card', () => {
    expect(
      compareFill(
        [render('default', 0.58), render('large', 0.6)],
        [render('default', 0.45), render('large', 0.58)]
      )
    ).toEqual([{ render: 'default/typical', before: 0.58, after: 0.45 }]);
  });
  it('ignores tiny changes and non-base variants', () => {
    expect(
      compareFill(
        [render('narrow', 0.2), render('default', 0.5, 'settings')],
        [render('narrow', 0.16), render('default', 0.1, 'settings')]
      )
    ).toEqual([]);
  });
});

describe('new-widget gate (R24)', () => {
  it('needs a full scorecard at B or better with no gate failure', () => {
    expect(newWidgetGate(rubric, null).ok).toBe(false);
    expect(newWidgetGate(rubric, empty('x')).message).toMatch(/^Not graded/);
    expect(newWidgetGate(rubric, card('x', 3)).ok).toBe(true);
    expect(newWidgetGate(rubric, card('x', 2)).ok).toBe(false);
    expect(newWidgetGate(rubric, card('x', 4, {}, { G3: false })).message).toBe(
      'x: D (4.00), gate failures G3; needs B or better.'
    );
  });
});

const loop = (
  n: number,
  outcome: SupervisedLoop['outcome']
): SupervisedLoop => ({
  pr: `#${n}`,
  widgetType: 'clock',
  dimension: 'layout',
  openedAt: `2026-11-${String(n).padStart(2, '0')}T00:00:00Z`,
  outcome,
});

describe('loop: supervised start (R32)', () => {
  it('stays full until 8 of the first 10 decided loops are accepted', () => {
    const nine = Array.from({ length: 9 }, (_, i) => loop(i + 1, 'accepted'));
    expect(reviewMode({ resetAt: null, loops: nine }).mode).toBe('full');
    const ten = [...nine, loop(10, 'changed'), loop(11, 'open')];
    expect(reviewMode({ resetAt: null, loops: ten })).toEqual({
      mode: 'light',
      decided: 10,
      accepted: 9,
    });
    const three = [
      ...Array.from({ length: 7 }, (_, i) => loop(i + 1, 'accepted')),
      loop(8, 'changed'),
      loop(9, 'rejected'),
      loop(10, 'changed'),
      loop(11, 'accepted'),
    ];
    expect(reviewMode({ resetAt: null, loops: three }).mode).toBe('full');
  });
  it('counts only loops after a failed spot check reset', () => {
    const loops = Array.from({ length: 12 }, (_, i) => loop(i + 1, 'accepted'));
    expect(reviewMode({ resetAt: '2026-11-05T00:00:00Z', loops }).decided).toBe(
      8
    );
    expect(reviewMode({ resetAt: '2026-11-05T00:00:00Z', loops }).mode).toBe(
      'full'
    );
  });
});

const spot = (
  criterionId: CriterionId,
  auto: Level,
  paul: Level,
  autoBefore: Level | null = null
): SpotCard => ({ widgetType: 'clock', criterionId, auto, paul, autoBefore });

describe('loop: weekly spot check (R33, R34)', () => {
  it('flags drift on a 2-level gap or a mean gap over 1', () => {
    expect(findDrift([spot('S1', 3, 3), spot('V2', 3, 1)])).toEqual(['V2']);
    expect(findDrift([spot('S1', 3, 2), spot('S1', 2, 2)])).toEqual([]);
    expect(
      findDrift([spot('I2', 4, 3), spot('I2', 3, 2), spot('I2', 2, 1)])
    ).toEqual([]);
  });

  it("flags gaming when automatic scores rose but Paul's did not", () => {
    expect(
      findGaming([
        spot('V4', 3, 2, 2),
        spot('V4', 4, 2, 2),
        spot('S1', 3, 3, 2),
      ])
    ).toEqual(['V4']);
    expect(findGaming([spot('V4', 3, 3, 2), spot('V4', 4, 4, 2)])).toEqual([]);
  });

  it('pauses failing criteria and resets supervision', () => {
    const r = recordSpotCheck(
      { paused: {}, checks: [] },
      { resetAt: null, loops: [loop(1, 'accepted')] },
      { date: AT, deckId: 'spot-1', cards: [spot('V2', 4, 1)] }
    );
    expect(r.failed).toBe(true);
    expect(r.spot.paused.V2).toEqual({
      since: AT,
      reason: 'drift in spot check',
    });
    expect(r.supervision.resetAt).toBe(AT);
    const ok = recordSpotCheck(
      { paused: {}, checks: [] },
      { resetAt: null, loops: [] },
      { date: AT, deckId: 'spot-2', cards: [spot('V2', 3, 3)] }
    );
    expect(ok.failed).toBe(false);
    expect(ok.supervision.resetAt).toBeNull();
  });

  it('builds cards from a graded deck with the before level from the last loop', () => {
    const cards = spotCardsFromExamples(
      [
        {
          widgetType: 'clock',
          criterionId: 'S1',
          paul: 2,
          judge: null,
          script: 3,
          deckId: 'spot-1',
        },
        {
          widgetType: 'clock',
          criterionId: 'V1',
          paul: 2,
          judge: null,
          script: null,
          deckId: 'spot-1',
        },
        {
          widgetType: 'clock',
          criterionId: 'S1',
          paul: 2,
          judge: 2,
          script: 2,
          deckId: 'other',
        },
      ],
      'spot-1',
      {
        resetAt: null,
        loops: [
          { ...loop(1, 'accepted'), changes: { S1: { before: 1, after: 3 } } },
        ],
      }
    );
    expect(cards).toEqual([spot('S1', 3, 2, 1)]);
  });

  it('samples recent automatic scores only, the same cards for the same seed', () => {
    const a = card('a', 3);
    a.criteria.S1 = { ...(a.criteria.S1 as CriterionScore), source: 'paul' };
    const old = card('b', 3);
    for (const s of Object.values(old.criteria))
      if (s) s.gradedAt = '2026-01-01';
    const opts = { n: 8, since: '2026-09-01', seed: 'x' };
    const s1 = sampleSpotCards([a, old], opts);
    expect(s1).toHaveLength(8);
    expect(
      s1.every((c) => c.widgetType === 'a' && c.criterionId !== 'S1')
    ).toBe(true);
    expect(sampleSpotCards([a, old], opts)).toEqual(s1);
  });
});
