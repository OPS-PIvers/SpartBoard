import type { AssignmentMode, QuizSessionMode, QuizWidgetKind } from '@/types';

/** Plan D3: an untagged (legacy) doc belongs to Review when it was teacher-paced or auto. */
export function getAssignmentWidgetKind(doc: {
  widgetKind?: QuizWidgetKind;
  sessionMode?: QuizSessionMode;
  mode?: AssignmentMode;
}): QuizWidgetKind {
  if (doc.widgetKind === 'quiz' || doc.widgetKind === 'review') {
    return doc.widgetKind;
  }
  // View-only shares are stamped teacher-paced but are a Quiz feature.
  if (doc.mode === 'view-only') return 'quiz';
  return doc.sessionMode === 'teacher' ||
    doc.sessionMode === 'auto' ||
    doc.sessionMode === 'game'
    ? 'review'
    : 'quiz';
}
