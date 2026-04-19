// Shared slug / doc-id derivation used by the Organization admin hooks
// (useOrganizations, useOrgBuildings, useOrgDomains). Centralizing the logic
// keeps id-gen consistent across sibling collections so a single
// `organizations/{orgId}/...` path never mixes differently-normalized ids.
//
// `slugify()` produces a URL-friendly, Firestore-safe id from free-form
// input. `slugOrFallback()` wraps it with a UUID fallback for inputs that
// contain no alphanumerics (e.g. "¿¿¿") so callers always get a valid id.

const MAX_SLUG_LENGTH = 48;
const UUID_FALLBACK_LENGTH = 24;

/**
 * Lowercases, strips a leading `@` (convenient for email-style domains),
 * collapses non-alphanumerics into a single `-`, trims leading/trailing `-`,
 * and caps the length. Returns `''` when the input normalizes to nothing.
 */
export const slugify = (input: string): string =>
  input
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, MAX_SLUG_LENGTH);

/**
 * Like `slugify()`, but falls back to a UUID (or `${prefix}-${timestamp}` on
 * runtimes without `crypto.randomUUID`) when the input has no usable
 * alphanumeric content. Use this as the default id-generator for
 * Organization sub-collections.
 */
export const slugOrFallback = (input: string, prefix: string): string => {
  const base = slugify(input);
  if (base) return base;
  return (globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}`).slice(
    0,
    UUID_FALLBACK_LENGTH
  );
};
