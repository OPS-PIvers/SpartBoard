// The public-link function and the app judge pictures and draw steps the same way, so what an admin confirms is what the public sees.
import { describe, expect, it } from 'vitest';
import type { GuidedLearningSet } from '@/types';
import {
  pictureFingerprint as serverFingerprint,
  publicTourOf,
} from '@/functions/src/tourPublicLinkModel';
import { pictureFingerprint } from '@/components/tours/publicLink/publicLinkModel';
import { stepsFromWebTour } from '@/components/tours/steps/stepsModel';
import { stepsFromLiveTour } from '@/components/tours/steps/liveSteps';
import { webTourSequenceOf } from '@/components/tours/web/tourSequence';

const BUCKET = 'spartboard.appspot.com';
const url = (path: string) =>
  `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media&token=t`;

const webTour = {
  id: 'w1',
  title: 'Web',
  surface: 'web',
  steps: [
    {
      id: 'a',
      label: 'Recorded ring',
      text: 'One',
      web: {
        urlPattern: 'https://x.example/*',
        action: 'click',
        locator: { role: 'button', name: 'Go' },
        showWhen: { kind: 'target' },
        picture: {
          path: 'web_tour_pictures/w1/a.png',
          w: 900,
          h: 500,
          cssW: 900,
          target: { x: 0.1, y: 0.2, w: 0.2, h: 0.1 },
          markup: [
            {
              id: 'm1',
              kind: 'arrow',
              x1: 0.123456,
              y1: 0.2,
              x2: 0.5,
              y2: 0.5,
            },
            { id: 'm2', kind: 'number', x: 0.7, y: 0.7, n: 1 },
          ],
        },
      },
    },
    {
      id: 'b',
      label: 'Estimated ring',
      text: 'Two',
      web: {
        urlPattern: 'https://x.example/*',
        action: 'observe',
        locator: {
          role: 'link',
          name: 'More',
          box: { x: 0.4, y: 0.4, w: 0.05, h: 0.03 },
        },
        picture: { path: 'web_tour_pictures/w1/b.png', w: 1280, h: 800 },
      },
    },
    {
      id: 'c',
      label: 'No picture',
      text: 'Three',
      web: { urlPattern: 'https://x.example/*', action: 'click' },
    },
  ],
} as unknown as GuidedLearningSet;

const crossSite = {
  id: 'x1',
  title: 'Across sites',
  surface: 'web',
  steps: [
    { id: 'm1', label: 'Welcome', text: 'We start on Gemini.', message: true },
    {
      id: 'a',
      label: 'Gemini',
      text: 'One',
      web: {
        urlPattern: 'https://gemini.google.com/app',
        action: 'click',
        locator: { role: 'button', name: 'Go' },
        picture: { path: 'web_tour_pictures/x1/a.png', w: 900, h: 500 },
      },
    },
    {
      id: 'm2',
      label: 'Over to Claude',
      text: 'Next we switch.',
      message: true,
    },
    {
      id: 'b',
      label: 'Claude',
      text: 'Two',
      web: {
        urlPattern: 'https://claude.ai/customize/skills',
        action: 'observe',
        locator: { role: 'link', name: 'Skills' },
      },
    },
    {
      id: 'c',
      label: 'Claude again',
      text: 'Three',
      web: { urlPattern: 'https://claude.ai/chat/*', action: 'click' },
    },
    { id: 'm3', label: 'All done', text: 'That is the tour.', message: true },
  ],
} as unknown as GuidedLearningSet;

const liveTour = {
  id: 'l1',
  title: 'Live',
  mode: 'tour',
  imageUrls: [url('users/u/hotspot_images/slide.png')],
  steps: [
    {
      id: 'a',
      label: 'Fresh thumbnail',
      text: 'Click **Tools**',
      tour: {
        anchor: 'dock.open-tools',
        action: 'click',
        showWhen: ['class-added'],
        thumbnail: {
          url: url('users/u/hotspot_images/1-a.png'),
          anchor: 'dock.open-tools',
          w: 320,
          h: 140,
          target: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 },
        },
      },
    },
    {
      id: 'b',
      label: 'Stale thumbnail',
      text: 'Gone',
      tour: {
        anchor: 'dock.other',
        action: 'click',
        thumbnail: {
          url: url('users/u/hotspot_images/1-b.png'),
          anchor: 'dock.old',
          w: 320,
          h: 140,
        },
      },
    },
    {
      id: 'c',
      label: 'Whole board',
      text: 'Legacy slide',
      imageIndex: 0,
      tour: { anchor: 'board.whole', action: 'observe' },
    },
  ],
} as unknown as GuidedLearningSet;

describe('public link parity', () => {
  it('fingerprints the same pictures on both sides', () => {
    for (const set of [webTour, liveTour])
      expect(pictureFingerprint(set)).toBe(serverFingerprint(set));
    expect(pictureFingerprint(webTour)).toContain(
      'web_tour_pictures/w1/a.png a:0.1235'
    );
  });

  it('draws web steps the way the function serves them', () => {
    const app = stepsFromWebTour(webTourSequenceOf(webTour));
    const served = publicTourOf('w1', webTour, BUCKET)?.tour.steps;
    expect(served).toEqual(app);
  });

  it('keeps Message steps and Site switch dividers the same on both sides', () => {
    const app = stepsFromWebTour(webTourSequenceOf(crossSite));
    const served = publicTourOf('x1', crossSite, BUCKET)?.tour.steps;
    expect(served).toEqual(app);
    expect(served?.map((s) => [s.id, !!s.message, s.continueOn])).toEqual([
      ['m1', true, undefined],
      ['a', false, undefined],
      ['m2', true, undefined],
      ['b', false, 'claude.ai'],
      ['c', false, undefined],
      ['m3', true, undefined],
    ]);
    expect(pictureFingerprint(crossSite)).toBe(serverFingerprint(crossSite));
  });

  it('keeps the divider when the endpoint skips a step with an unusable id', () => {
    const odd = {
      ...crossSite,
      steps: (crossSite.steps as { id: string }[]).map((s) =>
        s.id === 'b' ? { ...s, id: 'b.1' } : s
      ),
    } as unknown as GuidedLearningSet;
    const served = publicTourOf('x1', odd, BUCKET)?.tour.steps;
    expect(served?.map((s) => s.id)).toEqual(['m1', 'a', 'm2', 'c', 'm3']);
    expect(served?.find((s) => s.id === 'c')?.continueOn).toBe('claude.ai');
  });

  it('draws Live steps the way the function serves them', () => {
    const app = stepsFromLiveTour(liveTour).steps;
    const served = publicTourOf('l1', liveTour, BUCKET)?.tour.steps;
    expect(served).toEqual(app);
  });
});
