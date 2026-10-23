import { describe, expect, it } from 'vitest';
import type {
  GuidedLearningSet,
  GuidedLearningStep,
  WebTourBinding,
  WebTourCheckRun,
} from '@/types';
import { buildNameMatcher } from '@/components/widgets/GuidedLearning/components/recorder/redaction';
import {
  assertPublishable,
  checkPasses,
  confirmPictures,
  currentCheckResults,
  hideHits,
  hideStudentData,
  picturesNeedConfirm,
  publishBlockers,
  recordCheckResult,
  reviewEntries,
  setReviewField,
  startCheckRun,
  targetsSignature,
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

// A check run in which every step was found clearly.
const passed = <T extends { steps: GuidedLearningStep[] }>(
  set: T
): T & { webTourChecked: WebTourCheckRun } => ({
  ...set,
  webTourChecked: {
    by: 'u1',
    at: 1,
    sig: targetsSignature(set),
    results: Object.fromEntries(set.steps.map((s) => [s.id, 'found'])),
  },
});

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

  it('reviews and edits the heading, page title and stable attributes', () => {
    const s = step('a', {
      locator: {
        role: 'link',
        heading: 'Grades for Alice Nguyen',
        pageTitle: 'Gradebook',
        attrs: { ariaLabel: 'Open', href: '/students/1234567/grades' },
      },
    });
    const entries = reviewEntries(s, roster);
    expect(entries.map((e) => e.field).slice(4)).toEqual([
      'heading',
      'pageTitle',
      'attr:ariaLabel',
      'attr:href',
    ]);
    const heading = entries.find((e) => e.field === 'heading');
    if (!heading) throw new Error('no heading entry');
    expect(heading.hits[0].kind).toBe('roster-name');
    const href = entries.find((e) => e.field === 'attr:href');
    if (!href) throw new Error('no href entry');
    expect(hideHits(href)).toBe('/students/*/grades');
    let out = setReviewField(s, 'heading', hideHits(heading));
    out = setReviewField(out, 'attr:ariaLabel', undefined);
    expect(out.web?.locator).toMatchObject({
      heading: 'Grades for •••',
      attrs: { href: '/students/1234567/grades' },
    });
    out = setReviewField(out, 'attr:href', undefined);
    expect(out.web?.locator).not.toHaveProperty('attrs');
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
    expect(publishBlockers(passed(set), roster)).toEqual([]);
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
      { kind: 'unchecked' },
    ]);
  });

  it('passes a tour with no student data, and assertPublishable agrees', () => {
    const ok = passed({ steps: [step('a', {})] });
    expect(publishBlockers(ok, roster)).toEqual([]);
    expect(() => assertPublishable(ok, roster)).not.toThrow();
    expect(() =>
      assertPublishable(
        passed({ steps: [step('a', {}, { text: 'Find Alice' })] }),
        roster
      )
    ).toThrow(/student-data/);
  });

  it('blocks a tour whose title names a student', () => {
    expect(
      publishBlockers(
        passed({ title: 'Alice Nguyen grades', steps: [step('a', {})] }),
        roster
      )
    ).toEqual([{ kind: 'title-data' }]);
  });

  it('blocks until a check run found every step clearly', () => {
    const steps = [step('a', {}), step('b', {})];
    expect(publishBlockers({ steps }, roster)).toEqual([{ kind: 'unchecked' }]);
    expect(() => assertPublishable({ steps }, roster)).toThrow(/unchecked/);
    const run = passed({ steps });
    expect(publishBlockers(run, roster)).toEqual([]);
    const weak = {
      ...run,
      webTourChecked: {
        ...run.webTourChecked,
        results: { a: 'found' as const, b: 'weak' as const },
      },
    };
    expect(publishBlockers(weak, roster)).toEqual([{ kind: 'unchecked' }]);
    const partial = {
      ...run,
      webTourChecked: {
        ...run.webTourChecked,
        results: { a: 'found' as const },
      },
    };
    expect(checkPasses(partial)).toBe(false);
  });
});

describe('check signature', () => {
  const base = () => passed(tourOf([step('a', {}), step('b', {})]));
  const withStep = (
    set: GuidedLearningSet,
    id: string,
    patch: (
      s: GuidedLearningStep & { web?: WebTourBinding }
    ) => GuidedLearningStep
  ): GuidedLearningSet => ({
    ...set,
    steps: set.steps.map((s) => (s.id === id ? patch(s) : s)),
  });

  it('survives edits to text, labels, tips, notes, pictures and key order', () => {
    const set = base();
    const edited = withStep(
      { ...set, title: 'New title' },
      'a',
      (s) =>
        ({
          ...s,
          label: 'Renamed',
          text: 'A new tip',
          web: {
            ...(s.web as WebTourBinding),
            picture: { path: 'web_tour_pictures/t1/x.jpg', w: 1, h: 1 },
            note: 'For Claude',
          },
        }) as GuidedLearningStep
    );
    expect(checkPasses(edited)).toBe(true);
    // Firestore can hand map keys back in another order.
    const reordered = withStep(set, 'a', (s) => ({
      ...s,
      web: {
        ...(s.web as WebTourBinding),
        locator: { name: 'Grades', role: 'link' },
      },
    }));
    expect(checkPasses(reordered)).toBe(true);
  });

  it('expires on any change to what playback looks for', () => {
    const set = base();
    const changes: GuidedLearningSet[] = [
      withStep(set, 'a', (s) => ({
        ...s,
        web: {
          ...(s.web as WebTourBinding),
          locator: { role: 'button', name: 'Grades' },
        },
      })),
      withStep(set, 'a', (s) => setReviewField(s, 'css', 'div > a')),
      withStep(set, 'a', (s) => ({
        ...s,
        web: {
          ...(s.web as WebTourBinding),
          urlPattern: 'https://orono.schoology.com/home',
        },
      })),
      withStep(set, 'a', (s) => ({
        ...s,
        web: { ...(s.web as WebTourBinding), action: 'observe' },
      })),
      withStep(set, 'a', (s) => ({
        ...s,
        web: {
          ...(s.web as WebTourBinding),
          locator: {
            ...(s.web as WebTourBinding).locator,
            frames: [{ urlPattern: 'https://x.example/f', index: 0 }],
          },
        },
      })),
      { ...set, steps: [...set.steps].reverse() },
      { ...set, steps: set.steps.slice(1) },
      { ...set, steps: [...set.steps, step('c', {})] },
    ];
    for (const changed of changes) {
      expect(checkPasses(changed)).toBe(false);
      expect(currentCheckResults(changed)).toBeNull();
    }
  });

  it('records results only for the run they belong to', () => {
    const set = tourOf([step('a', {})]);
    const started = startCheckRun(set, 'u1');
    expect(started.webTourChecked?.results).toEqual({});
    const sig = started.webTourChecked?.sig ?? '';
    const found = recordCheckResult(started, sig, 'a', 'found');
    expect(checkPasses(found)).toBe(true);
    expect(recordCheckResult(found, 'old', 'a', 'none')).toBe(found);
    expect(recordCheckResult(found, sig, 'gone', 'none')).toBe(found);
    const later = recordCheckResult(found, sig, 'a', 'ambiguous');
    expect(later.webTourChecked?.results.a).toBe('ambiguous');
    expect(checkPasses(later)).toBe(false);
  });
});
