import { describe, expect, it, vi } from 'vitest';
import type { GuidedLearningSet, GuidedLearningStep } from '@/types';

vi.mock('@/config/firebase', () => ({ functions: {} }));

import {
  applyWriting,
  hasStarterTitle,
  undoWriting,
  writingRequests,
} from './writeWithClaude';

const step = (
  id: string,
  over: Partial<GuidedLearningStep> = {},
  web: Partial<NonNullable<GuidedLearningStep['web']>> = {}
): GuidedLearningStep => ({
  id,
  xPct: 50,
  yPct: 50,
  imageIndex: 0,
  interactionType: 'tooltip',
  label: 'Click Gradebook',
  text: '',
  web: {
    urlPattern: 'https://lms.example/*',
    action: 'click',
    locator: { role: 'link', name: 'Gradebook' },
    ...web,
  },
  ...over,
});

const tour = (steps: GuidedLearningStep[]): GuidedLearningSet => ({
  id: 't1',
  title: 'T',
  imageUrls: [],
  steps,
  mode: 'tour',
  surface: 'web',
  createdAt: 1,
  updatedAt: 1,
});

describe('writingRequests', () => {
  const set = tour([
    step('starter'),
    step('typed', { label: 'Open grades', text: 'Mine' }),
    step('tipOnly', { label: 'Open grades' }),
    step(
      'asked',
      { label: 'Open grades', text: 'Mine' },
      { claudeQuestion: 'Why?' }
    ),
  ]);

  it('fills starter titles and empty tips, keeping typed words', () => {
    expect(writingRequests(set, 'blanks')).toEqual([
      { id: 'starter', fields: ['title', 'tip'] },
      { id: 'tipOnly', fields: ['tip'] },
    ]);
    expect(hasStarterTitle(step('x', { label: '  ' }))).toBe(true);
    expect(hasStarterTitle(step('x', { label: 'Click it' }))).toBe(false);
  });

  it('Rewrite all asks for every field', () => {
    expect(writingRequests(set, 'all')).toHaveLength(4);
    expect(writingRequests(set, 'all')[1].fields).toEqual(['title', 'tip']);
  });

  it('a rerun asks only about steps with questions that still have blanks', () => {
    const asked = tour([
      step('a', {}, { claudeQuestion: 'Why?' }),
      step('b'),
      set.steps[3],
    ]);
    expect(writingRequests(asked, 'questions')).toEqual([
      { id: 'a', fields: ['title', 'tip'] },
    ]);
  });
});

describe('applyWriting and undoWriting', () => {
  it('writes only fields still blank, records questions, and undoes in one go', () => {
    const before = tour([
      step('a'),
      step('b', { label: 'Typed meanwhile' }),
      step('c', {}, { claudeQuestion: 'Old?' }),
    ]);
    const { set, undo, wrote, asked } = applyWriting(
      before,
      [
        { id: 'a', title: 'Open the gradebook', tip: 'Shows grades.' },
        { id: 'b', title: 'Not this', tip: 'Tip for b.' },
        { id: 'c', question: 'Which course?' },
        { id: 'gone', title: 'x' },
      ],
      'blanks'
    );
    expect(set.steps[0]).toMatchObject({
      label: 'Open the gradebook',
      text: 'Shows grades.',
    });
    expect(set.steps[1]).toMatchObject({
      label: 'Typed meanwhile',
      text: 'Tip for b.',
    });
    expect(set.steps[2].web?.claudeQuestion).toBe('Which course?');
    expect([wrote, asked]).toEqual([2, 1]);
    expect(undoWriting(set, undo)).toEqual(before);
  });

  it('Rewrite all replaces typed words and clears an answered question', () => {
    const before = tour([
      step('a', { label: 'Mine', text: 'Mine' }, { claudeQuestion: 'Why?' }),
    ]);
    const { set } = applyWriting(
      before,
      [{ id: 'a', title: 'New', tip: 'New tip' }],
      'all'
    );
    expect(set.steps[0]).toMatchObject({ label: 'New', text: 'New tip' });
    expect(set.steps[0].web).not.toHaveProperty('claudeQuestion');
  });
});
