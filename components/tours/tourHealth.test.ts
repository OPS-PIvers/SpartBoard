import { describe, expect, it } from 'vitest';
import type { GuidedLearningSet } from '@/types';
import { anchorProblem, checkAnchorsLive, tourHealthOf } from './tourHealth';

describe('anchorProblem', () => {
  it('accepts registered anchors with the right widget type', () => {
    expect(anchorProblem('sidebar.boards')).toBeNull();
    expect(anchorProblem('dock.item:clock')).toBeNull();
  });

  it('names each registry problem', () => {
    expect(anchorProblem('sidebar.nowhere')).toBe('unknown-anchor');
    expect(anchorProblem('dock.item')).toBe('needs-widget-type');
    expect(anchorProblem('sidebar.boards:clock')).toBe(
      'unexpected-widget-type'
    );
    expect(anchorProblem('dock.item:not-a-widget')).toBe('unknown-widget-type');
  });
});

const set = {
  id: 'set-1',
  title: 'Tour',
  imageUrls: [],
  steps: [
    { id: 'intro' },
    { id: 'a', tour: { anchor: 'sidebar.boards', action: 'click' } },
    { id: 'b', tour: { anchor: 'sidebar.nowhere', action: 'observe' } },
  ],
} as unknown as GuidedLearningSet;

describe('tourHealthOf', () => {
  it('lists tour steps with their Studio numbers and problems', () => {
    expect(
      tourHealthOf(set).map((h) => [h.step.id, h.number, h.problem])
    ).toEqual([
      ['a', 2, null],
      ['b', 3, 'unknown-anchor'],
    ]);
  });
});

describe('checkAnchorsLive', () => {
  it('reports which anchors resolve on the page', () => {
    const root = document.createElement('div');
    root.innerHTML = '<button data-tour="sidebar.boards">Boards</button>';
    const live = checkAnchorsLive(
      tourHealthOf(set).map((h) => h.step),
      root
    );
    expect(live.get('a')).toBe(true);
    expect(live.get('b')).toBe(false);
  });
});
