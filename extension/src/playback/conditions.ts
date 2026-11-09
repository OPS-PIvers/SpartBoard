// Web step conditions at playback (TOURS_10X.md E6): pure predicates the reducer asks; no DOM here.
import type { WebStepConditions } from '@/components/tours/web/extensionProtocol';
import { matchesUrlPattern } from './urlPattern';

type Conditional = { conditions?: WebStepConditions };

/** Skip on arrival: the step plays only on an address this page doesn't match. */
export const skipsOnPage = (step: Conditional, url: string | null): boolean =>
  step.conditions?.showWhen?.kind === 'url' &&
  url !== null &&
  !matchesUrlPattern(step.conditions.showWhen.pattern, url);

/** Skip instead of falling back: the step plays only if its target shows up, and it hasn't. */
export const skipsWhenMissing = (step: Conditional): boolean =>
  step.conditions?.showWhen?.kind === 'target';

/** The step waits for its doneWhen, so the learner's action alone doesn't finish it. */
export const waitsForDone = (step: Conditional): boolean =>
  !!step.conditions?.doneWhen;

/** Done because the page reached the address doneWhen names. */
export const doneOnPage = (step: Conditional, url: string): boolean =>
  step.conditions?.doneWhen?.kind === 'url' &&
  matchesUrlPattern(step.conditions.doneWhen.pattern, url);

/** Done because its target went away. */
export const doneWhenLost = (step: Conditional): boolean =>
  step.conditions?.doneWhen?.kind === 'target';
