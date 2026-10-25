import { describe, expect, it } from 'vitest';
import {
  missedSteps,
  reducePlayback,
  startPlayback,
  type PlaybackState,
  type PlaybackStep,
  type PlaybackTour,
} from './progress';

const step = (
  id: string,
  urlPattern: string,
  action: PlaybackStep['action'] = 'click'
): PlaybackStep => ({
  id,
  title: id,
  text: '',
  urlPattern,
  frames: [],
  clues: { role: 'button', name: id },
  action,
  hasPicture: true,
});

const tour: PlaybackTour = {
  id: 't',
  title: 'T',
  startUrl: 'https://a.example/home',
  steps: [
    step('s1', 'https://a.example/home'),
    step('s2', 'https://a.example/course/*'),
    step('s3', 'https://a.example/course/*', 'observe'),
  ],
};

describe('playback progress', () => {
  it('waits on the wrong page and seeks on the right one', () => {
    let s = startPlayback(tour, 'https://a.example/login', 0);
    expect(s.status).toBe('wrong-page');
    expect(reducePlayback(s, { type: 'found', match: 'role' }).status).toBe(
      'wrong-page'
    );
    s = reducePlayback(s, { type: 'page', url: 'https://a.example/home' });
    expect(s.status).toBe('seeking');
  });

  it('advances on the learner action for click steps, not observe steps', () => {
    let s = startPlayback(tour, 'https://a.example/home', 0);
    s = reducePlayback(s, { type: 'found', match: 'role' });
    s = reducePlayback(s, { type: 'acted' });
    expect(s.index).toBe(1);
    expect(s.status).toBe('seeking');
    s = reducePlayback(s, { type: 'page', url: 'https://a.example/course/9' });
    s = reducePlayback(s, { type: 'found', match: 'score' });
    s = reducePlayback(s, { type: 'acted' });
    s = reducePlayback(s, { type: 'found', match: 'role' });
    expect(s.index).toBe(2);
    expect(reducePlayback(s, { type: 'acted' }).index).toBe(2);
    s = reducePlayback(s, { type: 'next' });
    expect(s.status).toBe('done');
    expect(s.matched).toEqual({ s1: 'role', s2: 'score', s3: 'role' });
  });

  it('moves on when a click navigates to the next step page before the action is reported', () => {
    let s = startPlayback(tour, 'https://a.example/home', 0);
    s = reducePlayback(s, { type: 'found', match: 'role' });
    s = reducePlayback(s, { type: 'page', url: 'https://a.example/course/4' });
    expect(s.index).toBe(1);
    expect(s.status).toBe('seeking');
  });

  it('shows the picture after a timeout and records it as a miss until a clue finds it', () => {
    let s = startPlayback(tour, 'https://a.example/home', 0);
    s = reducePlayback(s, { type: 'timeout' });
    expect(s.status).toBe('fallback');
    expect(missedSteps(s)).toEqual(['s1']);
    s = reducePlayback(s, { type: 'found', match: 'role' });
    expect(s.status).toBe('shown');
    expect(missedSteps(s)).toEqual([]);
  });

  it('records how every step was found, however long the tour', () => {
    const long: PlaybackTour = {
      ...tour,
      steps: Array.from({ length: 60 }, (_, i) =>
        step(`s${i}`, 'https://a.example/home')
      ),
    };
    let s = startPlayback(long, 'https://a.example/home', 0);
    for (let i = 0; i < 60; i++) {
      s = reducePlayback(s, { type: 'found', match: 'score' });
      s = reducePlayback(s, { type: 'acted' });
    }
    expect(s.matched.s59).toBe('score');
  });

  it('goes back, and back from done reopens the last step', () => {
    let s = startPlayback(tour, 'https://a.example/home', 0);
    expect(reducePlayback(s, { type: 'back' }).index).toBe(0);
    s = reducePlayback(s, { type: 'next' });
    s = reducePlayback(s, { type: 'next' });
    s = reducePlayback(s, { type: 'next' });
    expect(s.status).toBe('done');
    s = reducePlayback(s, { type: 'back' });
    expect(s.status).toBe('seeking');
    expect(s.index).toBe(2);
    expect(s.furthest).toBe(2);
  });

  it('ignores events after exit', () => {
    let s = startPlayback(tour, 'https://a.example/home', 0);
    s = reducePlayback(s, { type: 'exit' });
    expect(reducePlayback(s, { type: 'next' })).toBe(s);
  });

  it('stays armed through sign-in pages and seeks once the start page loads', () => {
    let s: PlaybackState = {
      ...startPlayback(tour, 'https://a.example/home', 0),
      status: 'armed',
    };
    for (const url of [
      'https://launchpad.classlink.com/oauth',
      'https://accounts.google.com/signin',
      'https://a.example/dashboard',
    ]) {
      s = reducePlayback(s, { type: 'page', url });
      expect(s.status).toBe('armed');
    }
    for (const event of [
      { type: 'found', match: 'role' },
      { type: 'timeout' },
      { type: 'next' },
      { type: 'acted' },
    ] as const) {
      expect(reducePlayback(s, event).status).toBe('armed');
    }
    s = reducePlayback(s, { type: 'page', url: 'https://a.example/home' });
    expect(s.status).toBe('seeking');
    expect(s.index).toBe(0);
  });

  it('lets an armed tour be exited', () => {
    const s: PlaybackState = {
      ...startPlayback(tour, 'https://a.example/home', 0),
      status: 'armed',
    };
    expect(reducePlayback(s, { type: 'exit' }).status).toBe('exited');
  });
});
