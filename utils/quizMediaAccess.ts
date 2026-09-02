import type { GlobalFeaturePermission } from '@/types';

/** The one `GlobalFeature` id whose missing-record default is DENY. */
export const QUIZ_MEDIA_FEATURE_ID = 'quiz-media-response';

export interface QuizMediaAccessContext {
  /** The `global_permissions/quiz-media-response` record, if one exists. */
  permission: GlobalFeaturePermission | undefined;
  isAdmin: boolean;
  email: string | null;
}

/**
 * Fail-closed gate for student media responses. Deliberately NOT
 * `canAccessFeature`, whose missing-record default is public: here a missing
 * record means denied. Mirrors `isQuizMediaResponseGranted` in
 * `functions/src/quizMediaArchive.ts` decision for decision — record exists,
 * `enabled === true`, then public / admin / beta — so a surface the client
 * shows is a surface the archival callable will accept. Building and tier
 * restrictions are intentionally not consulted: the server gate cannot see
 * them, and a client that granted more than the server would strand a
 * student mid-recording.
 */
export function canAccessQuizMediaResponse(
  ctx: QuizMediaAccessContext
): boolean {
  const { permission, isAdmin, email } = ctx;
  if (!permission) return false;
  if (permission.enabled !== true) return false;
  if (permission.accessLevel === 'public') return true;
  if (isAdmin) return true;
  const normalized = (email ?? '').toLowerCase();
  if (!normalized) return false;
  if (permission.accessLevel === 'beta') {
    const betaUsers = Array.isArray(permission.betaUsers)
      ? permission.betaUsers
      : [];
    return betaUsers.some(
      (u) => typeof u === 'string' && u.toLowerCase() === normalized
    );
  }
  return false;
}
