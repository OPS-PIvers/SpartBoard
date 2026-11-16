// D4, D25: suggest linking classes with the same ClassLink subject whose names match once code, period and section are stripped.
import type { ClassRoster } from '@/types';
import type { CourseGroup } from './courseGroups';

export type SuggestRoster = Pick<
  ClassRoster,
  'id' | 'name' | 'classlinkSubject' | 'classlinkClassCode'
>;

export interface LinkSuggestion<R extends SuggestRoster> {
  /** Stable id for dismissing: the sorted roster ids. */
  key: string;
  /** The cleaned name, shown and used as the new Course's name. */
  name: string;
  /** The linked Course the classes join, or null to make a new one. */
  courseId: string | null;
  /** Classes not yet in that Course. */
  rosters: R[];
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const PERIOD_WORDS = '(?:p|per|period|hr|hour|block|blk|sec|sect|section)';

/** The roster name without its class code, period or section number; '' when nothing is left. */
export function cleanClassName(
  name: string,
  classCode?: string | null
): string {
  let text = name;
  if (classCode) {
    text = text.replace(
      new RegExp(`\\(\\s*${escape(classCode)}\\s*\\)`, 'gi'),
      ' '
    );
    text = text.replace(new RegExp(`\\b${escape(classCode)}\\b`, 'gi'), ' ');
  }
  // Anything left in parentheses is a code or a teacher name.
  text = text.replace(/\([^)]*\)/g, ' ');
  text = text.replace(
    new RegExp(`\\b${PERIOD_WORDS}\\.?\\s*[-#:]?\\s*\\d+[a-z]?\\b`, 'gi'),
    ' '
  );
  text = text.replace(/\b(?:block|blk|sec|sect|section)\.?\s+[a-z]\b/gi, ' ');
  text = text.replace(/\b\d+(?:st|nd|rd|th)\s+(?:period|hour|block)\b/gi, ' ');
  // A section number after a dash at the end ("English 9 - 03").
  text = text.replace(/\s[-–—]\s*\d+[a-z]?\s*$/i, ' ');
  text = text.replace(/\s+[-–—:]\s+/g, ' - ');
  text = text.replace(/\s+/g, ' ').trim();
  text = text.replace(/^[-–—:\s]+|[-–—:\s]+$/g, '').trim();
  return text;
}

function matchKey(r: SuggestRoster): string | null {
  const subject = r.classlinkSubject?.trim().toLowerCase();
  if (!subject) return null;
  const name = cleanClassName(r.name, r.classlinkClassCode).toLowerCase();
  if (!name) return null;
  return `${subject}\u0000${name}`;
}

/** The subject prefix the import adds ("Subject - Title"), dropped from the shown name when it repeats the subject. */
function displayName(r: SuggestRoster): string {
  const cleaned = cleanClassName(r.name, r.classlinkClassCode);
  const subject = r.classlinkSubject?.trim();
  if (subject) {
    const prefix = `${subject} - `;
    if (
      cleaned.toLowerCase().startsWith(prefix.toLowerCase()) &&
      cleaned.length > prefix.length
    )
      return cleaned.slice(prefix.length);
  }
  return cleaned;
}

/** Suggestions in list order: classes that match and aren't linked yet, joined to a matching linked Course when there is exactly one. */
export function linkSuggestions<R extends SuggestRoster>(
  groups: readonly CourseGroup<R>[],
  dismissed: ReadonlySet<string> = new Set()
): LinkSuggestion<R>[] {
  const buckets = new Map<
    string,
    { singles: R[]; linked: Set<string>; first: number }
  >();
  groups.forEach((g, i) => {
    const linkedId = g.course && g.rosters.length > 1 ? g.course.id : null;
    for (const r of g.rosters) {
      const k = matchKey(r);
      if (!k) continue;
      const b = buckets.get(k) ?? { singles: [], linked: new Set(), first: i };
      if (linkedId) b.linked.add(linkedId);
      else b.singles.push(r);
      buckets.set(k, b);
    }
  });
  const out: (LinkSuggestion<R> & { first: number })[] = [];
  for (const b of buckets.values()) {
    if (b.linked.size > 1) continue;
    const courseId = b.linked.size === 1 ? [...b.linked][0] : null;
    if (b.singles.length < (courseId ? 1 : 2)) continue;
    const key = [...b.singles.map((r) => r.id)].sort().join(',');
    if (dismissed.has(key)) continue;
    const course = courseId
      ? groups.find((g) => g.course?.id === courseId)?.course
      : null;
    out.push({
      key,
      name: course?.name ?? displayName(b.singles[0]),
      courseId,
      rosters: b.singles,
      first: b.first,
    });
  }
  return out
    .sort((a, b) => a.first - b.first)
    .map(({ first: _first, ...s }) => s);
}
