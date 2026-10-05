import { describe, expect, it } from 'vitest';
import type { WidgetType } from '@/types';
import { WIDGET_DEFAULTS } from '@/config/widgetDefaults';
import {
  FIXTURE_NAMES,
  STRESS,
  STRESS_ROSTER,
  UNSUPPORTED_FIXTURES,
  WIDGET_FIXTURES,
} from '@/components/dev/widgetGrader/fixtures';
import { parseHarnessParams } from '@/components/dev/widgetGrader/harnessParams';

// Widget types still waiting on fixtures; the S5 batches shrink this to empty.
const PENDING_FIXTURES: WidgetType[] = [
  // S5c
  'car-rider-pro',
  'blending-board',
  'music',
  'specialist-schedule',
  'graphic-organizer',
  'concept-web',
  'reveal-grid',
  'numberLine',
  'syntax-framer',
  'hotspot-image',
  'starter-pack',
  'video-activity',
  'guided-learning',
  // S5d
  'custom-widget',
  'soundboard',
  'url',
  'activity-wall',
  'first-5',
  'work-symbols',
  'blooms-taxonomy',
  'blooms-detail',
  'need-do-put-then',
  'stations',
  'flashcards',
  'projects',
  'review',
  'routineGuide',
];

const ALL_TYPES = Object.keys(WIDGET_DEFAULTS) as WidgetType[];

describe('widget grader fixtures', () => {
  it('covers every widget type with fixtures, an unsupported reason, or a pending entry', () => {
    const missing = ALL_TYPES.filter(
      (t) =>
        !WIDGET_FIXTURES[t] &&
        !UNSUPPORTED_FIXTURES[t] &&
        !PENDING_FIXTURES.includes(t)
    );
    expect(missing).toEqual([]);
  });

  it('lists each type in exactly one place', () => {
    const done = ALL_TYPES.filter(
      (t) => WIDGET_FIXTURES[t] ?? UNSUPPORTED_FIXTURES[t]
    );
    expect(done.filter((t) => PENDING_FIXTURES.includes(t))).toEqual([]);
    expect(PENDING_FIXTURES.filter((t) => !ALL_TYPES.includes(t))).toEqual([]);
    expect(new Set(PENDING_FIXTURES).size).toBe(PENDING_FIXTURES.length);
  });

  it.each(Object.entries(WIDGET_FIXTURES))(
    '%s has all three fixtures',
    (_type, set) => {
      expect(Object.keys(set ?? {}).sort()).toEqual([...FIXTURE_NAMES].sort());
    }
  );

  it('stress roster is 35 students with unique ids', () => {
    expect(STRESS_ROSTER.students).toHaveLength(STRESS.rosterSize);
    expect(new Set(STRESS_ROSTER.students.map((s) => s.id)).size).toBe(
      STRESS.rosterSize
    );
  });
});

describe('parseHarnessParams', () => {
  it('defaults size to the widget default and fixture to typical', () => {
    const result = parseHarnessParams('?type=clock');
    expect(result).toEqual({
      ok: true,
      params: {
        type: 'clock',
        w: WIDGET_DEFAULTS.clock.w,
        h: WIDGET_DEFAULTS.clock.h,
        fixture: 'typical',
        maximized: false,
        count: 1,
        state: null,
        selected: false,
        settingsOpen: false,
      },
    });
  });

  it('reads every option', () => {
    const result = parseHarnessParams(
      '?type=random&w=1400&h=900&fixture=stress&maximized=1&count=2&state=noRoster&selected=1&settings=open'
    );
    expect(result.ok && result.params).toMatchObject({
      w: 1400,
      h: 900,
      fixture: 'stress',
      maximized: true,
      count: 2,
      state: 'noRoster',
      selected: true,
      settingsOpen: true,
    });
  });

  it.each([
    '?type=nope',
    '?type=clock&fixture=huge',
    '?type=clock&state=asleep',
  ])('rejects %s', (search) => {
    expect(parseHarnessParams(search).ok).toBe(false);
  });
});
