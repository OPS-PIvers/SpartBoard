// Step list and shared types for the assign stepper (docs/plans/ASSIGN_STEPPER.md D4).
import type React from 'react';

export type AssignStepId =
  | 'classes'
  | 'when'
  | 'attempts'
  | 'integrity'
  | 'feedback'
  | 'check'
  | 'sharing';

export type AssignActivity = 'quiz' | 'video' | 'gl' | 'flashcards';

export type AssignKind = 'work' | 'resource';

export interface AssignStepContext {
  kind: AssignKind;
  live?: boolean;
  inPlc?: boolean;
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
  if (effectiveKind(activity, ctx.kind) === 'resource') return steps;
  if (activity === 'quiz') steps.push('attempts', 'integrity', 'feedback');
  if (activity === 'flashcards') steps.push('check');
  if ((activity === 'quiz' || activity === 'video') && ctx.inPlc) {
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
  check: 'How students are checked',
  sharing: 'Sharing',
};

export function getAssignStepTitle(
  id: AssignStepId,
  activity: AssignActivity,
  ctx: AssignStepContext
): string {
  if (id === 'classes' && activity === 'video' && ctx.live) return 'Class';
  if (id === 'when' && effectiveKind(activity, ctx.kind) === 'resource') {
    return 'Available';
  }
  return TITLES[id];
}
