import { describe, expect, it, vi } from 'vitest';
import type { GuidedLearningSet } from '@/types';
import {
  anchorNeeds,
  anchorProblem,
  checkAnchorsLive,
  fieldStatsOf,
  stepVerdict,
  tourHealthOf,
  worstState,
} from './tourHealth';
import type { TourRun } from './tourRuns';

describe('anchorProblem', () => {
  it('accepts registered anchors with the right widget type', () => {
    expect(anchorProblem('sidebar.boards')).toBeNull();
    expect(anchorProblem('dock.item:clock')).toBeNull();
  });

  it('accepts per-widget anchors with or without a widget type', () => {
    expect(anchorProblem('widget.window')).toBeNull();
    expect(anchorProblem('widget.settings-opener:schedule')).toBeNull();
    expect(anchorProblem('settings.root:schedule')).toBeNull();
    expect(anchorProblem('widget.window:not-a-widget')).toBe(
      'unknown-widget-type'
    );
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
    const rect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue(new DOMRect(0, 0, 40, 40));
    const root = document.createElement('div');
    root.innerHTML = '<button data-tour="sidebar.boards">Boards</button>';
    const live = checkAnchorsLive(
      tourHealthOf(set).map((h) => h.step),
      root
    );
    expect(live.get('a')).toBe(true);
    expect(live.get('b')).toBe(false);
    rect.mockRestore();
  });
});

const run = (v: number, misses: string[], done = false): TourRun => ({
  v,
  startedAt: 1,
  furthest: 0,
  done,
  misses,
});

describe('fieldStatsOf', () => {
  it('counts only runs of the current version', () => {
    const stats = fieldStatsOf(
      [run(2, ['a'], true), run(2, ['a', 'a', 'b']), run(1, ['c'])],
      2
    );
    expect(stats.runs).toBe(2);
    expect(stats.done).toBe(1);
    expect([...stats.misses]).toEqual([
      ['a', 2],
      ['b', 1],
    ]);
  });
});

describe('stepVerdict', () => {
  const health = (anchor: string, id = 's') => ({
    step: { id, tour: { anchor, action: 'click' } } as never,
    problem: anchorProblem(anchor),
  });
  const setup = { widgets: ['clock' as const] };
  const none = fieldStatsOf([], 1);

  it('says which anchors need a widget or panel open', () => {
    expect(anchorNeeds('widget.title')).toBe('widget');
    expect(anchorNeeds('sidebar.boards')).toBe('panel');
    expect(anchorNeeds('library.item:clock')).toBe('panel');
    expect(anchorNeeds('sidebar.open-menu')).toBeNull();
  });

  it('is OK when registered and found or not yet checked', () => {
    expect(stepVerdict(health('sidebar.open-menu'), setup, none, true)).toEqual(
      { state: 'ok', reason: null }
    );
    expect(
      stepVerdict(health('widget.title'), setup, none, undefined).state
    ).toBe('ok');
  });

  it('needs a widget or panel open when its widget or panel is closed', () => {
    expect(stepVerdict(health('sidebar.boards'), setup, none, false)).toEqual({
      state: 'needs-open',
      reason: 'needs-panel',
    });
    expect(stepVerdict(health('widget.title'), setup, none, false)).toEqual({
      state: 'needs-open',
      reason: 'needs-widget',
    });
    // A per-widget anchor in a tour that adds no widget depends on the teacher's board.
    expect(stepVerdict(health('widget.title'), undefined, none, true)).toEqual({
      state: 'needs-open',
      reason: 'widget-not-added',
    });
  });

  it('is broken when unregistered, missed in real runs, or absent with nothing to open', () => {
    expect(
      stepVerdict(health('sidebar.nowhere'), setup, none, undefined)
    ).toEqual({ state: 'broken', reason: 'unknown-anchor' });
    const missed = fieldStatsOf([run(1, ['s'])], 1);
    expect(stepVerdict(health('sidebar.boards'), setup, missed, true)).toEqual({
      state: 'broken',
      reason: 'field-misses',
    });
    expect(
      stepVerdict(health('sidebar.open-menu'), setup, none, false)
    ).toEqual({ state: 'broken', reason: 'not-on-screen' });
  });

  it('rolls a tour up to its worst step', () => {
    expect(worstState([])).toBe('ok');
    expect(worstState(['ok', 'needs-open'])).toBe('needs-open');
    expect(worstState(['needs-open', 'broken', 'ok'])).toBe('broken');
  });
});
