import { describe, expect, it } from 'vitest';
import type {
  AiExtractedRubric,
  AiExtractedVersion,
  AiRubricCriterion,
  ExtractedTestSet,
} from './types';
import {
  countMismatchFlag,
  criterionGuideText,
  pairFlags,
  pairRubricsByOrder,
  pairingUnits,
  parsePromptItems,
  planImportedRubrics,
  promptMatchFlags,
  reassignRubric,
  rubricAttachment,
  rubricLibraryName,
  saveImportedRubrics,
  sliceSplitRubric,
  testSetVocabulary,
  toRubric,
  totalFlag,
  typoFlags,
  versionPromptItems,
} from './rubricImport';
import { rubricMaxPoints } from '@/utils/rubricPoints';
import type { Rubric } from '@/types';

const idGen = () => {
  let n = 0;
  return () => `id-${++n}`;
};

const row = (
  letter: string,
  prompt: string,
  points: number,
  credit: string[] = [],
  notes: string[] = []
): AiRubricCriterion => ({ letter, prompt, points, credit, notes });

const version = (
  label: string,
  intro: string,
  prompts: string[],
  start = 'A'
): AiExtractedVersion => ({
  label,
  title: label,
  warnings: [],
  questions: [
    {
      number: 1,
      text: [
        intro,
        ...prompts.map(
          (p, i) => `${String.fromCharCode(start.charCodeAt(0) + i)}. ${p}`
        ),
      ].join('\n'),
      type: 'free-response',
      options: [],
      correctAnswer: '',
      warnings: [],
    },
  ],
});

const MAPS_INTRO =
  'Use the two maps of religious regions to answer the following.';

const PROMPTS_A = [
  'Identify the religion shown in the shaded region of Map 1.',
  'Define the term hearth as it applies to religion.',
  'Describe one type of diffusion shown by the arrows on Map 2.',
  'Explain one historical factor that spread Islam across North Africa.',
  'Explain one modern factor that spreads religion today.',
  'Explain one limitation of the maps in showing religious diversity.',
];

const PROMPTS_B = [
  'Identify the universalizing religion shown on Map 1.',
  'Define relocation diffusion.',
  'Explain how Christian missionaries spread the religion across South America.',
  'Describe one barrier to religious diffusion.',
  'Explain one modern factor that spreads religion across borders today.',
  'Explain one way globalization changes local religious practice.',
];

const PROMPTS_C = [
  'Identify one ethnic religion.',
  'Describe the difference between an ethnic and a universalizing religion.',
  'Explain one way language diffuses through migration.',
  'Define acculturation.',
  'Explain how syncretism blends cultural traits.',
  'Explain one effect of globalization on folk culture.',
];

const PROMPTS_R = [
  'Identify one universalizing religion.',
  'Define contagious diffusion.',
  'Explain one way popular culture spreads through social media.',
  'Describe one example of cultural assimilation.',
  'Explain one way governments protect a national language.',
  'Explain one cause of the decline of an indigenous language.',
];

const SPLIT_PROMPTS = [
  'Identify the religion shown in the shaded region of Map 1.',
  'Describe hierarchical diffusion using Map 2.',
  'Explain one historical factor that spread Buddhism into East Asia.',
  'Explain one modern factor that spreads religion today.',
  'Describe one conflict caused by religious boundaries.',
  'Explain one limitation of the maps.',
];

const rubricFrom = (
  label: string,
  prompts: string[],
  points: number[],
  overrides: Partial<Record<number, Partial<AiRubricCriterion>>> = {},
  printedTotal = 10
): AiExtractedRubric => ({
  label,
  title: label,
  printedTotal,
  warnings: [],
  criteria: prompts.map((p, i) => ({
    ...row(String.fromCharCode(65 + i), p, points[i], [
      `Accurate response to ${String.fromCharCode(65 + i)}`,
    ]),
    ...overrides[i],
  })),
});

/** Modelled on the reference PDF's table in docs/plans/QUIZ_IMPORT_VERSIONS.md. */
const fixture = (): ExtractedTestSet => ({
  kind: 'test-set',
  title: 'Unit 3 FRQ (2025)',
  warnings: [],
  figures: [],
  versions: [
    version('Version A', MAPS_INTRO, PROMPTS_A),
    version('Version B', MAPS_INTRO, PROMPTS_B),
    version('Unit 3 Version C', 'Answer each part.', PROMPTS_C),
    version('Unit 3 REASSESSMENT', 'Answer each part.', PROMPTS_R),
    version('Version Split Pt 1', MAPS_INTRO, SPLIT_PROMPTS.slice(0, 3)),
    version('Version Split Pt 2', MAPS_INTRO, SPLIT_PROMPTS.slice(3), 'D'),
  ],
  rubrics: [
    rubricFrom('Rubric 1', PROMPTS_A, [1, 1, 2, 2, 2, 2], {
      0: {
        credit: ['Christianity', 'Accept: Roman Catholicism'],
        notes: ['NOT ACCEPTABLE: Europe (a region, not a religion)'],
      },
    }),
    rubricFrom('Rubric 2', PROMPTS_B, [1, 1, 2, 2, 2, 2], {
      2: {
        credit: [
          'Chrsitian missionaries built schools and churches',
          'Conversion of indigenous people',
        ],
      },
      4: {
        credit: ['Colonialism', 'Television and internet evangelism'],
        notes: ['NO POINTS AWARDED IF the response restates the prompt'],
      },
    }),
    rubricFrom('Rubric 3', PROMPTS_C, [1, 2, 2, 1, 2, 2]),
    rubricFrom('Rubric 4', PROMPTS_R, [1, 1, 2, 2, 2, 2]),
    rubricFrom('RUBRIC Version Split', SPLIT_PROMPTS, [1, 2, 2, 2, 1, 2]),
  ],
  groups: [
    { kind: 'parallel', name: 'Unit 3 FRQ', versions: [0, 1] },
    { kind: 'retake', name: 'Unit 3 FRQ Retake', versions: [2, 3] },
    { kind: 'split', name: 'Version Split', versions: [4, 5] },
  ],
});

describe('toRubric', () => {
  const rubric1 = fixture().rubrics[0];

  it('makes one criterion per letter with levels 0..points (V2)', () => {
    const r = toRubric('Unit 3 – Version A', rubric1.criteria, {
      scoringGuides: true,
      newId: idGen(),
      now: 5,
    });
    expect(r.criteria).toHaveLength(6);
    expect(r.criteria.map((c) => c.levels.map((l) => l.points))).toEqual([
      [0, 1],
      [0, 1],
      [0, 1, 2],
      [0, 1, 2],
      [0, 1, 2],
      [0, 1, 2],
    ]);
    expect(rubricMaxPoints(r)).toBe(10);
    expect(r.createdAt).toBe(5);
    expect(
      new Set(r.criteria.flatMap((c) => [c.id, ...c.levels.map((l) => l.id)]))
        .size
    ).toBe(6 + 16);
  });

  it('titles a row with its letter and prompt and keeps credit lines verbatim in the guide (V3)', () => {
    const r = toRubric('x', rubric1.criteria, {
      scoringGuides: true,
      newId: idGen(),
    });
    const a = r.criteria[0];
    expect(a.name).toBe(`A. ${PROMPTS_A[0]}`);
    expect(a.guide).toEqual({ examples: [] });
    expect(a.description).toBe(
      [
        'Credit received for:',
        '- Christianity',
        '- Accept: Roman Catholicism',
        'NOT ACCEPTABLE: Europe (a region, not a religion)',
      ].join('\n')
    );
  });

  it('puts the same guide text in a plain criterion when scoring guides are off (V26)', () => {
    const on = toRubric('x', rubric1.criteria, {
      scoringGuides: true,
      newId: idGen(),
    });
    const off = toRubric('x', rubric1.criteria, {
      scoringGuides: false,
      newId: idGen(),
    });
    expect(off.criteria.every((c) => c.guide === undefined)).toBe(true);
    expect(off.criteria.map((c) => c.description)).toEqual(
      on.criteria.map((c) => c.description)
    );
    expect(off.criteria[2].levels.map((l) => l.label)).toEqual([
      '0 of 2',
      '1 of 2',
      '2 of 2',
    ]);
  });

  it('leaves out the description when a row has no credit or notes', () => {
    const r = toRubric('x', [row('A', 'Prompt', 1)], { scoringGuides: true });
    expect(r.criteria[0]).not.toHaveProperty('description');
  });

  it('keeps level counts within the rubric limit for odd points', () => {
    const r = toRubric(
      'x',
      [row('A', 'p', 0), row('B', 'p', 9), row('C', 'p', 1.6)],
      {
        scoringGuides: false,
      }
    );
    expect(r.criteria.map((c) => c.levels.length)).toEqual([2, 6, 3]);
  });
});

describe('criterionGuideText', () => {
  it('keeps the source wording and spelling exactly', () => {
    const b = fixture().rubrics[1].criteria;
    expect(criterionGuideText(b[2])).toContain(
      '- Chrsitian missionaries built schools and churches'
    );
    expect(criterionGuideText(b[4])).toBe(
      [
        'Credit received for:',
        '- Colonialism',
        '- Television and internet evangelism',
        'NO POINTS AWARDED IF the response restates the prompt',
      ].join('\n')
    );
  });
});

describe('rubricLibraryName', () => {
  it('names a rubric after the file and the version (V15)', () => {
    expect(rubricLibraryName('Unit 3 FRQ (2025)', 'Version A')).toBe(
      'Unit 3 FRQ (2025) – Version A'
    );
    expect(rubricLibraryName('  ', 'Version A')).toBe('Version A');
    expect(rubricLibraryName('File', '')).toBe('File');
  });
});

describe('rubricAttachment', () => {
  it('sets what the quiz editor sets when attaching a library rubric', () => {
    const r = toRubric('x', fixture().rubrics[2].criteria, {
      scoringGuides: true,
    });
    expect(rubricAttachment(r)).toEqual({
      rubricId: r.id,
      rubricSnapshot: r,
      points: 10,
    });
    expect(rubricAttachment(r, 'lib').rubricId).toBe('lib');
  });
});

describe('pairing by order (V14)', () => {
  it('folds the split into one unit and pairs rubric n with version n', () => {
    const set = fixture();
    const pairing = pairRubricsByOrder(set);
    expect(pairing.units.map((u) => u.label)).toEqual([
      'Version A',
      'Version B',
      'Unit 3 Version C',
      'Unit 3 REASSESSMENT',
      'Version Split',
    ]);
    expect(pairing.units[4]).toEqual({
      versions: [4, 5],
      label: 'Version Split',
      split: true,
    });
    expect(pairing.rubricFor).toEqual([0, 1, 2, 3, 4]);
    expect(pairing.countMismatch).toBeNull();
    expect(countMismatchFlag(pairing)).toBeNull();
  });

  it('flags a count mismatch and leaves the extra version unpaired', () => {
    const set = fixture();
    set.rubrics.pop();
    const pairing = pairRubricsByOrder(set);
    expect(pairing.rubricFor).toEqual([0, 1, 2, 3, null]);
    expect(pairing.countMismatch).toEqual({ versions: 5, rubrics: 4 });
    expect(countMismatchFlag(pairing)?.message).toBe(
      'Found 5 versions and 4 rubrics. Check which rubric goes with each version.'
    );
  });

  it('flags extra rubrics without pairing them', () => {
    const set = fixture();
    set.versions = set.versions.slice(0, 2);
    set.groups = [];
    const pairing = pairRubricsByOrder(set);
    expect(pairing.rubricFor).toEqual([0, 1]);
    expect(pairing.countMismatch).toEqual({ versions: 2, rubrics: 5 });
  });

  it('treats a split group of one version as an ordinary version', () => {
    const set = fixture();
    set.groups = [{ kind: 'split', name: 'S', versions: [4] }];
    expect(pairingUnits(set)).toHaveLength(6);
  });

  it('reassigns one unit and leaves the others alone', () => {
    const pairing = pairRubricsByOrder(fixture());
    const next = reassignRubric(pairing, 0, 1);
    expect(next.rubricFor).toEqual([1, 1, 2, 3, 4]);
    expect(reassignRubric(next, 1, null).rubricFor).toEqual([1, null, 2, 3, 4]);
    expect(reassignRubric(pairing, 9, 0)).toBe(pairing);
    expect(pairing.rubricFor).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('prompt letters', () => {
  it('reads lettered prompts and joins wrapped lines', () => {
    expect(
      parsePromptItems(
        'Intro text.\nA. First prompt\ncontinues here\nB) Second\n(C) Third\nE. stray'
      )
    ).toEqual([
      { letter: 'A', text: 'First prompt continues here' },
      { letter: 'B', text: 'Second' },
      { letter: 'C', text: 'Third E. stray' },
    ]);
  });

  it("reads a split's second part starting at D", () => {
    expect(
      versionPromptItems(fixture().versions[5]).map((p) => p.letter)
    ).toEqual(['D', 'E', 'F']);
  });

  it('uses one question per letter when the version came back that way', () => {
    const v = version('V', 'x', []);
    v.questions = ['5A', '5B'].map((label, i) => ({
      ...v.questions[0],
      number: i + 1,
      label,
      text: `Prompt ${label}`,
    }));
    expect(versionPromptItems(v)).toEqual([
      { letter: 'A', text: 'Prompt 5A' },
      { letter: 'B', text: 'Prompt 5B' },
    ]);
  });
});

describe('sliceSplitRubric (V10)', () => {
  const criteria = fixture().rubrics[4].criteria;

  it('gives each part the rows for its letters so the total stays the same', () => {
    const { slices, byOrder } = sliceSplitRubric(criteria, [
      ['A', 'B', 'C'],
      ['D', 'E', 'F'],
    ]);
    expect(byOrder).toBe(false);
    expect(slices.map((s) => s.map((c) => c.letter))).toEqual([
      ['A', 'B', 'C'],
      ['D', 'E', 'F'],
    ]);
    const total = (cs: AiRubricCriterion[]) =>
      cs.reduce((t, c) => t + c.points, 0);
    expect(total(slices[0]) + total(slices[1])).toBe(10);
  });

  it('deals rows by order when the letters do not match, never dropping one', () => {
    const { slices, byOrder } = sliceSplitRubric(criteria, [['1', '2'], ['3']]);
    expect(byOrder).toBe(true);
    expect(slices.map((s) => s.length)).toEqual([2, 4]);
  });
});

describe('review flags (V16)', () => {
  it('flags rows whose letters do not match the prompts', () => {
    const flags = promptMatchFlags(
      fixture().rubrics[0].criteria.slice(0, 5),
      versionPromptItems(fixture().versions[0])
    );
    expect(flags).toEqual([
      {
        kind: 'letters',
        message:
          'The rubric has rows A, B, C, D, E, but the version has prompts A, B, C, D, E, F.',
      },
    ]);
  });

  it('flags a row whose wording does not match its prompt', () => {
    const set = fixture();
    const prompts = versionPromptItems(set.versions[0]);
    expect(promptMatchFlags(set.rubrics[0].criteria, prompts)).toEqual([]);
    const swapped = set.rubrics[2].criteria;
    const flags = promptMatchFlags(swapped, prompts);
    expect(flags.filter((f) => f.kind === 'prompt').length).toBeGreaterThan(0);
    expect(flags.find((f) => f.kind === 'prompt')?.message).toMatch(
      /^Rubric row [A-F] may not match prompt [A-F]\.$/
    );
  });

  it('flags rows that do not add up to the printed total', () => {
    const r = fixture().rubrics[0];
    expect(totalFlag(r)).toBeNull();
    expect(totalFlag({ ...r, printedTotal: 12 })?.message).toBe(
      'The rows add up to 10 points, but the rubric prints 12.'
    );
    expect(totalFlag({ ...r, printedTotal: undefined })).toBeNull();
  });

  it('flags "Chrsitian" and nothing else in the reference file', () => {
    const set = fixture();
    const vocab = testSetVocabulary(set);
    const all = set.rubrics.flatMap((r, i) =>
      pairFlags(r, versionPromptItems(set.versions[i]), vocab).filter(
        (f) => f.kind === 'typo'
      )
    );
    expect(all).toEqual([
      { kind: 'typo', message: '"Chrsitian" may be a typo for "Christian".' },
    ]);
  });

  it('finds a typo from the known-word list when the file never spells it right', () => {
    expect(typoFlags(['Spread by relcoation diffusion'], new Map())).toEqual([
      { kind: 'typo', message: '"relcoation" may be a typo for "relocation".' },
    ]);
  });

  it('leaves real words, plurals and short words alone', () => {
    const vocab = new Map([
      ['regions', 3],
      ['region', 3],
      ['three', 4],
    ]);
    expect(typoFlags(['region regions there thier', 'Region'], vocab)).toEqual(
      []
    );
  });

  it("keeps Version B's colonialism credit verbatim and unflagged (no AI judges it)", () => {
    const set = fixture();
    const flags = pairFlags(
      set.rubrics[1],
      versionPromptItems(set.versions[1]),
      testSetVocabulary(set)
    );
    expect(flags.map((f) => f.kind)).toEqual(['typo']);
    const plan = planImportedRubrics(set, pairRubricsByOrder(set), set.title, {
      scoringGuides: true,
      newId: idGen(),
    });
    expect(plan[1].libraryRubric.criteria[4].description).toContain(
      '- Colonialism'
    );
  });

  it('flags a row whose points a rubric row cannot hold', () => {
    const set = fixture();
    set.rubrics[2].criteria[0].points = 7;
    const flags = pairFlags(
      set.rubrics[2],
      versionPromptItems(set.versions[2]),
      new Map()
    );
    expect(flags.map((f) => f.message)).toEqual([
      'The rows add up to 16 points, but the rubric prints 10.',
      'Row A prints 7 points. Rows can be worth 1 to 5, so it was set to 5.',
    ]);
  });
});

describe('planImportedRubrics', () => {
  it('builds a library rubric per version and attaches it (V15)', () => {
    const set = fixture();
    const plans = planImportedRubrics(
      set,
      pairRubricsByOrder(set),
      'Unit 3 FRQ (2025)',
      {
        scoringGuides: true,
        newId: idGen(),
        now: 1,
      }
    );
    expect(plans.map((p) => p.libraryRubric.title)).toEqual([
      'Unit 3 FRQ (2025) – Version A',
      'Unit 3 FRQ (2025) – Version B',
      'Unit 3 FRQ (2025) – Unit 3 Version C',
      'Unit 3 FRQ (2025) – Unit 3 REASSESSMENT',
      'Unit 3 FRQ (2025) – Version Split',
    ]);
    const a = plans[0];
    expect(a.attachments).toEqual([
      {
        versionIndex: 0,
        fields: {
          rubricId: a.libraryRubric.id,
          rubricSnapshot: a.libraryRubric,
          points: 10,
        },
      },
    ]);
    expect(
      plans[2].libraryRubric.criteria.map((c) =>
        rubricMaxPoints({ ...plans[2].libraryRubric, criteria: [c] })
      )
    ).toEqual([1, 2, 2, 1, 2, 2]);
    expect(
      plans.slice(0, 4).every((p) => p.flags.every((f) => f.kind === 'typo'))
    ).toBe(true);
  });

  it('gives each split part its slice of the one rubric, totalling 10 (V10)', () => {
    const set = fixture();
    const split = planImportedRubrics(set, pairRubricsByOrder(set), 'F', {
      scoringGuides: true,
      newId: idGen(),
    })[4];
    expect(split.libraryRubric.criteria).toHaveLength(6);
    const [pt1, pt2] = split.attachments;
    expect(pt1.versionIndex).toBe(4);
    expect(pt2.versionIndex).toBe(5);
    const snap1 = pt1.fields.rubricSnapshot as Rubric;
    const snap2 = pt2.fields.rubricSnapshot as Rubric;
    expect(snap1.criteria.map((c) => c.name[0])).toEqual(['A', 'B', 'C']);
    expect(snap2.criteria.map((c) => c.name[0])).toEqual(['D', 'E', 'F']);
    expect((pt1.fields.points ?? 0) + (pt2.fields.points ?? 0)).toBe(10);
    expect(pt1.fields.rubricId).toBe(split.libraryRubric.id);
    expect(snap1.id).not.toBe(split.libraryRubric.id);
    expect(snap1.id).not.toBe(snap2.id);
    expect(snap1.title).toBe('F – Version Split Pt 1');
    expect(snap1.criteria[0]).toBe(split.libraryRubric.criteria[0]);
    expect(split.flags).toEqual([]);
  });

  it('flags a split dealt by order', () => {
    const set = fixture();
    set.rubrics[4].criteria = set.rubrics[4].criteria.map((c, i) => ({
      ...c,
      letter: String(i + 1),
    }));
    const split = planImportedRubrics(set, pairRubricsByOrder(set), 'F', {
      scoringGuides: false,
      newId: idGen(),
    })[4];
    expect(split.flags.map((f) => f.kind)).toContain('split-order');
    expect(
      split.attachments.map(
        (a) => (a.fields.rubricSnapshot as Rubric).criteria.length
      )
    ).toEqual([3, 3]);
  });

  it('skips units with no rubric and follows a reassignment', () => {
    const set = fixture();
    const pairing = reassignRubric(
      reassignRubric(pairRubricsByOrder(set), 0, null),
      1,
      0
    );
    const plans = planImportedRubrics(set, pairing, 'F', {
      scoringGuides: true,
      newId: idGen(),
    });
    expect(plans.map((p) => [p.unitIndex, p.rubricIndex])).toEqual([
      [1, 0],
      [2, 2],
      [3, 3],
      [4, 4],
    ]);
  });
});

describe('saveImportedRubrics', () => {
  it('saves each library rubric once through the injected saver', async () => {
    const set = fixture();
    const plans = planImportedRubrics(set, pairRubricsByOrder(set), 'F', {
      scoringGuides: true,
      newId: idGen(),
    });
    const saved: Rubric[] = [];
    await saveImportedRubrics(plans, (r) => {
      saved.push(r);
      return Promise.resolve();
    });
    expect(saved.map((r) => r.title)).toEqual(
      plans.map((p) => p.libraryRubric.title)
    );
  });
});
