import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import {
  FIB_BLANK_SEP,
  convertItems,
  specToQuestion,
  stableId,
  validateRun,
} from './lib/convert.mjs';
import { createClient } from './lib/fetchMdeItems.mjs';
import { imageIds } from './lib/html.mjs';
import { parseItem } from './lib/parse.mjs';
import { writePackage } from './lib/writePackage.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const read = (name: string): unknown =>
  JSON.parse(readFileSync(join(here, 'fixtures', name), 'utf8'));

type Item = { itemTableId: number; details: string; guide: string };
type Spec = Record<string, unknown>;
type Bank = {
  bank: {
    stimuli: { tabLabel?: string; readAloudText?: string }[];
    questions: { id: string }[];
  };
};
type Parsed = { ok: boolean; reason?: string; specs: Spec[] };

const items = read('items.json') as Item[];
const tabset = read('tabset.json') as { tabSetId: number };
const item = (id: number) => items.find((i) => i.itemTableId === id) as Item;
const parse = (id: number) => parseItem(item(id)) as unknown as Parsed;
const first = (id: number) => {
  const r = parse(id);
  expect(r.reason).toBeUndefined();
  return r.specs[0];
};

describe('parseItem', () => {
  it('reads a multiple-choice item with a rationale per option', () => {
    const s = first(27027);
    expect(s.kind).toBe('mc');
    expect(s.options).toHaveLength(4);
    expect(s.correct).toBe(3);
    expect((s.optionExplanations as string[])[3]).toMatch(/^Correct\./);
  });

  it('reads a multiple-response item and its key', () => {
    const s = first(27026);
    expect(s.kind).toBe('ma');
    expect(s.correct).toEqual([false, true, false, true, true]);
  });

  it('reads inline choice as dropdown blanks with a key from the rubric', () => {
    const s = first(28319);
    expect(s).toMatchObject({
      kind: 'fib',
      blankType: 'dropdown',
      answers: ['July', 'sugar'],
      choices: [
        ['December', 'July'],
        ['carbon dioxide', 'sugar'],
      ],
    });
    expect(s.text).toContain('_____');
  });

  it('reads gap match as a word bank, fixing the alt text spelling from the rubric', () => {
    const s = first(28755);
    expect(s).toMatchObject({
      kind: 'fib',
      blankType: 'drag',
      bank: ['0 cm', '1 cm', '2 cm'],
      answers: ['0 cm', '2 cm'],
      reuse: false,
    });
    expect((s.text as string).match(/_____/g)).toHaveLength(2);
    expect((s.review as string[]).length).toBeGreaterThan(0);
  });

  it('reads drag-to-box items as matching pairs', () => {
    expect(first(28773).pairs).toEqual([
      ['Higher speed', 'Immediately Before Impact'],
      ['Lower temperature', 'Immediately Before Impact'],
      ['Lower speed', 'During Impact'],
      ['Higher temperature', 'During Impact'],
    ]);
    expect(first(28758).pairs).toEqual([
      ['Magnesium', '1'],
      ['Carbon', '1'],
      ['Oxygen', '3'],
    ]);
  });

  it('reads the holistic rubric of a constructed response', () => {
    const s = first(27033) as { rubric: { levels: { score: number }[] } };
    expect(s.rubric.levels.map((l) => l.score)).toEqual([0, 1, 2, 3]);
  });

  it('refuses a point graph so a hand conversion is needed', () => {
    const r = parse(28784);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/Point graph/);
  });
});

describe('specToQuestion', () => {
  const ctx = {
    item: { itemTableId: 1, naepId: '9', difficulty: 2 },
    stimulusIds: ['s1'],
    targets: [],
    title: 'T',
    now: 1,
  };

  it('writes a dropdown blank question with per-blank choices', () => {
    const q = specToQuestion(first(28319), ctx);
    expect(q).toMatchObject({
      type: 'FIB',
      blankType: 'dropdown',
      dok: 2,
      correctAnswer: ['July', 'sugar'].join(FIB_BLANK_SEP),
      blankChoices: [
        { choices: ['December', 'July'] },
        { choices: ['carbon dioxide', 'sugar'] },
      ],
    });
  });

  it('writes a drag question with the word bank', () => {
    const q = specToQuestion(first(28755), ctx);
    expect(q).toMatchObject({
      blankType: 'drag',
      wordBank: ['0 cm', '1 cm', '2 cm'],
      wordBankReuse: false,
    });
  });

  it('refuses a key that is not among its choices', () => {
    const bad = { ...first(28319), answers: ['June', 'sugar'] };
    expect(() => specToQuestion(bad, ctx)).toThrow(/not among its choices/);
  });

  it('refuses a blank count that does not match the key', () => {
    const bad = { ...first(28755), answers: ['0 cm'] };
    expect(() => specToQuestion(bad, ctx)).toThrow(/blanks/);
  });

  it('writes matching keys and refuses a term the key cannot hold', () => {
    expect(specToQuestion(first(28758), ctx).correctAnswer).toBe(
      'Magnesium:1|Carbon:1|Oxygen:3'
    );
    const bad = { ...first(28758), pairs: [['a:b', 'c']] };
    expect(() => specToQuestion(bad, ctx)).toThrow(/":" or "\|"/);
  });

  it('turns the MDE rubric into a four-level rubric worth its top score', () => {
    const q = specToQuestion(first(27033), ctx) as unknown as {
      points: number;
      rubricSnapshot: { criteria: { levels: unknown[] }[] };
    };
    expect(q.points).toBe(3);
    expect(q.rubricSnapshot.criteria[0].levels).toHaveLength(4);
  });
});

describe('stableId', () => {
  it('gives the same uuid for the same parts and a different one otherwise', () => {
    expect(stableId('q', 1)).toBe(stableId('q', 1));
    expect(stableId('q', 1)).not.toBe(stableId('q', 2));
    expect(stableId('q', 1)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });
});

const run = () => {
  const imageIndex = Object.fromEntries(
    items.flatMap((i) => imageIds(i.details)).map((id) => [id, { ext: 'png' }])
  );
  return convertItems({
    items: items as object[],
    tabsets: { [tabset.tabSetId]: tabset },
    imageIndex,
    overrides: {
      '28784': {
        questions: [
          {
            kind: 'fr',
            part: 'A',
            text: 'Part A',
            explanation: 'Points',
            images: [0],
          },
          {
            kind: 'mc',
            part: 'B',
            text: 'Part B',
            options: ['x', 'y'],
            correct: 0,
            optionExplanations: ['', ''],
          },
        ],
      },
    },
    catalog: new Map(),
    meta: { test: 'MCA IV', subject: 'Science', grade: '8', now: 1000 },
  });
};

describe('convertItems', () => {
  it('groups by stimulus set, keeps every item and reports checks', () => {
    const r = run();
    expect(r.report).toHaveLength(items.length);
    expect(r.report.filter((x) => x.status === 'not-converted')).toEqual([]);
    expect(r.banks.reduce((n, b) => n + b.bank.questions.length, 0)).toBe(9);
    expect(r.report.find((x) => x.mdeType === 'GM')?.status).toBe(
      'converted-check'
    );
    expect(r.report.find((x) => x.mdeType === 'MC')?.status).toBe('converted');
  });

  it('gives each tab a tabLabel and the tab words as read-aloud text', () => {
    const stimuli = (run().banks as unknown as Bank[]).flatMap(
      (b) => b.bank.stimuli
    );
    const tab = stimuli.find((s) => s.tabLabel);
    expect(tab?.tabLabel).toMatch(/^Tab /);
    expect((tab?.readAloudText ?? '').length).toBeGreaterThan(20);
  });

  it('is repeatable: the same input gives the same ids', () => {
    const ids = () =>
      (run().banks as unknown as Bank[]).flatMap((b) =>
        b.bank.questions.map((q) => q.id)
      );
    expect(ids()).toEqual(ids());
  });

  it('reports an item it cannot read instead of dropping it', () => {
    const r = convertItems({
      items: [{ ...items[0], type: 'XX' }],
      tabsets: {},
      imageIndex: {},
      overrides: {},
      catalog: new Map(),
      meta: { test: 'T', subject: 'Science', grade: '8', now: 1 },
    });
    expect(r.report[0]).toMatchObject({ status: 'not-converted' });
    expect((r.report[0] as { reason?: string }).reason).toMatch(
      /No conversion for MDE type XX/
    );
  });

  it('validates that every listed item is accounted for', () => {
    const r = run();
    expect(validateRun(r, items)).toEqual([]);
    expect(validateRun(r, [...items, { itemTableId: 1 }])).toHaveLength(1);
  });
});

describe('writePackage', () => {
  it('writes a manifest, one file per bank and the pictures', async () => {
    const r = run();
    const pictures = new Map<string, Buffer>();
    for (const t of r.pictures.tabs) {
      pictures.set(`pictures/${t.file}`, Buffer.from('png'));
    }
    for (const f of r.pictures.figures) {
      pictures.set(`pictures/${f.file}`, Buffer.from('png'));
    }
    const bytes = await writePackage({
      banks: r.banks,
      pictures,
      meta: { title: r.collection, generatedAt: 1000, source: {} },
    });
    const zip = await JSZip.loadAsync(bytes);
    const manifest = JSON.parse(
      await zip.file('package.json')!.async('string')
    ) as { format: string; entries: { path: string; questionCount: number }[] };
    expect(manifest.format).toBe('spartboard-package');
    expect(manifest.entries).toHaveLength(r.banks.length);
    for (const e of manifest.entries) expect(zip.file(e.path)).not.toBeNull();
  });

  it('refuses a bank whose pictures are missing', async () => {
    const r = run();
    await expect(
      writePackage({
        banks: r.banks,
        pictures: new Map(),
        meta: { title: 't', generatedAt: 1, source: {} },
      })
    ).rejects.toThrow(/missing pictures/);
  });
});

describe('createClient', () => {
  it('retries a 500 and waits between requests', async () => {
    const calls: string[] = [];
    const sleeps: number[] = [];
    const get = createClient({
      delayMs: 0,
      sleep: (ms: number) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
      fetchImpl: ((url: string) => {
        calls.push(url);
        return Promise.resolve(
          calls.length === 1
            ? new Response('', { status: 500 })
            : new Response(JSON.stringify([1]), { status: 200 })
        );
      }) as typeof fetch,
    });
    expect(await get('/x')).toEqual([1]);
    expect(calls).toHaveLength(2);
    expect(sleeps).toContain(2000);
  });

  it('fails fast on a 404', async () => {
    const get = createClient({
      delayMs: 0,
      sleep: () => Promise.resolve(),
      fetchImpl: (() =>
        Promise.resolve(new Response('', { status: 404 }))) as typeof fetch,
    });
    await expect(get('/x')).rejects.toThrow(/404/);
  });
});
