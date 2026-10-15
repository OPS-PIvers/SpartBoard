import { describe, expect, it } from 'vitest';
import type { GuidedLearningSet } from '@/types';
import {
  buildTourContent,
  parsePublishedTour,
  tourPublishStatus,
} from './tourSnapshot';

const set = (over: Partial<GuidedLearningSet> = {}) =>
  ({
    id: 'set-1',
    title: 'Boards',
    mode: 'guided',
    imageUrls: ['https://i/1.png'],
    imagePaths: ['p/1.png'],
    steps: [
      {
        id: 's1',
        label: 'Open',
        xPct: 1,
        yPct: 1,
        imageIndex: 0,
        interactionType: 'tooltip',
        tour: { anchor: 'sidebar.boards', action: 'click' },
      },
    ],
    createdAt: 1,
    updatedAt: 2,
    ...over,
  }) as GuidedLearningSet;

// What Firestore hands back: key order not guaranteed, undefined dropped.
const stored = (s: GuidedLearningSet, publishedAt = 5) =>
  parsePublishedTour(s.id, {
    set: Object.fromEntries(Object.entries(buildTourContent(s)).reverse()),
    publishedAt,
    publishedBy: 'admin',
  });

describe('tourPublishStatus', () => {
  it('is Draft until something is published', () => {
    expect(tourPublishStatus(set(), null)).toBe('draft');
  });

  it('is Published when only bookkeeping fields changed since', () => {
    const published = stored(set());
    expect(
      tourPublishStatus(
        set({ updatedAt: 99, description: 'x', imagePaths: ['q'] }),
        published
      )
    ).toBe('published');
  });

  it('keeps notes for Claude and the playtest out of what teachers run', () => {
    const noted = set({
      tourReviewNote: { text: 'Shorter', by: 'a@x.org', at: 1 },
      tourPlaytest: { at: 1, by: 'a@x.org', fingerprint: 'f', steps: [] },
    });
    noted.steps[0].reviewNote = { text: 'Wrong button', by: 'a@x.org', at: 1 };
    const content = buildTourContent(noted);
    expect(content).not.toHaveProperty('tourReviewNote');
    expect(content).not.toHaveProperty('tourPlaytest');
    expect(content.steps[0]).not.toHaveProperty('reviewNote');
    expect(tourPublishStatus(noted, stored(set()))).toBe('published');
  });

  it('is Changes not published after a tour edit', () => {
    const published = stored(set());
    expect(tourPublishStatus(set({ watchPace: 'calm' }), published)).toBe(
      'changed'
    );
    expect(
      tourPublishStatus(set({ tourSetup: { widgets: ['clock'] } }), published)
    ).toBe('changed');
  });
});

describe('parsePublishedTour', () => {
  it('rejects docs without steps', () => {
    expect(parsePublishedTour('a', { set: {} })).toBeNull();
    expect(parsePublishedTour('a', null)).toBeNull();
  });

  it('pins the id to the doc id', () => {
    expect(stored(set({ id: 'other' }))?.set.id).toBe('other');
    expect(parsePublishedTour('doc-id', { set: { steps: [] } })?.set.id).toBe(
      'doc-id'
    );
  });
});
