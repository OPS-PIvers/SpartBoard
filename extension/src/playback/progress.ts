import type { LocatorClue, WebLocatorClues } from './locate';
import { matchesUrlPattern } from './urlPattern';

export type WebStepAction = 'observe' | 'click' | 'type' | 'select';

export interface PlaybackStep {
  id: string;
  title: string;
  text: string;
  urlPattern: string;
  /** Frames around the target from the top document down; empty means the top document. */
  frames: { urlPattern: string; index: number }[];
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

export type PlaybackStatus =
  | 'wrong-page'
  | 'seeking'
  | 'shown'
  | 'fallback'
  | 'done'
  | 'exited';

export interface PlaybackState {
  tour: PlaybackTour;
  index: number;
  furthest: number;
  status: PlaybackStatus;
  /** Which clue found each step, or 'picture' when only the picture was shown. */
  matched: Record<string, LocatorClue | 'picture'>;
  startedAt: number;
}

export type PlaybackEvent =
  | { type: 'page'; url: string }
  | { type: 'found'; clue: LocatorClue }
  | { type: 'lost' }
  | { type: 'timeout' }
  | { type: 'acted' }
  | { type: 'next' }
  | { type: 'back' }
  | { type: 'exit' };

const MAX_MATCHED = 50;

export function startPlayback(
  tour: PlaybackTour,
  url: string,
  now: number
): PlaybackState {
  return enterStep(
    { tour, index: 0, furthest: 0, status: 'seeking', matched: {}, startedAt: now },
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
  how: LocatorClue | 'picture'
): PlaybackState['matched'] {
  const id = state.tour.steps[state.index]?.id;
  if (!id) return state.matched;
  // A clue found later beats an earlier picture-only miss for the same step.
  if (state.matched[id] && how === 'picture') return state.matched;
  if (!(id in state.matched) && Object.keys(state.matched).length >= MAX_MATCHED) {
    return state.matched;
  }
  return { ...state.matched, [id]: how };
}

const finished = (s: PlaybackState) => s.status === 'done' || s.status === 'exited';

export function reducePlayback(
  state: PlaybackState,
  event: PlaybackEvent
): PlaybackState {
  if (finished(state) && event.type !== 'back') return state;
  const step = state.tour.steps[state.index];
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
      return { ...state, status: 'shown', matched: record(state, event.clue) };
    case 'lost':
      return state.status === 'shown' ? { ...state, status: 'seeking' } : state;
    case 'timeout':
      if (state.status !== 'seeking') return state;
      return { ...state, status: 'fallback', matched: record(state, 'picture') };
    case 'acted':
      if (state.status !== 'shown' || step.action === 'observe') return state;
      return enterStep(state, state.index + 1, null);
    case 'next':
      return enterStep(state, state.index + 1, null);
    case 'back':
      if (state.index === 0 && !finished(state)) return state;
      return enterStep(
        { ...state, status: 'seeking' },
        finished(state) ? state.index : state.index - 1,
        null
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
