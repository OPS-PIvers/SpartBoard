import { describe, it, expect } from 'vitest';
import type { GuidedLearningSet } from '@/types';
import {
  tourPublishStatus,
  buildTourContent,
} from '@/components/tours/tourSnapshot';
import {
  convertTourSet,
  SET_SLIDE_FIELDS,
  STEP_SLIDE_FIELDS,
} from './lib/convertTourSlides.mjs';
import { parseArgs, planConversions } from './convert-tour-slides.mjs';

const slideStep = (
  id: string,
  anchor: string | null,
  imageIndex?: number
): Record<string, unknown> => ({
  id,
  text: `Step ${id}`,
  interactionType: 'tooltip',
  ...(imageIndex === undefined ? {} : { imageIndex }),
  xPct: 40,
  yPct: 60,
  region: { shape: 'rect', wPct: 10, hPct: 10 },
  calloutPin: { xPct: 1, yPct: 2 },
  calloutWidthPct: 30,
  calloutScale: 1.2,
  calloutTone: 'light',
  calloutBox: { xPct: 1, yPct: 2, wPct: 3, hPct: 4 },
  ...(anchor ? { tour: { anchor, action: 'click' } } : {}),
});

const tourSet = (): Record<string, unknown> => ({
  id: 'tour1',
  title: 'Timer tour',
  mode: 'tour',
  hasLiveTour: true,
  isBuilding: true,
  createdAt: 1,
  updatedAt: 2,
  imageUrls: ['https://img/0.png', 'https://img/1.mp4', 'https://img/2.png'],
  imageKinds: ['image', 'video', 'image'],
  imagePaths: ['p0', 'p1', 'p2'],
  slideThumbnails: { 'https://img/0.png': 'https://thumb/0.png' },
  videoTrims: [null, { start: 0, end: 2 }, null],
  steps: [
    slideStep('s1', 'dock.timer'),
    slideStep('s2', 'timer.start', 1),
    slideStep('s3', 'board.whole', 2),
    slideStep('s4', 'timer.reset', 7),
    slideStep('s5', null, 2),
    {
      ...slideStep('s6', null, 2),
      tour: {
        anchor: 'timer.stop',
        action: 'click',
        thumbnail: { url: 'https://kept.png', anchor: 'old', w: 9, h: 9 },
      },
    },
    slideStep('s7', 'timer.stop', 2),
  ],
});

type Step = Record<string, unknown> & {
  tour?: { anchor: string; thumbnail?: unknown };
};

describe('convertTourSet', () => {
  it('moves slides into thumbnails and drops slide fields', () => {
    const { set, changed, stats } = convertTourSet(tourSet());
    expect(changed).toBe(true);
    const steps = set.steps as Step[];
    expect(steps[0].tour?.thumbnail).toEqual({
      url: 'https://img/0.png',
      anchor: 'dock.timer',
      w: 0,
      h: 0,
    });
    expect(steps[1].tour?.thumbnail).toBeUndefined(); // video slide
    expect(steps[2].tour?.thumbnail).toBeUndefined(); // board.whole
    expect(steps[3].tour?.thumbnail).toMatchObject({
      url: 'https://img/2.png',
    }); // clamped to the last slide, as the player showed it
    expect(steps[4].tour).toBeUndefined();
    expect(steps[5].tour?.thumbnail).toEqual({
      url: 'https://kept.png',
      anchor: 'old',
      w: 9,
      h: 9,
    });
    expect(steps[6].tour?.thumbnail).toMatchObject({
      url: 'https://img/2.png',
      anchor: 'timer.stop',
    });
    for (const step of steps) {
      for (const key of STEP_SLIDE_FIELDS) expect(step).not.toHaveProperty(key);
      expect(step.text).toBe(`Step ${step.id as string}`);
    }
    for (const key of SET_SLIDE_FIELDS) expect(set).not.toHaveProperty(key);
    expect(set.imagePaths).toEqual(['p0', 'p1', 'p2']);
    expect(set.updatedAt).toBe(2);
    expect(stats).toMatchObject({
      stepsConverted: 7,
      thumbnailsAdded: 3,
      picturesDropped: 1,
      droppedSetFields: [
        'imageUrls',
        'imageKinds',
        'slideThumbnails',
        'videoTrims',
      ],
    });
  });

  it('is a no-op on a second run', () => {
    const once = convertTourSet(tourSet()).set;
    const twice = convertTourSet(once);
    expect(twice.changed).toBe(false);
    expect(twice.set).toBe(once);
  });

  it('leaves non-tour sets untouched', () => {
    const plain = { ...tourSet(), mode: 'structured' };
    const result = convertTourSet(plain);
    expect(result.changed).toBe(false);
    expect(result.set).toBe(plain);
  });

  it('adds no thumbnail when the set has no slides', () => {
    const { set, changed } = convertTourSet({
      mode: 'tour',
      imageUrls: [],
      steps: [slideStep('s1', 'dock.timer', 0)],
    });
    expect(changed).toBe(true);
    expect((set.steps as Step[])[0].tour?.thumbnail).toBeUndefined();
  });

  it('uses the legacy single imageUrl', () => {
    const { set } = convertTourSet({
      mode: 'tour',
      imageUrl: 'https://legacy.png',
      steps: [slideStep('s1', 'dock.timer')],
    });
    expect((set.steps as Step[])[0].tour?.thumbnail).toMatchObject({
      url: 'https://legacy.png',
    });
    expect(set).not.toHaveProperty('imageUrl');
  });
});

describe('planConversions', () => {
  const snapshotOf = (set: Record<string, unknown>) => ({
    set: buildTourContent(set as unknown as GuidedLearningSet),
    publishedAt: 5,
    publishedBy: 'admin',
  });

  it('converts a set and its snapshot alike, so the tour stays published', () => {
    const draft = tourSet();
    const plans = planConversions(
      [
        { id: 'tour1', data: draft },
        { id: 'plain', data: { ...tourSet(), mode: 'structured' } },
      ],
      [{ id: 'tour1', data: snapshotOf(draft) }]
    );
    expect(plans.map((p) => p.id)).toEqual(['tour1']);
    const [plan] = plans;
    expect(plan.draft.changed).toBe(true);
    expect(plan.published?.changed).toBe(true);
    const snapshotSteps = plan.published?.set.steps as Step[];
    expect(snapshotSteps[0].tour?.thumbnail).toMatchObject({
      url: 'https://img/0.png',
    });
    expect(plan.published?.set).not.toHaveProperty('imageUrls');
    const status = tourPublishStatus(
      plan.draft.set as unknown as GuidedLearningSet,
      {
        set: plan.published?.set as unknown as GuidedLearningSet,
        publishedAt: 5,
        publishedBy: 'admin',
      }
    );
    expect(status).toBe('published');

    const again = planConversions(
      [{ id: 'tour1', data: plan.draft.set }],
      [{ id: 'tour1', data: { set: plan.published?.set } }]
    );
    expect(again).toEqual([]);
  });

  it('converts a snapshot whose set is already converted', () => {
    const converted = convertTourSet(tourSet()).set;
    const plans = planConversions(
      [{ id: 'tour1', data: converted }],
      [{ id: 'tour1', data: snapshotOf(tourSet()) }]
    );
    expect(plans).toHaveLength(1);
    expect(plans[0].draft.changed).toBe(false);
    expect(plans[0].published?.changed).toBe(true);
  });
});

describe('parseArgs', () => {
  it('maps project names and only writes with --write', () => {
    expect(parseArgs(['--project', 'dev'])).toMatchObject({
      project: 'spartboard-dev',
      dryRun: true,
    });
    expect(parseArgs(['--project', 'dev', '--write']).dryRun).toBe(false);
    expect(parseArgs(['--project', 'prod']).project).toBe('spartboard');
    expect(parseArgs(['--project', 'x']).project).toBe('invalid');
  });
});
