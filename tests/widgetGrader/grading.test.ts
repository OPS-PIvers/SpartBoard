import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runInNewContext } from 'node:vm';
import Ajv from 'ajv';
import {
  applicabilityFacts,
  buildDeck,
  plainWords,
  shotsFor,
  type WidgetInput,
} from '@/scripts/widget-grader/grading/deck';
import {
  applyAutomaticScores,
  applyPaulGrades,
  type CalibrationExample,
} from '@/scripts/widget-grader/grading/apply';
import { parseGradeRows } from '@/scripts/widget-grader/grading/rows';
import { toolLabels } from '@/scripts/widget-grader/grading/cli';
import {
  buildJudgePrompt,
  judgedCriteria,
} from '@/scripts/widget-grader/judge/prompt';
import { parseJudgeOutput } from '@/scripts/widget-grader/judge/parse';
import {
  appendAgreement,
  computeAgreement,
} from '@/scripts/widget-grader/calibration/check';
import type {
  GradeRow,
  GradingDeck,
} from '@/scripts/widget-grader/grading/types';
import type {
  CriterionId,
  Level,
  Measurement,
  Rubric,
  Scorecard,
  SizeName,
} from '@/scripts/widget-grader/types';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const readJson = <T>(p: string): T =>
  JSON.parse(readFileSync(join(repoRoot, p), 'utf8')) as T;
const rubric = readJson<Rubric>('docs/widget-rubric/rubric.json');
const schema = readJson<object>('docs/widget-rubric/scorecard.schema.json');
const validate = new Ajv({ allErrors: true }).compile(schema);

const NOW = '2026-10-05T20:00:00.000Z';
const SIZES: Record<SizeName, [number, number]> = {
  'envelope-min': [150, 100],
  default: [300, 200],
  'large-1400x900': [1400, 900],
  'maximized-1920x1080': [1920, 1080],
  'widest-aspect': [600, 150],
  'tallest-aspect': [150, 600],
};

const render = (
  type: string,
  size: SizeName,
  fixture: 'empty' | 'typical' | 'stress',
  variant = 'base'
): Measurement => ({
  widgetType: type,
  criterionId: null,
  size: { name: size, width: SIZES[size][0], height: SIZES[size][1] },
  fixture,
  gate: 'G1',
  pass: true,
  values: {
    variant,
    screenshot: `scripts/widget-grader/out/run1/screenshots/${type}/${size}__${fixture}${variant === 'base' ? '' : `__${variant}`}.png`,
  },
});

const implied = (
  type: string,
  id: CriterionId,
  values: Measurement['values'],
  level: Level | null
): Measurement => ({
  widgetType: type,
  criterionId: id,
  size: null,
  fixture: null,
  values,
  impliedLevel: level,
});

const widget = (
  type: string,
  extra: Partial<WidgetInput> = {}
): WidgetInput => ({
  type,
  name: type === 'clock' ? 'Clock' : 'Checklist',
  hasSettings: true,
  measurements: [
    ...(Object.keys(SIZES) as SizeName[]).flatMap((s) =>
      (['empty', 'typical', 'stress'] as const).map((f) => render(type, s, f))
    ),
    render(type, 'default', 'typical', 'settings'),
    render(type, 'default', 'typical', 'selected'),
    {
      widgetType: type,
      criterionId: null,
      size: null,
      fixture: null,
      gate: 'G2',
      pass: false,
      values: { where: 'envelope-min/stress' },
    },
    implied(type, 'S6', { applicable: false }, null),
    implied(
      type,
      'I2',
      { applicable: true, controlsAtDefault: 4, minSpacingPx: -1 },
      2
    ),
    implied(type, 'I1', { dragFraction: 0.42, stripsCovered: 0 }, 3),
    implied(type, 'S1', { minTargetPx: 28, minFontPx: 11 }, null),
  ],
  ...extra,
});

const deckFor = (
  widgets: WidgetInput[],
  mode: GradingDeck['mode'] = 'widget',
  criterion?: CriterionId
) =>
  buildDeck({
    rubric,
    mode,
    criterion,
    widgets,
    deckId: 'deck1',
    runId: 'run1',
    createdAt: NOW,
  });

describe('grading deck', () => {
  it('marks N/A only from applicability facts', () => {
    const facts = applicabilityFacts(widget('clock'));
    expect(facts.scrollableContent).toBe(false);
    expect(facts.hasControls).toBe(true);
    expect(facts.animates).toBeNull();
    const deck = deckFor([widget('clock')]);
    const na = deck.cards.filter((c) => c.na).map((c) => c.criterionId);
    expect(na).toEqual(['S6']);
    expect(deck.cards).toHaveLength(35);
  });

  it('drops settings criteria for a widget with no settings', () => {
    const deck = deckFor([widget('clock', { hasSettings: false })]);
    const na = deck.cards.filter((c) => c.na).map((c) => c.criterionId);
    expect(na.sort()).toEqual(['C2', 'C4', 'C6', 'S6']);
  });

  it('describes measurements in plain words', () => {
    expect(
      plainWords({
        minTargetPx: 28,
        dragFraction: 0.42,
        minSpacingPx: -1,
        applicable: true,
        nestedOrWholeCard: '',
        mixedIconLibraries: false,
      })
    ).toEqual([
      'Smallest tap target: 28 px',
      'Card that starts a drag: 42%',
      'Smallest gap between targets: none',
      'Mixed icon libraries: no',
    ]);
  });

  it('picks the screenshots each criterion needs', () => {
    const ms = widget('clock').measurements;
    expect(shotsFor('clock', 'S1', ms).map((s) => s.caption)).toEqual([
      'Minimum 150×100, empty',
      'Minimum 150×100, typical',
      'Minimum 150×100, stress',
    ]);
    expect(shotsFor('clock', 'C5', ms).map((s) => s.src)).toEqual([
      'shots/clock/default__empty.png',
    ]);
    expect(shotsFor('clock', 'C6', ms)[0].caption).toContain('settings open');
  });

  it('builds criterion mode across widgets with harness links and gates', () => {
    const deck = deckFor(
      [widget('clock'), widget('checklist')],
      'criterion',
      'I1'
    );
    expect(deck.cards.map((c) => c.id)).toEqual(['clock__I1', 'checklist__I1']);
    expect(deck.cards[0].scriptLevel).toBe(3);
    expect(deck.cards[0].harness[0].path).toBe(
      '/widget-grader-dev?type=clock&fixture=typical&w=300&h=200'
    );
    expect(deck.gates.clock.find((g) => g.gate === 'G2')?.pass).toBe(false);
  });

  it('keeps only disagreements in disagreements mode', () => {
    const deck = deckFor(
      [
        widget('clock', {
          judge: {
            I1: { score: 1, why: 'grab area is hidden' },
            I2: { score: 2, why: 'small buttons' },
          },
        }),
      ],
      'disagreements'
    );
    expect(deck.cards.map((c) => c.criterionId)).toEqual(['I1']);
  });

  it('reads widget names from config/tools.ts', () => {
    const labels = toolLabels(
      readFileSync(join(repoRoot, 'config/tools.ts'), 'utf8')
    );
    expect(labels.clock).toBe('Clock');
    expect(labels.checklist).toBeTruthy();
  });
});

describe('judge', () => {
  const w = widget('clock');
  const allowed = new Map(
    judgedCriteria(rubric, w).map((j) => [j.criterion.id, j.levels])
  );

  it('asks only for judge criteria that apply, with their own levels', () => {
    expect(allowed.has('S4')).toBe(false);
    expect(allowed.has('S6')).toBe(false);
    expect(allowed.get('C4')).toBeUndefined();
    expect(allowed.get('S7')).toEqual([1, 2, 3, 4]);
  });

  it('leaves out Paul scores for the graded widget and excluded widgets', () => {
    const example = (widgetType: string, note: string): CalibrationExample => ({
      widgetType,
      criterionId: 'V1',
      paul: 3,
      judge: null,
      script: null,
      note,
      rubricVersion: '1.0.0',
      gradedAt: NOW,
      runId: 'r',
      deckId: 'd',
    });
    const prompt = buildJudgePrompt({
      rubric,
      widget: w,
      examples: [
        example('clock', 'own score'),
        example('poll', 'held out'),
        example('timer', 'seed example'),
      ],
      exclude: ['poll'],
    });
    expect(prompt).toContain('seed example');
    expect(prompt).not.toContain('own score');
    expect(prompt).not.toContain('held out');
    expect(prompt).toContain(
      'scripts/widget-grader/out/run1/screenshots/clock/default__typical.png'
    );
  });

  it('rejects N/A, undefined levels and missing criteria', () => {
    const scores = Object.fromEntries(
      [...allowed.keys()].map((id) => [id, { level: 3, why: 'ok' }])
    );
    scores.V1 = { level: null as unknown as number, why: '' };
    scores.S7 = { level: 0, why: '' };
    delete scores.V2;
    const { errors, result } = parseJudgeOutput(
      `Here you go\n\`\`\`json\n${JSON.stringify({ widgetType: 'clock', scores })}\n\`\`\``,
      'clock',
      allowed
    );
    expect(errors).toEqual(
      expect.arrayContaining([
        'V1: the judge cannot mark N/A (R15)',
        'S7: level 0 is not one of 1, 2, 3, 4',
        'V2: missing',
      ])
    );
    expect(result?.scores.V3?.score).toBe(3);
  });
});

describe('write-back', () => {
  const deck = deckFor([
    widget('clock', { judge: { V1: { score: 1, why: 'dated' } } }),
  ]);
  const rows: GradeRow[] = [
    {
      cardId: 'clock__V1',
      level: 3,
      note: 'clean',
      missed: 'glass look counts',
      exemplar: true,
      gradedAt: NOW,
    },
    { cardId: 'clock__I1', level: 4, gradedAt: NOW },
    { cardId: 'clock__C4', level: 2, gradedAt: NOW },
    { cardId: 'clock__S6', level: 3, gradedAt: NOW },
  ];

  it('writes Paul scores, calibration examples, rewrites and exemplars', () => {
    const result = applyPaulGrades(deck, rows, {}, NOW);
    const card = result.scorecards.clock;
    expect(validate(card)).toBe(true);
    expect(card.criteria.V1).toMatchObject({
      score: 3,
      source: 'paul',
      candidates: { script: null, judge: 1, paul: 3 },
      note: 'clean | glass look counts',
    });
    expect(card.criteria.I1?.candidates).toMatchObject({ script: 3, paul: 4 });
    expect(card.criteria.S6).toMatchObject({
      score: null,
      note: 'N/A by rule',
    });
    expect(card.gates.G2?.pass).toBe(false);
    expect(result.rejected).toEqual(['clock__C4', 'clock__S6']);
    expect(result.examples).toHaveLength(2);
    expect(result.rewrites).toEqual([
      {
        criterionId: 'V1',
        widgetType: 'clock',
        paul: 3,
        judge: 1,
        missed: 'glass look counts',
      },
    ]);
    expect(result.exemplars).toEqual({ V1: { '3': 'clock' } });
  });

  it('records script and judge scores without overriding Paul', () => {
    const paul = applyPaulGrades(deck, rows, {}, NOW).scorecards;
    const auto = applyAutomaticScores(deck, paul, NOW);
    expect(validate(auto.clock)).toBe(true);
    expect(auto.clock.criteria.V1?.source).toBe('paul');
    expect(auto.clock.criteria.I2).toMatchObject({
      score: 2,
      source: 'script',
    });
    const fresh = applyAutomaticScores(deck, {}, NOW).clock;
    expect(fresh.criteria.V1).toMatchObject({
      score: 1,
      source: 'judge',
      note: 'dated',
    });
  });

  it('parses an ArtifactData listing and drops bad rows', () => {
    expect(
      parseGradeRows({
        docs: [
          {
            id: 'clock__V1',
            data: { cardId: 'clock__V1', level: 3, note: ' x ', gradedAt: NOW },
          },
          { id: 'clock__I1', data: { level: 5, gradedAt: NOW } },
          { id: 'clock__I2', data: { level: 2, gradedAt: 'yesterday' } },
          {
            id: 'clock__I3',
            data: { level: 1, gradedAt: NOW, exemplar: 'yes' },
          },
        ],
      })
    ).toEqual([
      { cardId: 'clock__V1', level: 3, note: ' x ', gradedAt: NOW },
      { cardId: 'clock__I3', level: 1, gradedAt: NOW },
    ]);
  });
});

describe('calibration check (R22)', () => {
  const held = ['a', 'b', 'c', 'd', 'e'];
  const criteria: CriterionId[] = ['V1', 'V2', 'V3', 'C1'];
  const examples: CalibrationExample[] = held.flatMap((w) =>
    criteria.map((c, i) => ({
      widgetType: w,
      criterionId: c,
      paul: (i === 0 && w === 'a' ? 0 : 3) as Level,
      judge: null,
      script: null,
      rubricVersion: '1.0.0',
      gradedAt: NOW,
      runId: 'r',
      deckId: 'd',
    }))
  );
  const runs = (score: (w: string, c: CriterionId, run: number) => Level) =>
    held.flatMap((w) =>
      [1, 2, 3].map((run) => ({
        widgetType: w,
        scores: Object.fromEntries(
          criteria.map((c) => [c, { score: score(w, c, run), why: '' }])
        ),
      }))
    );
  const check = (r: ReturnType<typeof runs>) =>
    computeAgreement({
      examples,
      runs: r,
      heldOut: held,
      rubricVersion: '1.0.0',
      checkedAt: NOW,
    });

  it('passes when the judge matches Paul', () => {
    const a = check(runs((w, c) => (w === 'a' && c === 'V1' ? 0 : 3)));
    expect(a).toMatchObject({
      pass: true,
      exact: 1,
      withinOne: 1,
      maxSpread: 0,
      gatesCaught: { caught: 1, total: 1 },
    });
  });

  it('fails under 60% exact even when within one', () => {
    const a = check(
      runs((w, c) => (w === 'a' && c === 'V1' ? 0 : c === 'C1' ? 3 : 2))
    );
    expect(a.pass).toBe(false);
    expect(a.withinOne).toBe(1);
    expect(a.exact).toBeLessThan(0.6);
    expect(a.failures[0]).toMatch(/^exact/);
  });

  it('fails on a spread over 1, a missed gate and too few runs', () => {
    const spread = check(
      runs((w, c, run) =>
        w === 'a' && c === 'V1'
          ? 0
          : run === 3 && c === 'V2' && w === 'b'
            ? 1
            : 3
      )
    );
    expect(spread.maxSpread).toBe(2);
    expect(spread.pass).toBe(false);
    const missed = check(
      runs((w, c, run) =>
        w === 'a' && c === 'V1' && run === 2
          ? 1
          : w === 'a' && c === 'V1'
            ? 0
            : 3
      )
    );
    expect(missed.gatesCaught).toEqual({ caught: 0, total: 1 });
    const all = runs(() => 3);
    const few = check([
      ...all.filter((r) => r.widgetType !== 'e'),
      ...all.filter((r) => r.widgetType === 'e').slice(0, 1),
    ]);
    expect(few.failures.some((f) => f.includes('judge runs'))).toBe(true);
  });

  it('keeps every check in history', () => {
    const a = check(runs(() => 3));
    const file = appendAgreement(appendAgreement(null, a), a);
    expect(file.history).toHaveLength(2);
    expect(file.latest).toBe(a);
  });
});

describe('platform scorecard', () => {
  it('covers the window chrome the plan lists, on the rubric scale', () => {
    const platform = readJson<{
      rubricVersion: string;
      criteria: {
        id: string;
        name: string;
        descriptors: Record<string, string>;
      }[];
    }>('docs/widget-rubric/platform.json');
    expect(platform.rubricVersion).toBe(rubric.version);
    expect(platform.criteria.map((c) => c.name)).toEqual([
      'Drag edge zones',
      'Resize corners',
      'Toolbar placement and reach',
      'Snap layouts',
      'Touch on a large panel',
      'Minimize and maximize',
      'Settings drawer shell',
    ]);
    for (const c of platform.criteria) {
      expect(Object.keys(c.descriptors)).toEqual(
        expect.arrayContaining(['1', '2', '3', '4'])
      );
    }
  });
});

// The grading page with an in-memory db: click through, then write the rows back into a scorecard.
describe('grading page click-through', () => {
  const page = readFileSync(
    join(repoRoot, '.claude/skills/grade-widget/page/index.html'),
    'utf8'
  );

  const memoryDb = () => {
    const docs = new Map<string, Record<string, unknown>>();
    const listeners: (() => void)[] = [];
    const notify = () => listeners.forEach((l) => l());
    const snap = (path: string) => ({
      id: path.split('/').pop(),
      exists: docs.has(path),
      data: () => docs.get(path),
    });
    return {
      docs,
      db: {
        doc: (path: string) => ({
          set: (data: Record<string, unknown>) => {
            docs.set(path, data);
            notify();
            return Promise.resolve();
          },
          onSnapshot: (next: (s: unknown) => void) => {
            const fire = () => next(snap(path));
            listeners.push(fire);
            fire();
            return () => undefined;
          },
        }),
        collection: (path: string) => ({
          onSnapshot: (next: (s: unknown) => void) => {
            const fire = () =>
              next({
                docs: [...docs.keys()]
                  .filter(
                    (k) =>
                      k.startsWith(`${path}/`) &&
                      k.split('/').length === path.split('/').length + 1
                  )
                  .map(snap),
              });
            listeners.push(fire);
            fire();
            return () => undefined;
          },
        }),
      },
    };
  };

  it('hides the judge until a pick, saves rows, and writes them into the scorecard', async () => {
    const deck = deckFor(
      [
        widget('clock', {
          judge: { V1: { score: 1, why: 'every row is boxed' } },
        }),
      ],
      'criterion',
      'V1'
    );
    const store = memoryDb();
    const fakeWindow = {
      fetch: () =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve(JSON.parse(JSON.stringify(deck)) as unknown),
        }),
      claude: {
        use: (name: string) => Promise.resolve(name === 'db' ? store.db : null),
      },
    };
    const [markup, script] = page.split(/<script>|<\/script>/);
    document.body.innerHTML = markup;
    runInNewContext(script, {
      window: fakeWindow,
      document,
      localStorage,
      Node,
      Element,
      console,
    });
    const settle = () => new Promise((r) => setTimeout(r, 20));
    await settle();

    const byId = <T extends HTMLElement = HTMLElement>(id: string): T => {
      const node = document.getElementById(id);
      if (!node) throw new Error(`#${id} missing`);
      return node as T;
    };
    const text = () => byId('main').textContent ?? '';
    expect(text()).toContain('V1 Modern appearance');
    expect(text()).not.toContain('every row is boxed');

    const level3 = [
      ...document.querySelectorAll<HTMLButtonElement>('button.level'),
    ].find((b) => b.querySelector('.num')?.textContent === '3');
    level3?.click();
    await settle();
    expect(text()).toContain('every row is boxed');
    expect(text()).toContain('What did the descriptor miss?');

    const missed = byId<HTMLTextAreaElement>('missed-clock__V1');
    missed.value = 'glass look counts';
    missed.dispatchEvent(new Event('change'));
    byId('exemplar-clock__V1').click();
    await settle();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: '4' }));
    await settle();
    byId('done').click();
    await settle();
    expect(store.docs.get('decks/deck1')).toMatchObject({ done: true });
    expect(byId('done').textContent).toBe('Finished');

    const listing = {
      docs: [...store.docs.entries()]
        .filter(([k]) => k.startsWith('decks/deck1/grades/'))
        .map(([k, data]) => ({ id: k.split('/').pop(), data })),
    };
    const result = applyPaulGrades(deck, parseGradeRows(listing), {}, NOW);
    const card: Scorecard = result.scorecards.clock;
    expect(validate(card)).toBe(true);
    expect(card.criteria.V1).toMatchObject({
      score: 4,
      source: 'paul',
      candidates: { judge: 1, paul: 4 },
    });
    expect(card.criteria.V1?.note).toBe('glass look counts');
    expect(result.exemplars).toEqual({ V1: { '4': 'clock' } });
    document.body.innerHTML = '';
  });
});
