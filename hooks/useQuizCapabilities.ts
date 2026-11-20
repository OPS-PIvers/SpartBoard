import { useAuth } from '@/context/useAuth';

/** The Quiz widget's plain top-level feature booleans (no rollout switch, no constant ids). */
export function useQuizCapabilities() {
  const { canAccessFeature } = useAuth();
  return {
    districtLibraryOn: canAccessFeature('district-library'),
    canUseQuizAi:
      canAccessFeature('gemini-functions') && canAccessFeature('quiz'),
    canImportFromSchoology: canAccessFeature('schoology-quiz-import'),
  };
}
