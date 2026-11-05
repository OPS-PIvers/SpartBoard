// Step list and shared types for the assign stepper (docs/plans/shipped/ASSIGN_STEPPER.md D4).
import type React from 'react';

export type AssignStepId =
  | 'classes'
  | 'when'
  | 'attempts'
  | 'integrity'
  | 'feedback'
  | 'video'
  | 'check'
  | 'cards'
  | 'speak'
  | 'sheets'
  | 'sharing';

export type AssignActivity = 'quiz' | 'video' | 'gl' | 'flashcards' | 'miniapp';

export type AssignKind = 'work' | 'resource';

export interface AssignStepContext {
  kind: AssignKind;
  live?: boolean;
  inPlc?: boolean;
  /** Flashcards Study: Speak is available for this set (flag and language). */
  speak?: boolean;
  /** Flashcards: the Quiz-style steps (flag flashcards-assign-v2). */
  flashcardsV2?: boolean;
  /** Video Activity: the rule steps belong to the assignment; self-paced only. */
  rules?: boolean;
  /** Video Activity: the player honors shuffle and answer feedback (slice 5). */
  videoAnswerRows?: boolean;
}

export interface AssignStepDef {
  id: AssignStepId;
  title: string;
  /** One-line summary shown on the right while the step is closed (D13). */
  value: string;
  body: React.ReactNode;
}

/** Quiz and Video Activity always collect work (D3). */
const effectiveKind = (
  activity: AssignActivity,
  kind: AssignKind
): AssignKind => (activity === 'quiz' || activity === 'video' ? 'work' : kind);

export function getAssignSteps(
  activity: AssignActivity,
  ctx: AssignStepContext
): AssignStepId[] {
  const steps: AssignStepId[] = ['classes', 'when'];
  if (effectiveKind(activity, ctx.kind) === 'resource') {
    if (activity === 'flashcards' && ctx.speak) steps.push('speak');
    return steps;
  }
  if (activity === 'quiz') steps.push('attempts', 'integrity', 'feedback');
  if (activity === 'video' && ctx.rules && !ctx.live) {
    steps.push('attempts', 'video', 'integrity');
    if (ctx.videoAnswerRows) steps.push('feedback');
  }
  if (activity === 'flashcards') {
    steps.push(
      ...(ctx.flashcardsV2
        ? (['cards', 'check', 'attempts', 'integrity', 'feedback'] as const)
        : (['check'] as const))
    );
  }
  const plcSharing =
    activity === 'quiz' ||
    activity === 'video' ||
    (activity === 'flashcards' && ctx.flashcardsV2);
  if (plcSharing && ctx.inPlc) {
    steps.push('sharing');
  }
  return steps;
}

const TITLES: Record<AssignStepId, string> = {
  classes: 'Classes',
  when: 'When',
  attempts: 'Attempts and order',
  integrity: 'Quiz integrity',
  feedback: 'What students see',
  video: 'Video',
  check: 'How students are checked',
  cards: 'Cards',
  speak: 'Speak',
  sheets: 'Answer sheets',
  sharing: 'Sharing',
};

export function getAssignStepTitle(
  id: AssignStepId,
  activity: AssignActivity,
  ctx: AssignStepContext
): string {
  if (id === 'classes' && activity === 'video' && ctx.live) return 'Class';
  if (id === 'integrity' && (activity === 'video' || activity === 'flashcards'))
    return 'Integrity';
  if (id === 'when' && effectiveKind(activity, ctx.kind) === 'resource') {
    return 'Available';
  }
  return TITLES[id];
}
