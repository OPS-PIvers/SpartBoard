/**
 * Pure match + ranking logic for the per-PLC search box (PRD §6.4, Decision 4.3).
 *
 * This module has NO React / Firestore / i18n dependency — it takes already-loaded
 * searchable records (the provider's slices + a light on-demand boards query) and a
 * raw query string, and returns grouped, ranked {@link PlcSearchResult}s. The
 * `PlcSearchBox` component owns the input + dropdown; the `usePlcSearch` selector in
 * `context/usePlcContext.ts` owns reading the slices and feeding them here.
 *
 * Matching is case-insensitive SUBSTRING over a record's searchable text (its title
 * plus, for some kinds, a secondary snippet). Ranking is deterministic and stable:
 *
 *   1. Best match quality per record — a title prefix beats a title substring beats a
 *      secondary-field substring (lower `MatchTier` number = better).
 *   2. Earlier match offset within the matched field (a hit near the start ranks
 *      above one buried deeper).
 *   3. Title `localeCompare` as the final tiebreak, so equal-quality matches keep a
 *      stable, alphabetical order across renders (no churn).
 *
 * Results are grouped by {@link PlcSearchSection} (the rail section a click navigates
 * to) in a fixed section order, and each group is capped so the dropdown stays
 * glanceable.
 */

/**
 * The rail section a search result navigates to when clicked. A subset of the
 * canonical section ids (`@/components/plc/sections`) — every searchable kind maps
 * to exactly one of these. Kept as a local string union (rather than importing
 * `PlcSectionId`) so this pure module has zero component-layer imports; the caller
 * narrows it back to `PlcSectionId` at the navigation boundary.
 */
export type PlcSearchSection =
  | 'assessments'
  | 'docs'
  | 'sharedBoards'
  | 'sharedData';

/** The flavor of a searched record — drives the result icon + group label. */
export type PlcSearchKind =
  | 'assessment'
  | 'quiz'
  | 'video-activity'
  | 'doc'
  | 'note'
  | 'board';

/**
 * One searchable record handed to {@link searchPlcRecords}. The caller flattens
 * each provider slice into these before searching:
 *
 *   - `id` — the source doc id (used as a stable React key + click target).
 *   - `kind` — the record flavor (icon + group routing).
 *   - `section` — the rail section a click navigates to.
 *   - `title` — primary searchable text (the field shown as the result label).
 *   - `snippet` — optional secondary searchable text (note body, doc url, unit
 *     label). Matched at a lower tier than the title and shown as muted subtext.
 */
export interface PlcSearchRecord {
  id: string;
  kind: PlcSearchKind;
  section: PlcSearchSection;
  title: string;
  snippet?: string;
}

/** A ranked search hit — a {@link PlcSearchRecord} plus its computed match metadata. */
export interface PlcSearchResult extends PlcSearchRecord {
  /** Lower = better (see {@link MatchTier}). */
  tier: MatchTier;
  /** Character offset of the match within the matched field (lower = better). */
  matchOffset: number;
  /** Which field produced the surviving (best) match — drives snippet highlighting. */
  matchedField: 'title' | 'snippet';
}

/** One section's grouped results, in fixed section order. */
export interface PlcSearchGroup {
  section: PlcSearchSection;
  results: PlcSearchResult[];
}

/**
 * Match quality, best (lowest) first. A title PREFIX hit (the query starts the
 * title) is the strongest signal; a title SUBSTRING is next; a SNIPPET substring
 * (note body / doc url / unit label) is weakest.
 */
export enum MatchTier {
  TitlePrefix = 0,
  TitleSubstring = 1,
  SnippetSubstring = 2,
}

/** Fixed render order for the result groups (matches the rail's top-down order). */
export const PLC_SEARCH_SECTION_ORDER: readonly PlcSearchSection[] = [
  'assessments',
  'sharedData',
  'docs',
  'sharedBoards',
] as const;

/** Max results surfaced per section group, so the dropdown stays glanceable. */
export const PLC_SEARCH_PER_SECTION_LIMIT = 6;

/** Max total results across all groups (a hard ceiling on dropdown height). */
export const PLC_SEARCH_TOTAL_LIMIT = 20;

/**
 * Minimum trimmed query length before search runs. A single character matches
 * almost everything and produces noise; two characters is the calm threshold.
 */
export const PLC_SEARCH_MIN_QUERY_LENGTH = 2;

/** Normalise a query / field for case-insensitive comparison. */
function normalize(value: string): string {
  return value.toLowerCase().trim();
}

/**
 * Compute the best match of `needle` (already normalised) against one record.
 * Returns `null` when neither the title nor the snippet contains the needle.
 * Title hits always beat snippet hits; a title prefix beats a title substring.
 */
function matchRecord(
  record: PlcSearchRecord,
  needle: string
): Pick<PlcSearchResult, 'tier' | 'matchOffset' | 'matchedField'> | null {
  const title = normalize(record.title);
  const titleIndex = title.indexOf(needle);
  if (titleIndex === 0) {
    return {
      tier: MatchTier.TitlePrefix,
      matchOffset: 0,
      matchedField: 'title',
    };
  }
  if (titleIndex > 0) {
    return {
      tier: MatchTier.TitleSubstring,
      matchOffset: titleIndex,
      matchedField: 'title',
    };
  }
  if (record.snippet) {
    const snippetIndex = normalize(record.snippet).indexOf(needle);
    if (snippetIndex >= 0) {
      return {
        tier: MatchTier.SnippetSubstring,
        matchOffset: snippetIndex,
        matchedField: 'snippet',
      };
    }
  }
  return null;
}

/**
 * Stable comparator over two results: tier asc, then match offset asc, then title
 * `localeCompare`, then id `localeCompare` (a total order, so the sort never churns
 * across renders even for otherwise-identical hits).
 */
function compareResults(a: PlcSearchResult, b: PlcSearchResult): number {
  if (a.tier !== b.tier) return a.tier - b.tier;
  if (a.matchOffset !== b.matchOffset) return a.matchOffset - b.matchOffset;
  const byTitle = a.title.localeCompare(b.title);
  if (byTitle !== 0) return byTitle;
  return a.id.localeCompare(b.id);
}

/**
 * Match + rank + group `records` against `rawQuery`.
 *
 * Returns an empty array when the trimmed query is shorter than
 * {@link PLC_SEARCH_MIN_QUERY_LENGTH}. Otherwise: every record is scored, hits are
 * sorted by the stable {@link compareResults} order, grouped into the fixed
 * {@link PLC_SEARCH_SECTION_ORDER}, each group capped at
 * {@link PLC_SEARCH_PER_SECTION_LIMIT}, and the total capped at
 * {@link PLC_SEARCH_TOTAL_LIMIT}. Empty groups are omitted.
 */
export function searchPlcRecords(
  records: readonly PlcSearchRecord[],
  rawQuery: string
): PlcSearchGroup[] {
  const needle = normalize(rawQuery);
  if (needle.length < PLC_SEARCH_MIN_QUERY_LENGTH) return [];

  const hits: PlcSearchResult[] = [];
  for (const record of records) {
    const match = matchRecord(record, needle);
    if (match) hits.push({ ...record, ...match });
  }
  hits.sort(compareResults);

  const groups: PlcSearchGroup[] = [];
  let total = 0;
  for (const section of PLC_SEARCH_SECTION_ORDER) {
    if (total >= PLC_SEARCH_TOTAL_LIMIT) break;
    const sectionHits: PlcSearchResult[] = [];
    for (const hit of hits) {
      if (hit.section !== section) continue;
      if (sectionHits.length >= PLC_SEARCH_PER_SECTION_LIMIT) break;
      if (total >= PLC_SEARCH_TOTAL_LIMIT) break;
      sectionHits.push(hit);
      total += 1;
    }
    if (sectionHits.length > 0) groups.push({ section, results: sectionHits });
  }
  return groups;
}

/**
 * Flatten the fixed section-ordered groups into a single navigable list (for
 * arrow-key navigation in the dropdown). Order matches the rendered group order so
 * the visual order and the keyboard order agree.
 */
export function flattenSearchGroups(
  groups: readonly PlcSearchGroup[]
): PlcSearchResult[] {
  return groups.flatMap((group) => group.results);
}
