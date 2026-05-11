/**
 * Read the `?preview=1` query flag teachers use to verify the student
 * URL without burning their Firebase Auth session. When set, the student
 * routes (`StudentApp`, `QuizStudentApp`, `VideoActivityStudentApp`) skip
 * `signInAnonymously`, skip SSO auto-join, and render a non-functional
 * lobby preview behind the `TeacherPreviewBanner`.
 */
export const isPreviewMode = (): boolean => {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('preview') === '1';
};
