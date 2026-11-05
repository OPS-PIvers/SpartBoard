import type { FlashcardAssignment } from '@/types';
import { hasPeriodAccess } from '@/utils/periodAccess';

const MODE_LABELS: Record<
  NonNullable<FlashcardAssignment['checkMode']>,
  string
> = {
  flashcards: 'Flashcards',
  write: 'Write',
  test: 'Test',
  speak: 'Speak',
};

/** What students do, in the stepper's words. */
export const flashcardAssignmentSubtitle = (
  assignment: FlashcardAssignment
): string => {
  if (assignment.kind !== 'check') return 'Study resource';
  const mode = MODE_LABELS[assignment.checkMode ?? 'write'];
  const selection = assignment.cardSelection;
  if (selection?.mode === 'random')
    return `${mode}, ${selection.count} random cards`;
  if (selection?.mode === 'pick') {
    const n = selection.cardIds.length;
    return `${mode}, ${n} chosen ${n === 1 ? 'card' : 'cards'}`;
  }
  return mode;
};

/** Per-period assignments are paused (or not started) when no class is open. */
export const flashcardAssignmentPaused = (
  assignment: FlashcardAssignment
): boolean =>
  hasPeriodAccess(assignment) &&
  Object.values(assignment.periodAccess ?? {}).every((p) => p.state !== 'open');
