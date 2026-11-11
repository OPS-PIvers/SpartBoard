import { HttpsError } from 'firebase-functions/v2/https';

// District library canonicals are admin-written; no join path may make a teacher a co-editor (QUIZ_MCA_PRACTICE.md M27).
export function assertNotDistrictGroup(groupData: unknown): void {
  const id =
    groupData && typeof groupData === 'object'
      ? (groupData as { districtItemId?: unknown }).districtItemId
      : undefined;
  if (typeof id === 'string' && id !== '') {
    throw new HttpsError(
      'failed-precondition',
      'District library quizzes are read-only. Make your own copy to edit it.'
    );
  }
}
