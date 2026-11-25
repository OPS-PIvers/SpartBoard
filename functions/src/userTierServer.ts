// Tier constants; tests/serverMirrorParity.test.ts checks them against utils/userTier.ts.

/** Mirrors `INTERNAL_TIER_DOMAINS` in `utils/userTier.ts`. */
export const INTERNAL_TIER_DOMAINS: readonly string[] = ['orono.k12.mn.us'];

/** Mirrors the `free < org < internal` ordering in `utils/userTier.ts`. */
export const TIER_RANK: Readonly<Record<string, number>> = {
  free: 0,
  org: 1,
  internal: 2,
};
