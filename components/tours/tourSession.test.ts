import { describe, expect, it } from 'vitest';
import { isDestructiveAnchor } from '@/config/tourAnchors';
import type { GuidedLearningSet } from '@/types';
import { liveTourStepsOf, teacherMustClick, tourWelcome } from './tourSession';

describe('liveTourStepsOf', () => {
  const set = (steps: object[]) =>
    ({ steps }) as unknown as Pick<GuidedLearningSet, 'steps'>;

  it('keeps plain steps in order when any step is anchored', () => {
    const steps = [
      { id: 'intro' },
      { id: 'a', tour: { anchor: 'sidebar.boards', action: 'click' } },
      { id: 'wrap' },
    ];
    expect(liveTourStepsOf(set(steps)).map((s) => s.id)).toEqual([
      'intro',
      'a',
      'wrap',
    ]);
  });

  it('is empty when nothing is anchored', () => {
    expect(liveTourStepsOf(set([{ id: 'intro' }]))).toEqual([]);
  });
});

describe('tourWelcome', () => {
  it('returns the trimmed message only when switched on and not blank', () => {
    expect(tourWelcome({ welcomeEnabled: true, welcomeMessage: ' Hi ' })).toBe(
      'Hi'
    );
    expect(tourWelcome({ welcomeEnabled: false, welcomeMessage: 'Hi' })).toBe(
      null
    );
    expect(tourWelcome({ welcomeEnabled: true, welcomeMessage: '  ' })).toBe(
      null
    );
    expect(tourWelcome({ welcomeEnabled: true })).toBe(null);
  });
});

describe('teacherMustClick', () => {
  it('defaults to true only for anchors registered as destructive', () => {
    expect(isDestructiveAnchor('widget.close')).toBe(true);
    expect(isDestructiveAnchor('sidebar.clear-board')).toBe(true);
    expect(isDestructiveAnchor('sidebar.boards')).toBe(false);
    expect(isDestructiveAnchor('dock.item:dice')).toBe(false);
    expect(isDestructiveAnchor('nope')).toBe(false);
    expect(teacherMustClick({ anchor: 'widget.close' })).toBe(true);
    expect(teacherMustClick({ anchor: 'sidebar.boards' })).toBe(false);
  });

  it('lets the step override the default', () => {
    expect(
      teacherMustClick({ anchor: 'widget.close', teacherMustClick: false })
    ).toBe(false);
    expect(
      teacherMustClick({ anchor: 'sidebar.boards', teacherMustClick: true })
    ).toBe(true);
  });
});
