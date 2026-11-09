import type { TourMarkupShape, WebTourAction, WebTourFrame } from '@/types';
import type { WebLocatorClues } from './locate';
import { matchesUrlPattern } from './urlPattern';
import type { WebStepConditions } from '@/components/tours/web/extensionProtocol';
import {
  doneOnPage,
  doneWhenLost,
  skipsOnPage,
  skipsWhenMissing,
  waitsForDone,
} from './conditions';
import {
  backTarget,
  catchUp,
  enterRun,
  LOOKAHEAD_STEPS,
  matchPageAhead,
} from '@/components/tours/playbackEngine';

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
  /** When the step plays and when it is done (E6); absent = always, and done at the learner's action. */
  conditions?: WebStepConditions;
  /** Markup drawn over the step's picture (E5), shown with it by Show me where. */
  markup?: TourMarkupShape[];
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
  /** Steps a catch-up passed over (TOURS_10X.md P3); absent in records saved before it. */
  skipped?: string[];
  /** Steps left out because their showWhen didn't hold (E6), apart from catch-up's `skipped`. */
  conditionSkipped?: string[];
}

export type PlaybackEvent =
  | { type: 'page'; url: string }
  | { type: 'found'; match: FoundMatch }
  | { type: 'lost' }
  | { type: 'timeout' }
  | { type: 'acted' }
  /** The learner did step `index` (the current one or up to three after it) before the tour lit it (P2). */
  | { type: 'ahead'; index: number; url?: string }
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
  // Going forward onto a step its showWhen leaves out on this page: on to the next (E6).
  if (index >= state.index && skipsOnPage(step, url))
    return enterStep(conditionSkip(state, step.id), index + 1, url);
  return {
    ...enterRun(state, state.tour.steps, index),
    furthest: Math.max(state.furthest, index),
    status: url === null ? 'seeking' : pageStatus(step, url),
  };
}

/** Records a step a condition left out, once. */
const conditionSkip = (state: PlaybackState, id: string): PlaybackState =>
  state.conditionSkipped?.includes(id)
    ? state
    : { ...state, conditionSkipped: [...(state.conditionSkipped ?? []), id] };

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

/** A step whose action can take the learner to another page. */
const leadsAway = (s: PlaybackStep) => s.action !== 'observe';

/** Jumps past step `matched`, recording the steps between as skipped. */
function caughtUp(
  state: PlaybackState,
  matched: number,
  url: string | null
): PlaybackState {
  const run = catchUp(state, state.tour.steps, matched);
  // A step that plays only when its condition holds is optional: passed over, it is condition-skipped, not a hollow dot.
  const optional = new Set(
    state.tour.steps
      .slice(state.index, matched)
      .filter((st) => !!st.conditions?.showWhen)
      .map((st) => st.id)
  );
  let next: PlaybackState = {
    ...run,
    index: state.index,
    skipped: run.skipped.filter((id) => !optional.has(id)),
  };
  for (const id of optional) next = conditionSkip(next, id);
  return enterStep(next, run.index, url);
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
      // The address its doneWhen names finishes the step (E6).
      if (state.status !== 'wrong-page' && doneOnPage(step, event.url))
        return enterStep(state, state.index + 1, event.url);
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
      // A page a later step plays on: the learner got ahead, so the tour catches up (P2).
      const ahead = matchPageAhead(
        state.tour.steps,
        state.index,
        event.url,
        (s, url) => matchesUrlPattern(s.urlPattern, url),
        leadsAway,
        LOOKAHEAD_STEPS
      );
      if (ahead !== null) return caughtUp(state, ahead, event.url);
      return { ...state, status: pageStatus(step, event.url) };
    }
    case 'found':
      if (state.status === 'wrong-page') return state;
      return { ...state, status: 'shown', matched: record(state, event.match) };
    case 'lost':
      if (state.status !== 'shown') return state;
      // A step done when its target goes away (E6).
      if (doneWhenLost(step)) return enterStep(state, state.index + 1, null);
      return { ...state, status: 'seeking' };
    case 'timeout':
      if (state.status !== 'seeking') return state;
      // A step that plays only if its target shows up is left out, not shown as a picture (E6).
      if (skipsWhenMissing(step))
        return enterStep(conditionSkip(state, step.id), state.index + 1, null);
      return {
        ...state,
        status: 'fallback',
        matched: record(state, 'picture'),
      };
    case 'acted':
      // A step with a doneWhen waits for it, not for the learner's action (E6).
      if (
        state.status !== 'shown' ||
        step.action === 'observe' ||
        waitsForDone(step)
      )
        return state;
      return enterStep(state, state.index + 1, null);
    case 'ahead':
      if (
        event.index < state.index ||
        event.index > state.index + LOOKAHEAD_STEPS ||
        !state.tour.steps[event.index]
      )
        return state;
      return caughtUp(state, event.index, event.url ?? null);
    case 'next':
      return enterStep(state, state.index + 1, event.url ?? null);
    case 'back':
      if (state.index === 0 && !finished(state)) return state;
      // Back returns to a step catch-up passed over first (P3).
      return enterStep(
        { ...state, status: 'seeking' },
        finished(state) ? state.index : backTarget(state, state.tour.steps),
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
