import { describe, expect, it } from 'vitest';
import type { QuizStimulus } from '@/types';
import {
  MAX_INLINE_STIMULUS_MM,
  RESOURCE_BODY_MM,
  paginateStimuli,
  planSheetStimuli,
  type BlockMeasure,
} from './paperSheetStimulusBlocks';
import { paperPrintWords } from './paperPrintWords';

const NO_FILES = { images: {}, pages: {} };
// One millimetre per ten characters of text, ignoring markup.
const measure: BlockMeasure = (html) =>
  html.replace(/<[^>]+>/g, '').length / 10;
const stim = (over: Partial<QuizStimulus> & { id: string }): QuizStimulus => ({
  type: 'text',
  url: '',
  label: '',
  ...over,
});
const tallText = 'word '.repeat(MAX_INLINE_STIMULUS_MM * 5);

const planFor = (
  stimuli: QuizStimulus[],
  ids: Record<string, string[]>,
  language?: string
) =>
  planSheetStimuli(
    Object.keys(ids).map((questionId, i) => ({ questionId, row: i + 1 })),
    new Map(
      Object.entries(ids).map(([id, stimulusIds]) => [id, { id, stimulusIds }])
    ),
    stimuli,
    NO_FILES,
    measure,
    paperPrintWords(language)
  );

describe('planSheetStimuli', () => {
  it('prints a short stimulus in its question block', () => {
    const plan = planFor([stim({ id: 's', text: 'The cell is small.' })], {
      q1: ['s'],
    });
    expect(plan.blocks.get('q1')?.html).toContain('The cell is small.');
    expect(plan.resourcePages).toEqual([]);
    expect(plan.pagesBefore.size).toBe(0);
  });

  it('prints a Resource page stimulus once, and points each question at it', () => {
    const plan = planFor(
      [stim({ id: 'r', text: 'Article', paperPlacement: 'resource' })],
      { q1: ['r'], q2: ['r'] }
    );
    expect(plan.resourcePages.map((p) => p.title)).toEqual(['Resource A']);
    expect(plan.blocks.get('q1')?.html).toContain('Use Resource A.');
    expect(plan.blocks.get('q2')?.html).toContain('Use Resource A.');
  });

  it('moves a too-tall default stimulus to a Resource page', () => {
    const plan = planFor([stim({ id: 't', text: tallText })], { q1: ['t'] });
    expect(plan.resourcePages[0].title).toBe('Resource A');
    expect(plan.pagesBefore.size).toBe(0);
  });

  it('keeps a too-tall "With the question" stimulus on pages just before it', () => {
    const plan = planFor(
      [stim({ id: 't', text: tallText, paperPlacement: 'question' })],
      { q0: [], q1: ['t'] }
    );
    expect(plan.resourcePages).toEqual([]);
    expect(plan.blocks.has('q1')).toBe(false);
    const pages = plan.pagesBefore.get('q1') ?? [];
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.map((p) => p.title)).toEqual([
      'Question 2',
      ...pages.slice(1).map(() => 'Question 2 (continued)'),
    ]);
    for (const p of pages)
      expect(measure(p.html, RESOURCE_BODY_MM.w)).toBeLessThanOrEqual(
        RESOURCE_BODY_MM.h
      );
  });

  it("prints the resource words in a translated copy's language", () => {
    const plan = planFor(
      [
        stim({ id: 'r', text: 'Article', paperPlacement: 'resource' }),
        stim({ id: 't', text: tallText, paperPlacement: 'question' }),
      ],
      { q1: ['r'], q2: ['t'] },
      'es'
    );
    expect(plan.resourcePages[0].title).toBe('Recurso A');
    expect(plan.blocks.get('q1')?.html).toContain('Usa el recurso A.');
    const pages = plan.pagesBefore.get('q2') ?? [];
    expect(pages[0].title).toBe('Pregunta 2');
    expect(pages[1].title).toBe('Pregunta 2 (continuación)');
  });
});

describe('paginateStimuli', () => {
  it('finishes when a blank-line-only paragraph lands on a page break', () => {
    let calls = 0;
    // "AAAA" fills a page with no room for another line; "BBBB" fills one alone.
    const tight: BlockMeasure = (html) => {
      calls += 1;
      if (calls > 1000) throw new Error('paginateStimuli did not finish');
      return /AAAA\n\n\n/.test(html) || /\nBBBB/.test(html) ? 1000 : 0;
    };
    const pages = paginateStimuli(
      [{ title: 'Resource A', item: { kind: 'text', text: 'AAAA\n\n\nBBBB' } }],
      tight
    );
    expect(pages.map((p) => p.title)).toEqual([
      'Resource A',
      'Resource A (continued)',
    ]);
    expect(pages[1].html).toContain('BBBB');
  });
});

describe('paginateStimuli', () => {
  it('finishes when a blank-line-only paragraph lands on a page break', () => {
    let calls = 0;
    // "AAAA" fills a page with no room for another line; "BBBB" fills one alone.
    const tight: BlockMeasure = (html) => {
      calls += 1;
      if (calls > 1000) throw new Error('paginateStimuli did not finish');
      return /AAAA\n\n\n/.test(html) || /\nBBBB/.test(html) ? 1000 : 0;
    };
    const pages = paginateStimuli(
      [{ title: 'Resource A', item: { kind: 'text', text: 'AAAA\n\n\nBBBB' } }],
      tight
    );
    expect(pages.map((p) => p.title)).toEqual([
      'Resource A',
      'Resource A (continued)',
    ]);
    expect(pages[1].html).toContain('BBBB');
  });
});
