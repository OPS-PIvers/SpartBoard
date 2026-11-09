import type { TourPublishStatus } from '@/components/tours/tourSnapshot';

export type TourKind = 'live' | 'web';

/** What the header's one main button does now. */
export type TourMainState = 'write' | 'check' | 'publish' | 'published';

/** The one thing between the draft and Publish, shown on the status line. */
export type TourBlocker =
  | { kind: 'no-steps' }
  | { kind: 'needs-text'; count: number }
  | { kind: 'check-needed' }
  | { kind: 'checking' }
  | { kind: 'other'; label: string };

export interface TourMainInput {
  kind: TourKind;
  stepCount: number;
  /** Steps with neither a title nor a tip. */
  stepsWithoutText: number;
  /** null while the published copy is loading. */
  publish: TourPublishStatus | null;
  /** Web: targets changed since the last passing check. Live: playtest notes are open. */
  checkNeeded: boolean;
  /** A check is running now. */
  checking?: boolean;
  /** Whether this browser can run the check (web needs the extension). */
  canCheck?: boolean;
  /** Anything else that stops Publish, e.g. student data in a step. */
  other?: string | null;
  /** A publish or save is in flight. */
  busy?: boolean;
}

export interface TourMainAction {
  state: TourMainState;
  disabled: boolean;
  blocker: TourBlocker | null;
}

/** True when a step has nothing for the learner to read. */
export const stepNeedsText = (step: {
  label?: string;
  text?: string;
}): boolean => !step.label?.trim() && !step.text?.trim();

/** The header's main button: Write text, then Check tour, then Publish, then Published. */
export function tourMainAction(input: TourMainInput): TourMainAction {
  const busy = !!input.busy;
  if (input.publish === 'published')
    return { state: 'published', disabled: true, blocker: null };
  if (input.stepCount === 0)
    return { state: 'publish', disabled: true, blocker: { kind: 'no-steps' } };
  if (input.stepsWithoutText > 0)
    return {
      state: 'write',
      disabled: busy,
      blocker: { kind: 'needs-text', count: input.stepsWithoutText },
    };
  if (input.checkNeeded) {
    const checking = !!input.checking;
    return {
      state: 'check',
      disabled: busy || checking || input.canCheck === false,
      blocker: checking ? { kind: 'checking' } : { kind: 'check-needed' },
    };
  }
  if (input.other)
    return {
      state: 'publish',
      disabled: true,
      blocker: { kind: 'other', label: input.other },
    };
  return {
    state: 'publish',
    disabled: busy || input.publish === null,
    blocker: null,
  };
}
