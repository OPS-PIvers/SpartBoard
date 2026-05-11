// Validation helpers for the admin link-shortener feature.
//
// Short links live at /r/:code on the existing domain, so the set of legal
// codes must be (a) URL-path-safe, (b) disjoint from existing app routes,
// and (c) bounded in length to keep Firestore doc ids sane.

import { slugify } from './slug';

export const SHORT_LINK_PREFIX = '/r/';
export const MIN_SLUG_LENGTH = 2;
export const MAX_SLUG_LENGTH = 32;
export const MAX_DESTINATION_LENGTH = 2048;
export const RANDOM_CODE_LENGTH = 8;

// Codes that would collide with existing top-level SPA routes (or are
// otherwise reserved for future routes). The shortener resolver lives at
// `/r/:code`, but a typo like `/r` or `/r/admin` should never be silently
// reachable, and shortlinks themselves should never alias real product paths.
export const RESERVED_SLUGS: readonly string[] = [
  'r',
  'admin',
  'api',
  'join',
  'quiz',
  'activity',
  'activity-wall',
  'guided-learning',
  'miniapp',
  'nextup',
  'remote',
  'invite',
  'plc-invite',
  'student',
  'my-assignments',
];

export type SlugValidationResult =
  | { ok: true; slug: string }
  | { ok: false; reason: string };

export type DestinationValidationResult =
  | { ok: true; url: string }
  | { ok: false; reason: string };

/**
 * Normalize and validate a user-supplied slug. Returns the canonical form
 * (lowercased, dash-separated) when valid, otherwise a human-readable reason.
 *
 * Note: this does NOT check Firestore uniqueness — callers must do that
 * with a `getDoc` against `short_links/{slug}` after normalization.
 */
export const validateSlug = (raw: string): SlugValidationResult => {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, reason: 'Slug cannot be empty.' };
  }

  const normalized = slugify(trimmed);
  if (!normalized) {
    return {
      ok: false,
      reason: 'Slug must contain at least one letter or number.',
    };
  }

  if (normalized.length < MIN_SLUG_LENGTH) {
    return {
      ok: false,
      reason: `Slug must be at least ${MIN_SLUG_LENGTH} characters.`,
    };
  }

  if (normalized.length > MAX_SLUG_LENGTH) {
    return {
      ok: false,
      reason: `Slug must be at most ${MAX_SLUG_LENGTH} characters.`,
    };
  }

  if (RESERVED_SLUGS.includes(normalized)) {
    return {
      ok: false,
      reason: `"${normalized}" is reserved. Pick a different slug.`,
    };
  }

  return { ok: true, slug: normalized };
};

/**
 * Validate a destination URL. Requires an absolute http(s) URL — relative
 * paths and `javascript:` / `data:` / `file:` schemes are rejected so the
 * resolver can hand the value straight to `window.location.replace()`.
 */
export const validateDestination = (
  raw: string
): DestinationValidationResult => {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, reason: 'Destination URL is required.' };
  }

  if (trimmed.length > MAX_DESTINATION_LENGTH) {
    return {
      ok: false,
      reason: `URL is too long (max ${MAX_DESTINATION_LENGTH} characters).`,
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      ok: false,
      reason: 'Enter a complete URL including https://',
    };
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return {
      ok: false,
      reason: 'Only http and https URLs are allowed.',
    };
  }

  return { ok: true, url: parsed.toString() };
};

/**
 * Generate a random short code from cryptographically strong randomness.
 * Uses `crypto.randomUUID()` when available and falls back to
 * `crypto.getRandomValues()` — never `Math.random()`, which is predictable
 * and unsuitable for code generation in a security-sensitive context
 * (short codes are public URLs that map to admin-curated destinations).
 */
// A stripped UUID is exactly 32 hex characters, so the fast UUID path can
// only honor the `length` contract for `length <= 32`. For anything longer
// we fall through to `getRandomValues`, which produces an arbitrary number
// of bytes — preserving the "result.length === length" guarantee callers
// rely on.
const UUID_HEX_LENGTH = 32;

export const generateRandomCode = (
  length: number = RANDOM_CODE_LENGTH
): string => {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.randomUUID && length <= UUID_HEX_LENGTH) {
    return cryptoObj
      .randomUUID()
      .replace(/-/g, '')
      .slice(0, length)
      .toLowerCase();
  }
  if (cryptoObj?.getRandomValues) {
    const bytes = new Uint8Array(Math.ceil(length / 2));
    cryptoObj.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, length);
  }
  throw new Error(
    'No secure random source available — Web Crypto API is required to generate short codes.'
  );
};
