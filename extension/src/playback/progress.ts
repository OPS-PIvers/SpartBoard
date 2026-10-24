import type { WebTourAction, WebTourFrame } from '@/types';
import type { WebLocatorClues } from './locate';
import { matchesUrlPattern } from './urlPattern';

export type WebStepAction = WebTourAction;

/** How a step was found, as the page reads it: `role` a clear match, `score` a weak one (C2). */
export type FoundMatch = 'role' | 'score';

export interface PlaybackStep {
  id: string;
  title: string;
  text: string;
  urlPattern: string;
  /** Frames around the target from the top document down; empty means the top document. */
  frames: WebTourFrame[];
  clues: WebLocatorClues;
  action: WebStepAction;
  hasPicture: boolean;
}

export interface PlaybackTour {
  id: string;
  title: string;
  startUrl: string;
  steps: PlaybackStep[];
}

/** `armed`: started but not yet on the start step's page, e.g. while the learner signs in (WEB_TOURS_HELP_PANEL.md H1). */
export type PlaybackStatus =
  'armed' | 'wrong-page' | 'seeking' | 'shown' | 'fallback' | 'done' | 'exited';

export interface PlaybackState {
  tour: PlaybackTour;
  index: number;
  furthest: number;
  status: PlaybackStatus;
  /** How each step was found, or 'picture' when only the picture was shown. */
  matched: Record<string, FoundMatch | 'picture'>;
  startedAt: number;
}

export type PlaybackEvent =
  | { type: 'page'; url: string }
  | { type: 'found'; match: FoundMatch }
  | { type: 'lost' }
  | { type: 'timeout' }
  | { type: 'acted' }
  | { type: 'next'; url?: string }
  | { type: 'back'; url?: string }
  | { type: 'exit' };

export function startPlayback(
  tour: PlaybackTour,
  url: string,
  now: number
): PlaybackState {
  return enterStep(
    {
      tour,
      index: 0,
      furthest: 0,
      status: 'seeking',
      matched: {},
      startedAt: now,
    },
    0,
    url
  );
}

const pageStatus = (step: PlaybackStep | undefined, url: string) =>
  step && matchesUrlPattern(step.urlPattern, url) ? 'seeking' : 'wrong-page';

function enterStep(
  state: PlaybackState,
  index: number,
  url: string | null
): PlaybackState {
  if (index >= state.tour.steps.length) {
    return { ...state, index: state.tour.steps.length - 1, status: 'done' };
  }
  const step = state.tour.steps[index];
  return {
    ...state,
    index,
    furthest: Math.max(state.furthest, index),
    status: url === null ? 'seeking' : pageStatus(step, url),
  };
}

function record(
  state: PlaybackState,
  how: FoundMatch | 'picture'
): PlaybackState['matched'] {
  const id = state.tour.steps[state.index]?.id;
  if (!id) return state.matched;
  // A clue found later beats an earlier picture-only miss for the same step.
  if (state.matched[id] && how === 'picture') return state.matched;
  return { ...state.matched, [id]: how };
}

const finished = (s: PlaybackState) =>
  s.status === 'done' || s.status === 'exited';

export function reducePlayback(
  state: PlaybackState,
  event: PlaybackEvent
): PlaybackState {
  if (state.status === 'exited') return state;
  if (
    state.status === 'done' &&
    event.type !== 'back' &&
    event.type !== 'exit'
  ) {
    return state;
  }
  const step = state.tour.steps[state.index];
  if (state.status === 'armed') {
    // Sign-in, SSO and MFA pages are ignored until the start step's page loads.
    if (event.type === 'exit') return { ...state, status: 'exited' };
    if (event.type === 'page' && matchesUrlPattern(step.urlPattern, event.url))
      return { ...state, status: 'seeking' };
    return state;
  }
  switch (event.type) {
    case 'page': {
      if (state.status === 'shown' || state.status === 'fallback') {
        // The learner's action moved them to the next step's page.
        const next = state.tour.steps[state.index + 1];
        if (
          next &&
          !matchesUrlPattern(step.urlPattern, event.url) &&
          matchesUrlPattern(next.urlPattern, event.url) &&
          step.action !== 'observe'
        ) {
          return enterStep(state, state.index + 1, event.url);
        }
      }
      return { ...state, status: pageStatus(step, event.url) };
    }
    case 'found':
      if (state.status === 'wrong-page') return state;
      return { ...state, status: 'shown', matched: record(state, event.match) };
    case 'lost':
      return state.status === 'shown' ? { ...state, status: 'seeking' } : state;
    case 'timeout':
      if (state.status !== 'seeking') return state;
      return {
        ...state,
        status: 'fallback',
        matched: record(state, 'picture'),
      };
    case 'acted':
      if (state.status !== 'shown' || step.action === 'observe') return state;
      return enterStep(state, state.index + 1, null);
    case 'next':
      return enterStep(state, state.index + 1, event.url ?? null);
    case 'back':
      if (state.index === 0 && !finished(state)) return state;
      return enterStep(
        { ...state, status: 'seeking' },
        finished(state) ? state.index : state.index - 1,
        event.url ?? null
      );
    case 'exit':
      return { ...state, status: 'exited' };
  }
}

/** Steps whose target was never found by any clue, for the run's misses list. */
export const missedSteps = (state: PlaybackState): string[] =>
  Object.entries(state.matched)
    .filter(([, how]) => how === 'picture')
    .map(([id]) => id);
