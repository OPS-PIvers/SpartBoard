import type { GlobalFeaturePermission } from '@/types';

/** The one `GlobalFeature` id whose missing-record default is DENY. */
export const QUIZ_MEDIA_FEATURE_ID = 'quiz-media-response';

/** Signature of AuthContext's shared `resolvePermissionAccess`. */
export type ResolvePermissionAccess = (
  permission: GlobalFeaturePermission,
  email: string | null
) => boolean;

export interface QuizMediaAccessContext {
  /** The `global_permissions/quiz-media-response` record, if one exists. */
  permission: GlobalFeaturePermission | undefined;
  email: string | null;
  resolveAccess: ResolvePermissionAccess;
}

/**
 * Fail-closed gate for student media responses: the ONLY thing that differs
 * from every other feature is the missing-record default, which denies here
 * and is public in `canAccessFeature`. Everything else delegates to
 * `resolvePermissionAccess`, so `minTier` and `buildings` are honoured exactly
 * as `isQuizMediaResponseGranted` honours them server-side.
 */
export function canAccessQuizMediaResponse(
  ctx: QuizMediaAccessContext
): boolean {
  const { permission, email, resolveAccess } = ctx;
  if (!permission) return false;
  return resolveAccess(permission, email);
}
