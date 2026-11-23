import { describe, expect, it } from 'vitest';
import type { PaperSheetEntry } from './paperPageMap';
import { layoutSheetStimuli } from './paperSheetStimuliLayout';
import type { SheetStimuliPlan } from './paperSheetStimulusBlocks';

const block = (heightMm: number) => ({ html: `<p>${heightMm}</p>`, heightMm });
const mc = (id: string, label: string): PaperSheetEntry => ({
  kind: 'mc',
  questionId: id,
  label,
});
const wr = (
  id: string,
  label: string,
  size: 'S' | 'L' | 'full'
): PaperSheetEntry => ({ kind: 'written', questionId: id, label, size });
const plan = (
  blocks: Record<string, number>,
  pagesBefore: Record<string, string> = {}
): SheetStimuliPlan => ({
  blocks: new Map(Object.entries(blocks).map(([id, h]) => [id, block(h)])),
  resourcePages: [],
  pagesBefore: new Map(
    Object.entries(pagesBefore).map(([id, title]) => [
      id,
      [{ title, html: '' }],
    ])
  ),
});

describe('layoutSheetStimuli', () => {
  it('puts each block where its question prints, keyed the way the print job looks it up', () => {
    const layout = layoutSheetStimuli(
      [
        {
          entries: [mc('a', '1'), wr('b', '2', 'S'), wr('c', '3', 'full')],
          mapIds: ['a', 'b', 'c'],
          plan: plan({ a: 10, b: 20, c: 30 }, { a: 'Question 1' }),
        },
      ],
      new Set()
    );
    const [set] = layout.sets;
    expect(set.rows.get('a')?.heightMm).toBe(10);
    expect(set.written.b?.heightMm).toBe(20);
    // A Full box prints on its own page, with the block in its prompt header.
    expect(set.prompts.c?.heightMm).toBe(30);
    expect([...layout.promptIds]).toEqual(['c']);
    expect(layout.stimulusMm).toEqual({ a: 10, b: 20 });
    expect(set.pagesBefore.a?.[0].title).toBe('Question 1');
  });

  it('reserves the tallest block any version prints in a template slot', () => {
    const layout = layoutSheetStimuli(
      [
        {
          entries: [mc('x', '1')],
          mapIds: ['slot'],
          plan: plan({ x: 12 }),
        },
        {
          entries: [mc('y', '1')],
          mapIds: ['slot'],
          plan: plan({ y: 18 }),
        },
      ],
      new Set()
    );
    expect(layout.stimulusMm).toEqual({ slot: 18 });
    expect(layout.sets[1].rows.get('y')?.heightMm).toBe(18);
  });

  it('moves a block to the prompt header when the box and block cannot share a page', () => {
    const layout = layoutSheetStimuli(
      [
        {
          entries: [wr('a', '1', 'L'), wr('b', '2', 'L')],
          mapIds: ['a', 'b'],
          plan: plan({ a: 20, b: 110 }),
        },
      ],
      new Set()
    );
    expect(layout.sets[0].written.a?.heightMm).toBe(20);
    expect(layout.sets[0].prompts.b?.heightMm).toBe(110);
    expect([...layout.promptIds]).toEqual(['b']);
  });

  it('places a version block by the box the template plans for that slot', () => {
    const layout = layoutSheetStimuli(
      [
        {
          entries: [wr('x', '1', 'S')],
          mapIds: ['slot'],
          slots: [wr('slot', '1', 'full')],
          plan: plan({ x: 20 }),
        },
      ],
      new Set()
    );
    expect(layout.sets[0].prompts.slot?.heightMm).toBe(20);
    expect(layout.sets[0].written.slot).toBeUndefined();
  });
});
