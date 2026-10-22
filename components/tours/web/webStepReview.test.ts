import { describe, expect, it } from 'vitest';
import type {
  GuidedLearningSet,
  GuidedLearningStep,
  WebTourBinding,
} from '@/types';
import { buildNameMatcher } from '@/components/widgets/GuidedLearning/components/recorder/redaction';
import {
  assertPublishable,
  confirmPictures,
  hideHits,
  hideStudentData,
  picturesNeedConfirm,
  publishBlockers,
  reviewEntries,
  setReviewField,
} from './webStepReview';

const roster = buildNameMatcher([{ firstName: 'Alice', lastName: 'Nguyen' }]);

const step = (
  id: string,
  web: Partial<WebTourBinding> | null,
  extra: Partial<GuidedLearningStep> = {}
) =>
  ({
    id,
    xPct: 0,
    yPct: 0,
    interactionType: 'text-popover',
    label: 'Open grades',
    text: 'Press the Grades tab.',
    ...extra,
    ...(web
      ? {
          web: {
            urlPattern: 'https://orono.schoology.com/course/*/materials',
            action: 'click',
            locator: { role: 'link', name: 'Grades' },
            ...web,
          },
        }
      : {}),
  }) as GuidedLearningStep & { web?: WebTourBinding };

describe('reviewEntries', () => {
  it('lists every captured field with its hits', () => {
    const s = step('a', {
      locator: {
        role: 'link',
        name: 'Alice Nguyen',
        css: 'tr > td',
        frames: [{ urlPattern: 'https://x.example/f/1234567', index: 0 }],
      },
    });
    const entries = reviewEntries(s, roster);
    expect(entries.map((e) => e.field)).toEqual([
      'label',
      'text',
      'url',
      'role',
      'name',
      'css',
      'frame:0',
    ]);
    expect(entries.find((e) => e.field === 'name')?.hits[0].kind).toBe(
      'roster-name'
    );
    expect(entries.find((e) => e.field === 'frame:0')?.hits[0].kind).toBe(
      'id-number'
    );
  });
});

describe('hideHits and setReviewField', () => {
  it('hides names with the mark and address ids with a wildcard', () => {
    const s = step('a', {
      urlPattern: 'https://x.example/s/1234567',
      locator: { name: 'Grades for Alice Nguyen' },
    });
    const [, , url, name] = reviewEntries(s, roster);
    expect(hideHits(url)).toBe('https://x.example/s/*');
    expect(hideHits(name)).toBe('Grades for •••');
    const fixed = setReviewField(
      setReviewField(s, 'url', hideHits(url)),
      'name',
      hideHits(name)
    );
    expect(fixed.web?.urlPattern).toBe('https://x.example/s/*');
    expect(fixed.web?.locator.name).toBe('Grades for •••');
  });

  it('removes a locator clue', () => {
    const s = step('a', { locator: { name: 'Alice', text: 'x', css: 'a' } });
    const out = setReviewField(s, 'pageText', undefined);
    expect(out.web?.locator).toEqual({ name: 'Alice', css: 'a' });
  });
});

const pic = (path: string) => ({
  picture: { path: `web_tour_pictures/t1/${path}`, w: 1, h: 1 },
});
const tourOf = (steps: GuidedLearningStep[], title = 'Grades') =>
  ({
    id: 't1',
    title,
    imageUrls: [],
    mode: 'tour',
    surface: 'web',
    createdAt: 1,
    updatedAt: 1,
    steps,
  }) as GuidedLearningSet;

describe('picture confirm', () => {
  it('asks once, and again only when a picture changes', () => {
    const tour = tourOf([step('a', pic('a.jpg')), step('b', pic('b.jpg'))]);
    expect(picturesNeedConfirm(tour)).toBe(true);
    const confirmed = confirmPictures(tour, 'admin');
    expect(picturesNeedConfirm(confirmed)).toBe(false);
    // Reordering steps or editing text keeps the confirm.
    expect(
      picturesNeedConfirm({
        ...confirmed,
        steps: [...confirmed.steps]
          .reverse()
          .map((s) => ({ ...s, text: 'New' })),
      })
    ).toBe(false);
    expect(
      picturesNeedConfirm({
        ...confirmed,
        steps: [confirmed.steps[0], step('b', pic('c.jpg'))],
      })
    ).toBe(true);
  });

  it('never asks about a tour without pictures', () => {
    expect(picturesNeedConfirm(tourOf([step('a', {})]))).toBe(false);
  });
});

describe('hideStudentData', () => {
  it('hides student names in the title and steps and lists them', () => {
    const tour = tourOf(
      [
        step(
          'a',
          { locator: { name: 'Nguyen, Alice' } },
          { text: 'Find Alice Nguyen' }
        ),
        step('b', {}),
      ],
      'Alice Nguyen grades'
    );
    const { set, hidden } = hideStudentData(tour, roster);
    expect(hidden.map((h) => [h.step, h.field])).toEqual([
      [null, 'label'],
      [0, 'text'],
      [0, 'name'],
    ]);
    expect(set.title).not.toContain('Alice');
    expect(publishBlockers(set, roster)).toEqual([]);
  });

  it('returns the same set when nothing needs hiding', () => {
    const tour = tourOf([step('a', {})]);
    expect(hideStudentData(tour, roster)).toEqual({ set: tour, hidden: [] });
  });
});

describe('publishBlockers', () => {
  it('needs steps, web bindings and no student data', () => {
    expect(publishBlockers({ steps: [] }, roster)).toEqual([
      { kind: 'no-steps' },
    ]);
    const bad = step('b', { locator: { name: 'Nguyen, Alice' } });
    expect(publishBlockers({ steps: [step('a', null), bad] }, roster)).toEqual([
      { kind: 'not-web', stepId: 'a' },
      { kind: 'student-data', stepId: 'b', field: 'name' },
    ]);
  });

  it('passes a tour with no student data, and assertPublishable agrees', () => {
    const ok = { steps: [step('a', {})] };
    expect(publishBlockers(ok, roster)).toEqual([]);
    expect(() => assertPublishable(ok, roster)).not.toThrow();
    expect(() =>
      assertPublishable(
        { steps: [step('a', {}, { text: 'Find Alice' })] },
        roster
      )
    ).toThrow(/student-data/);
  });

  it('blocks a tour whose title names a student', () => {
    expect(
      publishBlockers(
        { title: 'Alice Nguyen grades', steps: [step('a', {})] },
        roster
      )
    ).toEqual([{ kind: 'title-data' }]);
  });
});
