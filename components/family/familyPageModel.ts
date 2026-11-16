// The public family page's data (docs/plans/COURSE_AND_AGENDA.md D13, D15): parsed, re-checked and turned into safe addresses.
import {
  cleanCourseAgenda,
  cleanCourseText,
  cleanPinnedLinks,
  COURSE_MAX_NAME_LENGTH,
  isCourseDocId,
  type FamilyPage,
} from '@/utils/course/contract';

export const FAMILY_PATH_PREFIX = '/family/';

/** The share id in `/family/{shareId}`, or null for anything else. */
export function parseFamilyPath(pathname: string): string | null {
  const match = /^\/family\/([^/]+)\/?$/.exec(pathname);
  if (!match) return null;
  let id: string;
  try {
    id = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  return isCourseDocId(id) ? id : null;
}

/** The address a teacher shares with families. */
export function familyPageUrl(origin: string, shareId: string): string {
  return `${origin}${FAMILY_PATH_PREFIX}${encodeURIComponent(shareId)}`;
}

/** A stored family page, re-cleaned so nothing unsafe reaches the page even if the stored copy is odd. */
export function readFamilyPage(data: unknown): FamilyPage | null {
  if (!data || typeof data !== 'object') return null;
  const raw = data as Record<string, unknown>;
  const courseName = cleanCourseText(raw.courseName, COURSE_MAX_NAME_LENGTH);
  if (!courseName) return null;
  return {
    courseName,
    teacherName: cleanCourseText(raw.teacherName, COURSE_MAX_NAME_LENGTH),
    agenda: cleanCourseAgenda(raw.agenda),
    pinnedLinks: cleanPinnedLinks(raw.pinnedLinks),
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : 0,
  };
}

/** D8: the deck's preview, which opens on its first slide. `fileId` must already pass `isDriveFileId`. */
export function deckEmbedUrl(fileId: string): string {
  return `https://docs.google.com/presentation/d/${fileId}/preview`;
}

/** The deck in Google Slides, for a viewer the embed can't show. */
export function deckOpenUrl(fileId: string): string {
  return `https://docs.google.com/presentation/d/${fileId}/edit?usp=sharing`;
}
