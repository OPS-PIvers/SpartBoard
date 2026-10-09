import { describe, expect, it } from 'vitest';
import { isDestructiveAnchor, isPersistsAnchor } from '@/config/tourAnchors';
import type { GuidedLearningSet } from '@/types';
import {
  autopilotGate,
  liveTourStepsOf,
  replayGate,
  resolveTourAutopilotPolicy,
  teacherMustClick,
  tourWelcome,
} from './tourSession';

const PERSISTS_ID = 'plc-edit.send-invite';

describe('liveTourStepsOf', () => {
  const set = (steps: object[], mode = 'structured') =>
    ({ steps, mode }) as unknown as Pick<GuidedLearningSet, 'mode' | 'steps'>;

  it('keeps plain steps in order in a tour-mode set', () => {
    const steps = [
      { id: 'intro' },
      { id: 'a', tour: { anchor: 'sidebar.boards', action: 'click' } },
      { id: 'wrap' },
    ];
    expect(liveTourStepsOf(set(steps, 'tour')).map((s) => s.id)).toEqual([
      'intro',
      'a',
      'wrap',
    ]);
  });

  it('is empty for a set that is not a live tour, even with an anchored step', () => {
    expect(liveTourStepsOf(set([{ id: 'intro' }]))).toEqual([]);
    expect(
      liveTourStepsOf(
        set([{ id: 'a', tour: { anchor: 'sidebar.boards', action: 'click' } }])
      )
    ).toEqual([]);
  });

  it('plays every step of a tour-mode set, even with nothing anchored', () => {
    expect(liveTourStepsOf(set([{ id: 'intro' }], 'tour'))).toHaveLength(1);
  });

  it('plays a whole-board step as a plain card', () => {
    const steps = [
      { id: 'intro', tour: { anchor: 'board.whole', action: 'observe' } },
      { id: 'a', tour: { anchor: 'sidebar.boards', action: 'click' } },
    ];
    const run = liveTourStepsOf(set(steps, 'tour'));
    expect(run[0].tour).toBeUndefined();
    expect(run[1].tour?.anchor).toBe('sidebar.boards');
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
  it('flags destructive and persists anchors in the registry', () => {
    expect(isDestructiveAnchor('widget.close')).toBe(true);
    expect(isDestructiveAnchor('sidebar.clear-board')).toBe(true);
    expect(isDestructiveAnchor('sidebar.boards')).toBe(false);
    expect(isDestructiveAnchor('dock.item:dice')).toBe(false);
    expect(isDestructiveAnchor('nope')).toBe(false);
    expect(isPersistsAnchor('nope')).toBe(false);
    expect(isPersistsAnchor('dock.item:dice')).toBe(false);
    expect(isPersistsAnchor(PERSISTS_ID)).toBe(true);
    expect(isDestructiveAnchor(PERSISTS_ID)).toBe(false);
  });

  it('destructive-only blocks destructive anchors and fallback-only steps', () => {
    const p = 'destructive-only';
    expect(teacherMustClick({ anchor: 'widget.close' }, p)).toBe(true);
    expect(teacherMustClick({ anchor: 'sidebar.boards' }, p)).toBe(false);
    expect(teacherMustClick({ anchor: '' }, p)).toBe(true);
    expect(teacherMustClick({ anchor: 'not.registered' }, p)).toBe(true);
  });

  it('destructive-only lets the step override the default', () => {
    const p = 'destructive-only';
    expect(
      teacherMustClick({ anchor: 'widget.close', teacherMustClick: false }, p)
    ).toBe(false);
    expect(
      teacherMustClick({ anchor: 'sidebar.boards', teacherMustClick: true }, p)
    ).toBe(true);
  });

  it('tour-safe also blocks persists anchors, whatever the step says', () => {
    const p = 'tour-safe';
    const persists = PERSISTS_ID;
    expect(teacherMustClick({ anchor: persists }, p)).toBe(true);
    expect(
      teacherMustClick({ anchor: persists, teacherMustClick: false }, p)
    ).toBe(true);
    expect(
      teacherMustClick({ anchor: 'widget.close', teacherMustClick: false }, p)
    ).toBe(true);
    expect(teacherMustClick({ anchor: 'sidebar.boards' }, p)).toBe(false);
    expect(teacherMustClick({ anchor: '' }, p)).toBe(true);
    expect(
      teacherMustClick({ anchor: 'sidebar.boards', teacherMustClick: true }, p)
    ).toBe(true);
  });

  it('confirm asks before destructive and persists anchors and blocks nothing else', () => {
    const p = 'confirm';
    expect(autopilotGate({ anchor: 'widget.close' }, p)).toBe('confirm');
    expect(autopilotGate({ anchor: PERSISTS_ID }, p)).toBe('confirm');
    expect(
      autopilotGate({ anchor: PERSISTS_ID, teacherMustClick: false }, p)
    ).toBe('confirm');
    expect(autopilotGate({ anchor: 'sidebar.boards' }, p)).toBe('perform');
    expect(
      autopilotGate({ anchor: 'sidebar.boards', teacherMustClick: true }, p)
    ).toBe('teacher');
    expect(autopilotGate({ anchor: '' }, p)).toBe('teacher');
    expect(teacherMustClick({ anchor: 'widget.close' }, p)).toBe(false);
  });
});

describe('replayGate', () => {
  it('clicks safe steps whatever the policy', () => {
    expect(replayGate({ anchor: 'sidebar.boards' }, 'tour-safe')).toBe(
      'perform'
    );
    expect(replayGate({ anchor: 'not.registered' }, 'tour-safe')).toBe(
      'perform'
    );
    expect(
      replayGate(
        { anchor: 'sidebar.boards', teacherMustClick: true },
        'tour-safe'
      )
    ).toBe('perform');
  });

  it('never performs destructive or persists steps on its own', () => {
    for (const p of ['tour-safe', 'destructive-only', 'confirm'] as const) {
      for (const binding of [
        { anchor: 'widget.close' },
        { anchor: 'classes.delete-roster' },
        { anchor: PERSISTS_ID },
        { anchor: 'widget.close', teacherMustClick: false },
      ]) {
        expect(replayGate(binding, p)).not.toBe('perform');
      }
    }
    expect(replayGate({ anchor: PERSISTS_ID }, 'tour-safe')).toBe('teacher');
    expect(replayGate({ anchor: PERSISTS_ID }, 'confirm')).toBe('confirm');
    expect(replayGate({ anchor: PERSISTS_ID }, 'destructive-only')).toBe(
      'confirm'
    );
  });
});

describe('resolveTourAutopilotPolicy', () => {
  const gl = (config?: Record<string, unknown>) => [
    { widgetType: 'guided-learning' as const, config },
  ];

  it('defaults to tour-safe', () => {
    expect(resolveTourAutopilotPolicy()).toBe('tour-safe');
    expect(resolveTourAutopilotPolicy([])).toBe('tour-safe');
    expect(resolveTourAutopilotPolicy(gl())).toBe('tour-safe');
    expect(resolveTourAutopilotPolicy(gl({}))).toBe('tour-safe');
  });

  it('reads the saved policy from the Guided Learning permission', () => {
    expect(
      resolveTourAutopilotPolicy(gl({ tourAutopilotPolicy: 'confirm' }))
    ).toBe('confirm');
    expect(
      resolveTourAutopilotPolicy(
        gl({ tourAutopilotPolicy: 'destructive-only' })
      )
    ).toBe('destructive-only');
  });

  it('ignores unknown values and other widgets', () => {
    expect(
      resolveTourAutopilotPolicy(gl({ tourAutopilotPolicy: 'anything' }))
    ).toBe('tour-safe');
    expect(
      resolveTourAutopilotPolicy([
        { widgetType: 'quiz', config: { tourAutopilotPolicy: 'confirm' } },
      ])
    ).toBe('tour-safe');
  });
});
