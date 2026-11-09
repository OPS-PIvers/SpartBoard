import { describe, expect, it } from 'vitest';
import {
  reducePlayback,
  startPlayback,
  type PlaybackStep,
  type PlaybackTour,
} from './progress';
import { openedTour } from './openTour';

const step = (
  id: string,
  conditions?: PlaybackStep['conditions']
): PlaybackStep => ({
  id,
  title: id,
  text: '',
  urlPattern: 'https://a.example/*',
  frames: [],
  clues: { role: 'button', name: id },
  action: 'click',
  hasPicture: true,
  ...(conditions ? { conditions } : {}),
});

const tourOf = (steps: PlaybackStep[]): PlaybackTour => ({
  id: 't',
  title: 'T',
  startUrl: 'https://a.example/home',
  steps,
});

describe('step conditions at playback (E6)', () => {
  it('leaves out a step whose page condition does not hold, and records it apart from catch-up', () => {
    const s = startPlayback(
      tourOf([
        step('s1', {
          showWhen: { kind: 'url', pattern: 'https://a.example/admin/*' },
        }),
        step('s2'),
      ]),
      'https://a.example/home',
      0
    );
    expect(s.index).toBe(1);
    expect(s.conditionSkipped).toEqual(['s1']);
    expect(s.skipped ?? []).toEqual([]);
  });

  it('plays a step whose page condition holds', () => {
    const s = startPlayback(
      tourOf([
        step('s1', {
          showWhen: { kind: 'url', pattern: 'https://a.example/home' },
        }),
        step('s2'),
      ]),
      'https://a.example/home',
      0
    );
    expect(s.index).toBe(0);
  });

  it('leaves out a step shown only if its target appears, when it never does', () => {
    let s = startPlayback(
      tourOf([step('s1', { showWhen: { kind: 'target' } }), step('s2')]),
      'https://a.example/home',
      0
    );
    s = reducePlayback(s, { type: 'timeout' });
    expect(s.index).toBe(1);
    expect(s.status).toBe('seeking');
    expect(s.conditionSkipped).toEqual(['s1']);
    expect(s.matched.s1).toBeUndefined();
  });

  it('waits for doneWhen instead of the learner action', () => {
    let s = startPlayback(
      tourOf([
        step('s1', {
          doneWhen: { kind: 'url', pattern: 'https://a.example/done' },
        }),
        step('s2'),
      ]),
      'https://a.example/home',
      0
    );
    s = reducePlayback(s, { type: 'found', match: 'role' });
    s = reducePlayback(s, { type: 'acted' });
    expect(s.index).toBe(0);
    s = reducePlayback(s, { type: 'page', url: 'https://a.example/done' });
    expect(s.index).toBe(1);
  });

  it('moves on when the target goes away, for doneWhen target', () => {
    let s = startPlayback(
      tourOf([step('s1', { doneWhen: { kind: 'target' } }), step('s2')]),
      'https://a.example/home',
      0
    );
    s = reducePlayback(s, { type: 'found', match: 'role' });
    s = reducePlayback(s, { type: 'lost' });
    expect(s.index).toBe(1);
  });

  it('takes conditions the server sends beside the steps, and drops malformed ones', () => {
    const opened = openedTour('t', {
      version: 3,
      title: 'T',
      steps: [
        {
          id: 's1',
          web: {
            urlPattern: 'https://a.example/home',
            action: 'click',
            locator: { role: 'button', name: 'Go' },
          },
        },
        {
          id: 's2',
          web: {
            urlPattern: 'https://a.example/home',
            action: 'click',
            locator: { role: 'button', name: 'On' },
          },
        },
      ],
      conditions: {
        s1: { showWhen: { kind: 'target' } },
        s2: { doneWhen: { kind: 'url', pattern: 'javascript:x' } },
      },
    });
    const steps = opened?.start.tour.steps ?? [];
    expect(steps[0]?.conditions).toEqual({ showWhen: { kind: 'target' } });
    expect(steps[1]?.conditions).toBeUndefined();
  });
});
