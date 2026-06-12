/**
 * User-tier derivation + comparison (docs/wide-distro-plan.md Phase 3).
 *
 * Pure functions so the tier logic is unit-testable without mounting
 * AuthContext. AuthContext derives the tier once from auth + org state
 * and the permission helpers call `meetsMinTier` against `minTier`
 * fields on FeaturePermission / GlobalFeaturePermission docs.
 */
import type { UserTier } from '@/types';

/**
 * Email domains whose users get the `internal` tier.
 *
 * TODO(wide-distro): make this admin-configurable. The natural home
 * (`admin_settings/app_settings`) is admin-only readable in
 * firestore.rules, but the tier gate matters precisely for non-admins —
 * so a configurable list needs a world-readable config doc first.
 * Hardcoded constant until that exists.
 */
export const INTERNAL_TIER_DOMAINS: readonly string[] = ['orono.k12.mn.us'];

/** Ordering used by `minTier` comparisons: free < org < internal. */
const TIER_RANK: Record<UserTier, number> = {
  free: 0,
  org: 1,
  internal: 2,
};

/**
 * Derives the user's tier from their email + org membership.
 *
 * @param email The signed-in user's email (null for anonymous/SSO-student
 *   accounts with no email claim — those derive `free`, but permission
 *   checks already require a user so the value is moot for them).
 * @param isOrgMember Whether AuthContext resolved an org membership doc
 *   (`/organizations/{orgId}/members/{email}` exists) for this user.
 */
export function deriveUserTier(
  email: string | null | undefined,
  isOrgMember: boolean
): UserTier {
  const domain = email?.toLowerCase().split('@')[1] ?? '';
  if (domain && INTERNAL_TIER_DOMAINS.includes(domain)) return 'internal';
  if (isOrgMember) return 'org';
  return 'free';
}

/**
 * True when `tier` satisfies a permission doc's `minTier`. An undefined
 * `minTier` (every doc written before the tier model) imposes no
 * restriction.
 */
export function meetsMinTier(tier: UserTier, minTier?: UserTier): boolean {
  if (!minTier) return true;
  return TIER_RANK[tier] >= TIER_RANK[minTier];
}
