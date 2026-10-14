/**
 * Normalize a string for use as a segment inside a Firestore response doc id.
 *
 * Roster period names and pins are teacher-defined free text and can contain
 * `/`, whitespace, or other characters that would either split the doc path
 * or break the `pin-{period}-{pin}` parse contract enforced by
 * `firestore.rules`. We collapse everything non-alphanumeric to `_` and
 * lowercase the result so the encoding is stable across the client and the
 * rules predicate (`^pin-[a-z0-9_]+-[a-z0-9_]+$`).
 *
 * Empty / all-separator inputs fall back to `'default'` rather than producing
 * a zero-length segment that would collapse the doc path.
 *
 * Exported so firestore rules tests can assert the same mapping.
 */
export function encodeResponseKeySegment(value: string | undefined): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return 'default';
  const normalized = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const stripped = normalized.replace(/^_+|_+$/g, '');
  return stripped || 'default';
}
