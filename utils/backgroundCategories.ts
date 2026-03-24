/**
 * Background category utilities.
 *
 * Categories are resolved in priority order:
 *  1. Admin-set `category` field from Firestore (explicit override)
 *  2. Keyword match against the background label (auto-detection)
 *  3. "General" fallback
 */

export const BACKGROUND_CATEGORY_ORDER = [
  'Classroom',
  'Landmarks',
  'Nature',
  'Space',
  'Abstract',
  'Seasonal',
  'General',
] as const;

export type BackgroundCategory = (typeof BACKGROUND_CATEGORY_ORDER)[number];

/** Returns the category for a background, using admin override when present. */
export function resolveCategory(
  label: string,
  adminCategory?: string
): BackgroundCategory {
  if (adminCategory?.trim()) {
    const trimmed = adminCategory.trim();
    const match = BACKGROUND_CATEGORY_ORDER.find(
      (c) => c.toLowerCase() === trimmed.toLowerCase()
    );
    if (match) return match;
    // Unrecognized admin category — fall through to keyword detection
  }

  const l = label.toLowerCase();

  if (/chalkboard|corkboard|classroom|school|blackboard/.test(l))
    return 'Classroom';
  if (
    /colosseum|pyramid|eiffel|great wall|machu|petra|redeemer|taj|chich[eé]n|itz[aá]|angkor|parthenon|stonehenge/.test(
      l
    )
  )
    return 'Landmarks';
  if (
    /forest|ocean|beach|mountain|lake|river|nature|waterfall|jungle|desert|glacier|field|meadow/.test(
      l
    )
  )
    return 'Nature';
  if (/space|galaxy|star|nebula|cosmos|planet|moon|aurora/.test(l))
    return 'Space';
  if (/abstract|pattern|texture|geometric|gradient|minimal/.test(l))
    return 'Abstract';
  if (
    /winter|summer|spring|fall|autumn|christmas|halloween|holiday|seasonal/.test(
      l
    )
  )
    return 'Seasonal';

  return 'General';
}
