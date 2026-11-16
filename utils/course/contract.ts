// Course and Agenda shared contract (docs/plans/COURSE_AND_AGENDA.md §4.1); copied into functions/src/course/shared.gen.ts.

export const COURSES_SUBCOLLECTION = 'courses';
export const CLASS_PAGES_COLLECTION = 'class_pages';
export const CLASS_PAGE_TEACHERS_SUBCOLLECTION = 'teachers';
export const COURSE_PAGE_LINKS_COLLECTION = 'course_page_links';
export const FAMILY_PAGES_COLLECTION = 'family_pages';

export const COURSE_MAX_NAME_LENGTH = 100;
export const COURSE_MAX_CLASSES = 30;
/** D12: at most this many pinned links per Course. */
export const COURSE_MAX_PINNED_LINKS = 6;
export const COURSE_MAX_LINK_TITLE_LENGTH = 80;
export const COURSE_MAX_LINK_URL_LENGTH = 2000;
export const COURSE_MAX_AGENDA_TITLE_LENGTH = 200;
/** A teacher holds far fewer; bounds the save transaction's read of every Course. */
export const COURSE_MAX_PER_TEACHER = 100;

/** D12: one pinned link on a Course. */
export interface CoursePinnedLink {
  title: string;
  url: string;
}

/** D6, D7: the Course's running Google Slides deck. */
export interface CourseAgenda {
  fileId: string;
  title: string;
}

/** How a deck is shared, as the D24 re-check last read it. */
export type CourseDeckSharing = 'private' | 'domain' | 'anyone' | 'unknown';

/** D24: the last sharing re-check, also the pilot measure (§6). */
export interface CourseDeckCheck {
  checkedAt: number;
  /** The deck's Drive modifiedTime in ms, or null when Drive did not say. */
  modifiedAt: number | null;
  sharing: CourseDeckSharing;
}

/** D13, D14: the family link; `shareId` never changes once minted. */
export interface CourseFamilyLink {
  shareId: string;
  on: boolean;
}

/** `users/{uid}/courses/{courseId}`, written only by saveCourseV1. */
export interface Course {
  id: string;
  name: string;
  rosterIds: string[];
  agenda: CourseAgenda | null;
  pinnedLinks: CoursePinnedLink[];
  /** Null until the teacher first switches the family link on. */
  familyLink: CourseFamilyLink | null;
  /** D18: the one Class page link for the Course, `/my-assignments/course/{linkId}`. */
  linkId: string;
  /** Roster id to the student class id the server confirmed and wrote a Class page copy for. */
  rosterClassIds: Record<string, string>;
  deckCheck: CourseDeckCheck | null;
  createdAt: number;
  updatedAt: number;
}

/** `class_pages/{classId}/teachers/{teacherUid}`: one per teacher, so co-teachers never overwrite each other (D22). */
export interface ClassPageCopy {
  courseName: string;
  teacherName: string;
  agenda: CourseAgenda | null;
  pinnedLinks: CoursePinnedLink[];
  linkId: string;
  updatedAt: number;
}

/** `course_page_links/{linkId}`: the Course's student class ids, nothing else. */
export interface CoursePageLink {
  classIds: string[];
}

/** `family_pages/{shareId}`: present only while the family link is on. */
export interface FamilyPage {
  courseName: string;
  teacherName: string;
  agenda: CourseAgenda | null;
  pinnedLinks: CoursePinnedLink[];
  updatedAt: number;
}

/** What the teacher sets on a Course; the server owns ids, class ids and times. */
export interface CourseInput {
  /** Absent creates a Course. */
  id?: string;
  name: string;
  rosterIds: string[];
  agenda: CourseAgenda | null;
  pinnedLinks: CoursePinnedLink[];
  familyLinkOn: boolean;
}

export type SaveCourseRequest =
  /** Create or update; a roster already in another Course moves here, and a Course left empty is deleted. */
  | { action: 'save'; course: CourseInput }
  /** D5: the roster becomes its own Course with a copy of the Agenda and pinned links. */
  | { action: 'unlink'; courseId: string; rosterId: string }
  | { action: 'delete'; courseId: string }
  /** D24: records the deck's sharing and last-modified time. */
  | {
      action: 'recordDeckCheck';
      courseId: string;
      modifiedAt: number | null;
      sharing: CourseDeckSharing;
    };

export interface SaveCourseReply {
  /** The saved Course, or for unlink the new one; null after delete. */
  courseId: string | null;
  /** Rosters in the Course that got no Class page: made by hand, or not confirmed as the teacher's. */
  rostersWithoutClassPage: string[];
  /** ClassLink could not answer, so classes it had not confirmed before have no Class page yet. */
  classLinkUnavailable: boolean;
}

export const COURSE_DECK_SHARING: readonly CourseDeckSharing[] = [
  'private',
  'domain',
  'anyone',
  'unknown',
];

/** Drive file ids are URL-safe base64-ish; anything else is refused before it reaches a Drive URL. */
export function isDriveFileId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{10,200}$/.test(value);
}

/** Firestore-safe id the client may pass (a Course or roster id). */
export function isCourseDocId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

/** Trimmed, single-spaced and capped; '' when nothing is left. */
export function cleanCourseText(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').slice(0, max);
}

/** An http(s) address with a host, or null. */
export function cleanPinnedLinkUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text.length > COURSE_MAX_LINK_URL_LENGTH) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (!url.hostname || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** The valid links, in order, capped at D12's limit; a link with no title uses its host. */
export function cleanPinnedLinks(value: unknown): CoursePinnedLink[] {
  if (!Array.isArray(value)) return [];
  const out: CoursePinnedLink[] = [];
  for (const raw of value) {
    if (out.length >= COURSE_MAX_PINNED_LINKS) break;
    if (!raw || typeof raw !== 'object') continue;
    const link = raw as Record<string, unknown>;
    const url = cleanPinnedLinkUrl(link.url);
    if (!url) continue;
    const title =
      cleanCourseText(link.title, COURSE_MAX_LINK_TITLE_LENGTH) ||
      new URL(url).hostname;
    out.push({ title, url });
  }
  return out;
}

/** A valid Agenda, or null. */
export function cleanCourseAgenda(value: unknown): CourseAgenda | null {
  if (!value || typeof value !== 'object') return null;
  const agenda = value as Record<string, unknown>;
  if (!isDriveFileId(agenda.fileId)) return null;
  return {
    fileId: agenda.fileId,
    title:
      cleanCourseText(agenda.title, COURSE_MAX_AGENDA_TITLE_LENGTH) || 'Agenda',
  };
}
