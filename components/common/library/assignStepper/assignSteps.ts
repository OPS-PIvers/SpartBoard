// Step list and shared types for the assign stepper (docs/plans/shipped/ASSIGN_STEPPER.md D4).
import type React from 'react';
import type { TourAnchorAttrs } from '@/config/tourAnchors';

export type AssignStepId =
  | 'classes'
  | 'modifications'
  | 'when'
  | 'attempts'
  | 'integrity'
  | 'feedback'
  | 'video'
  | 'check'
  | 'cards'
  | 'speak'
  | 'study'
  | 'sheets'
  | 'written'
  | 'writing'
  | 'sharing';

/** Steps of the class group editor, which reuses this stepper. */
export type GroupStepId =
  'group-students' | 'group-symbol' | 'group-schedule' | 'group-settings';

export type StepperStepId = AssignStepId | GroupStepId;

export type AssignActivity =
  'quiz' | 'video' | 'gl' | 'flashcards' | 'miniapp' | 'writing';

export type AssignKind = 'work' | 'resource';

export interface AssignStepContext {
  kind: AssignKind;
  live?: boolean;
  inPlc?: boolean;
  /** Flashcards Study: Speak is available for this set (flag and language). */
  speak?: boolean;
  /** Video Activity: the rule steps belong to the assignment; self-paced only. */
  rules?: boolean;
  /** Video Activity: the player honors shuffle and answer feedback (slice 5). */
  videoAnswerRows?: boolean;
}

export interface AssignStepDef {
  id: StepperStepId;
  title: string;
  /** One-line summary shown on the right while the step is closed (D13). */
  value: string;
  body: React.ReactNode;
  /** Shown greyed out with its value until it applies, so later steps keep their numbers. */
  disabled?: boolean;
  /** Tour anchor for the step's header button; defaults to the Assign dialog's. */
  anchor?: TourAnchorAttrs;
  /** Tour anchor for this step's Continue button; defaults to the Assign dialog's. */
  continueAnchor?: TourAnchorAttrs;
}

/** Quiz, Video Activity and Writing always collect work (D3). */
const effectiveKind = (
  activity: AssignActivity,
  kind: AssignKind
): AssignKind =>
  activity === 'quiz' || activity === 'video' || activity === 'writing'
    ? 'work'
    : kind;

export function getAssignSteps(
  activity: AssignActivity,
  ctx: AssignStepContext
): AssignStepId[] {
  const steps: AssignStepId[] = ['classes', 'when'];
  if (effectiveKind(activity, ctx.kind) === 'resource') {
    if (activity === 'flashcards') steps.push('study');
    if (activity === 'flashcards' && ctx.speak) steps.push('speak');
    return steps;
  }
  if (activity === 'quiz') steps.push('attempts', 'integrity', 'feedback');
  if (activity === 'video' && ctx.rules && !ctx.live) {
    steps.push('attempts', 'video', 'integrity');
    if (ctx.videoAnswerRows) steps.push('feedback');
  }
  if (activity === 'flashcards') {
    steps.push('cards', 'check', 'attempts', 'integrity', 'feedback');
  }
  if (activity === 'writing') steps.push('writing', 'integrity');
  if (
    (activity === 'quiz' ||
      activity === 'video' ||
      activity === 'flashcards') &&
    ctx.inPlc
  ) {
    steps.push('sharing');
  }
  return steps;
}

const TITLES: Record<AssignStepId, string> = {
  classes: 'Classes',
  modifications: 'Modifications',
  when: 'When',
  attempts: 'Attempts and order',
  integrity: 'Quiz integrity',
  feedback: 'What students see',
  video: 'Video',
  check: 'How students are checked',
  cards: 'Cards',
  speak: 'Speak',
  study: 'Study settings',
  sheets: 'Answer sheets',
  written: 'Written answers',
  writing: 'Writing rules',
  sharing: 'Sharing',
};

export function getAssignStepTitle(
  id: AssignStepId,
  activity: AssignActivity,
  ctx: AssignStepContext
): string {
  if (id === 'classes' && activity === 'video' && ctx.live) return 'Class';
  if (
    id === 'integrity' &&
    (activity === 'video' ||
      activity === 'flashcards' ||
      activity === 'writing')
  )
    return 'Integrity';
  if (id === 'feedback' && activity === 'quiz') return 'Results';
  if (id === 'when' && effectiveKind(activity, ctx.kind) === 'resource') {
    return 'Available';
  }
  return TITLES[id];
}
