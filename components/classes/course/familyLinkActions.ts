// The family link switch's two steps, deck sharing then the save (docs/plans/COURSE_AND_AGENDA.md D10, D14, D23).
import {
  DeckStillPublicError,
  readDeckState,
  setDeckSharing,
  type DeckSharingDrive,
} from '@/utils/course/deckSharing';
import type { Course, SaveCourseRequest } from '@/utils/course/contract';
import type { UseCoursesResult } from '@/hooks/useCourses';

export type FamilyLinkProblem =
  /** No Google Drive connection, so the deck's sharing can't change. */
  | 'noDrive'
  /** Drive refused to make the deck public (a Workspace policy, say). */
  | 'shareFailed'
  /** The Course changed in another tab or control first. */
  | 'stale'
  | 'saveFailed'
  /** The link is off but the deck is still public (an inherited permission, say). */
  | 'stillPublic'
  /** The link is off but the deck's sharing could not be changed back. */
  | 'unshareFailed'
  /** The link is off but the deck stays public, because another Course's family link still shows it. */
  | 'deckStillUsed';

export interface FamilyLinkDeps {
  saveCourse: UseCoursesResult['saveCourse'];
  /** Null when the teacher has no Drive connection right now. */
  drive: DeckSharingDrive | null;
  /** The teacher's district domain, for "Anyone in Orono with the link". */
  domain: string | null;
  /** The teacher's other Courses now, read fresh before a deck is un-shared. */
  otherCourses?: () => Promise<Course[]>;
}

const save = (course: Course, on: boolean): SaveCourseRequest => ({
  action: 'save',
  course: {
    id: course.id,
    familyLinkOn: on,
    expectedUpdatedAt: course.updatedAt,
  },
});

/** Undoes only what turning on added: the anyone-with-the-link permissions, nothing else. */
async function removeAnyoneAccess(
  drive: DeckSharingDrive,
  fileId: string
): Promise<void> {
  const perms = await drive.listFilePermissions(fileId);
  for (const p of perms.filter((x) => x.type === 'anyone'))
    await drive.deletePermission(fileId, p.id);
}

const isStale = (err: unknown) => {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' && code.endsWith('failed-precondition');
};

/** D10: makes the deck "Anyone with the link" first, then saves; a failed save puts a deck that was not public back. */
export async function turnFamilyLinkOn(
  course: Course,
  deps: FamilyLinkDeps
): Promise<FamilyLinkProblem | null> {
  const fileId = course.agenda?.fileId;
  let madePublic = false;
  if (fileId) {
    if (!deps.drive || !deps.domain) return 'noDrive';
    try {
      const before = await readDeckState(deps.drive, fileId, deps.domain);
      await setDeckSharing(deps.drive, fileId, 'anyone', deps.domain);
      madePublic = before.sharing === 'private' || before.sharing === 'domain';
    } catch {
      return 'shareFailed';
    }
  }
  try {
    await deps.saveCourse(save(course, true));
    return null;
  } catch (err) {
    // A stale save may mean another tab just switched the link on, so the deck is left public then.
    if (isStale(err)) return 'stale';
    if (madePublic && fileId && deps.drive)
      await removeAnyoneAccess(deps.drive, fileId).catch(() => undefined);
    return 'saveFailed';
  }
}

/** D14, D23: saves the link off first, so the page goes away even if Drive then fails; `unshare` sets the deck back to Orono only. */
export async function turnFamilyLinkOff(
  course: Course,
  unshare: boolean,
  deps: FamilyLinkDeps
): Promise<FamilyLinkProblem | null> {
  try {
    await deps.saveCourse(save(course, false));
  } catch (err) {
    return isStale(err) ? 'stale' : 'saveFailed';
  }
  const fileId = course.agenda?.fileId;
  if (!unshare || !fileId) return null;
  if (!deps.drive || !deps.domain) return 'unshareFailed';
  try {
    const others = deps.otherCourses ? await deps.otherCourses() : [];
    if (
      others.some(
        (c) =>
          c.id !== course.id &&
          c.familyLink?.on === true &&
          c.agenda?.fileId === fileId
      )
    )
      return 'deckStillUsed';
  } catch {
    return 'unshareFailed';
  }
  try {
    await setDeckSharing(deps.drive, fileId, 'domain', deps.domain);
    return null;
  } catch (err) {
    return err instanceof DeckStillPublicError
      ? 'stillPublic'
      : 'unshareFailed';
  }
}
