/**
 * Shared key logic for org-scoped Firestore subscription hooks (useOrgBuildings,
 * useOrgDomains, useOrgMembers, useOrgRoles, useOrgStudentPage, useOrganization,
 * useTestClasses). Each hook subscribes to a doc/collection scoped by `orgId`
 * and gates the subscription behind a `shouldSubscribe` flag (auth-bypass /
 * signed-out / no orgId all disable it).
 *
 * The hooks track transitions with a composite `${shouldSubscribe}:${orgId}`
 * key so a single `useState` comparison catches every transition. The subtle
 * part is deciding when stale data must be CLEARED: not just when unsubscribing
 * (`shouldSubscribe` flips to false), but also when staying subscribed while
 * `orgId` changes — a super admin hopping from foreign org A to foreign org B
 * never sees `shouldSubscribe` go false (both keys are `true:<orgId>`), so a
 * clear gated only on `!shouldSubscribe` leaves org A's data rendered under
 * org B's heading until B's first snapshot lands. See useOrgBuildings (#2276)
 * for the original fix this generalizes.
 */

/** Build the composite transition key from a hook's current inputs. */
export function orgSubscriptionKey(
  shouldSubscribe: boolean,
  orgId: string | null
): string {
  return `${shouldSubscribe}:${orgId ?? ''}`;
}

/**
 * Extract the `orgId` component back out of a key built by
 * `orgSubscriptionKey`. Uses indexOf/slice rather than `split(':')` so an
 * orgId that ever contained a colon can't be truncated.
 */
export function orgIdFromKey(key: string): string {
  return key.slice(key.indexOf(':') + 1);
}

/**
 * Whether a hook's org-scoped state must be cleared on a key transition.
 * True when the subscription is turning off, OR when it stays on but now
 * points at a different org.
 */
export function shouldClearOnOrgKeyChange(
  shouldSubscribe: boolean,
  orgId: string | null,
  prevKey: string
): boolean {
  return !shouldSubscribe || orgId !== orgIdFromKey(prevKey);
}
