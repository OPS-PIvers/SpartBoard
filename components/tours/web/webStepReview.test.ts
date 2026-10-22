import { describe, expect, it } from 'vitest';
import type { GuidedLearningStep, WebTourBinding } from '@/types';
import { buildNameMatcher } from '@/components/widgets/GuidedLearning/components/recorder/redaction';
import {
  assertPublishable,
  hideHits,
  isStepChecked,
  markStepChecked,
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

describe('student-data check', () => {
  it('stops covering a step once it changes', () => {
    const checked = markStepChecked(step('a', {}), 'admin');
    expect(isStepChecked(checked)).toBe(true);
    expect(isStepChecked({ ...checked, text: 'New words' })).toBe(false);
    expect(isStepChecked(setReviewField(checked, 'css', 'div > a'))).toBe(
      false
    );
  });

  it('survives a stored copy that reorders the locator keys', () => {
    const checked = markStepChecked(
      step('a', {
        locator: {
          role: 'link',
          name: 'Courses',
          box: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
        },
      }),
      'admin'
    );
    const stored = {
      ...checked,
      web: {
        ...(checked.web as WebTourBinding),
        locator: {
          box: { h: 0.4, w: 0.3, x: 0.1, y: 0.2 },
          name: 'Courses',
          role: 'link',
        },
      },
    };
    expect(isStepChecked(stored)).toBe(true);
  });
});

describe('publishBlockers', () => {
  it('needs steps, web bindings, no student data and a tick on every step', () => {
    expect(publishBlockers({ steps: [] }, roster)).toEqual([
      { kind: 'no-steps' },
    ]);
    const bad = step('b', { locator: { name: 'Nguyen, Alice' } });
    expect(
      publishBlockers(
        { steps: [step('a', null), markStepChecked(bad, 'u')] },
        roster
      )
    ).toEqual([
      { kind: 'not-web', stepId: 'a' },
      { kind: 'student-data', stepId: 'b', field: 'name' },
    ]);
  });

  it('passes a checked tour with no student data, and assertPublishable agrees', () => {
    const ok = { steps: [markStepChecked(step('a', {}), 'u')] };
    expect(publishBlockers(ok, roster)).toEqual([]);
    expect(() => assertPublishable(ok, roster)).not.toThrow();
    expect(() => assertPublishable({ steps: [step('a', {})] }, roster)).toThrow(
      /unchecked/
    );
  });

  it('blocks a tour whose title names a student', () => {
    const s = markStepChecked(step('a', {}), 'u');
    expect(
      publishBlockers({ title: 'Alice Nguyen grades', steps: [s] }, roster)
    ).toEqual([{ kind: 'title-data' }]);
  });

  it('blocks a step whose tip names a student even when ticked', () => {
    const s = markStepChecked(
      step('a', {}, { text: 'Find Alice in the list' }),
      'u'
    );
    expect(publishBlockers({ steps: [s] }, roster)).toEqual([
      { kind: 'student-data', stepId: 'a', field: 'text' },
    ]);
  });
});
