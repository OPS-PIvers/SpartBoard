/**
 * The double gate for importing a quiz from a test document
 * (docs/plans/shipped/QUIZ_DOCUMENT_IMPORT.md D21): the org-wide rollout switch AND
 * the per-user `quiz-document-import` permission. One source, so the entry
 * tile, the stub-fill path and the AI reader cannot drift apart.
 */
import { useAuth } from '@/context/useAuth';
import { useQuizDocumentImportSettings } from '@/hooks/useQuizDocumentImportSettings';

export function useQuizDocumentImportGate(): boolean {
  const { canAccessFeature } = useAuth();
  const rollout = useQuizDocumentImportSettings();
  return rollout.enabled && canAccessFeature('quiz-document-import');
}
