/** The five guided steps, in order (PRD §6.2). */
export type MeetingStep = 'pick' | 'review' | 'decide' | 'act' | 'save';

export const MEETING_STEP_ORDER: readonly MeetingStep[] = [
  'pick',
  'review',
  'decide',
  'act',
  'save',
] as const;
