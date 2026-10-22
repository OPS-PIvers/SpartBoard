import { describe, expect, it } from 'vitest';
import type { GuidedLearningSet, GuidedLearningStep } from '@/types';
import {
  isWebTourSet,
  webTourStepsOf,
} from '@/components/widgets/GuidedLearning/utils/liveTour';
import { liveTourStepsOf, tourStepsOf } from './tourSession';
import { tourHealthOf } from './tourHealth';
import { parsePublishedTour } from './tourSnapshot';

const boardStep: GuidedLearningStep = {
  id: 'b1',
  xPct: 0,
  yPct: 0,
  imageIndex: 0,
  interactionType: 'tooltip',
  tour: { anchor: 'sidebar.boards', action: 'click' },
};

const webStep: GuidedLearningStep = {
  id: 'w1',
  xPct: 0,
  yPct: 0,
  imageIndex: 0,
  interactionType: 'tooltip',
  label: 'Open grades',
  text: 'Click Grades.',
  web: {
    urlPattern: 'https://app.schoology.com/course/*/materials',
    locator: { role: 'link', name: 'Grades', css: 'nav > a:nth-child(3)' },
    action: 'click',
    picture: { path: 'web_tour_pictures/set-1/w1.png', w: 320, h: 180 },
  },
};

const set = (extra: Partial<GuidedLearningSet>): GuidedLearningSet => ({
  id: 'set-1',
  title: 'Tour',
  mode: 'tour',
  imageUrls: [],
  steps: [boardStep],
  createdAt: 1,
  updatedAt: 1,
  ...extra,
});

describe('web tour guards', () => {
  it('tells a web tour from a SpartBoard one; missing surface means SpartBoard', () => {
    expect(isWebTourSet(set({ surface: 'web' }))).toBe(true);
    expect(isWebTourSet(set({ surface: 'spartboard' }))).toBe(false);
    expect(isWebTourSet(set({}))).toBe(false);
    expect(isWebTourSet(null)).toBe(false);
  });

  it('lists web steps only for a web tour', () => {
    const web = set({ surface: 'web', steps: [webStep, boardStep] });
    expect(webTourStepsOf(web).map((s) => s.id)).toEqual(['w1']);
    expect(webTourStepsOf(set({ steps: [webStep] }))).toEqual([]);
  });

  it('gives the board runner, offers and health no steps for a web tour', () => {
    // A stray board binding in a web tour still never plays on the board.
    const web = set({ surface: 'web', steps: [webStep, boardStep] });
    expect(tourStepsOf(web)).toEqual([]);
    expect(liveTourStepsOf(web)).toEqual([]);
    expect(tourHealthOf(web)).toEqual([]);
    const board = set({ steps: [webStep, boardStep] });
    expect(tourStepsOf(board).map((s) => s.id)).toEqual(['b1']);
    expect(liveTourStepsOf(board)).toHaveLength(2);
  });

  it("takes a snapshot's top-level surface over its set's", () => {
    const parsed = parsePublishedTour('set-1', {
      set: { ...set({}), surface: 'spartboard' },
      surface: 'web',
      publishedAt: 3,
    });
    expect(parsed?.set.surface).toBe('web');
    expect(
      parsePublishedTour('set-1', { set: set({}), publishedAt: 3 })?.set.surface
    ).toBeUndefined();
  });

  it('keeps the web binding through a snapshot read', () => {
    const parsed = parsePublishedTour('set-1', {
      set: set({ surface: 'web', steps: [webStep] }),
      publishedAt: 3,
    });
    expect(parsed?.set.steps[0].web).toEqual(webStep.web);
  });
});
