// Saves a Synced colleague's edit to another member's wall through saveSharedActivityWallV1.

import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';
import type { ActivityWallLibraryEntry } from '@/types';

/** The setup fields the server lets a colleague change; classes travel as the colleague's own list. */
const EDITABLE_KEYS = [
  'title',
  'prompt',
  'mode',
  'identificationMode',
  'moderationEnabled',
  'layout',
  'sections',
  'tableRows',
  'tableCols',
  'timePeriods',
  'timelineGroups',
  'timelineDatesHidden',
  'mapCenter',
  'allowedTypes',
  'appearance',
  'allowGuests',
  'showNames',
  'maxPostsPerStudent',
  'allowStudentEdit',
  'allowStudentDelete',
  'acceptingResponses',
  'studentsCanSeePosts',
  'allowLikes',
  'allowComments',
  'allowCommentResponses',
] as const satisfies readonly (keyof ActivityWallLibraryEntry)[];

export interface SharedWallEditRequest {
  shareId: string;
  ownerUid: string;
  activityId: string;
  changes: Partial<ActivityWallLibraryEntry>;
  /** The colleague's own classes on the wall, sent only when they change. */
  myClassIds?: string[];
}

const classIdsOf = (entry: ActivityWallLibraryEntry): string[] =>
  entry.classIds?.length
    ? entry.classIds
    : entry.classId
      ? [entry.classId]
      : [];

/** Classes a colleague can't change on someone else's wall, and whether they may add their own. */
export interface SharedWallClassLock {
  locked: string[];
  canAdd: boolean;
}

export function sharedWallClassLock(
  entry: ActivityWallLibraryEntry,
  uid: string
): SharedWallClassLock {
  const mine = entry.memberClassIds?.[uid] ?? [];
  const all = classIdsOf(entry);
  return {
    locked: all.filter((id) => !mine.includes(id)),
    // A link-only wall stays link-only until its owner targets classes.
    canAdd: all.length > 0,
  };
}

/** Only what the colleague changed, so a save never overwrites the owner's other edits. */
export function diffSharedWallEdit(
  before: ActivityWallLibraryEntry,
  after: ActivityWallLibraryEntry,
  uid: string
): Pick<SharedWallEditRequest, 'changes' | 'myClassIds'> {
  const changes: Record<string, unknown> = {};
  for (const key of EDITABLE_KEYS) {
    const next = after[key];
    if (next === undefined) continue;
    if (JSON.stringify(next) !== JSON.stringify(before[key]))
      changes[key] = next;
  }
  const { locked } = sharedWallClassLock(before, uid);
  const mine = before.memberClassIds?.[uid] ?? [];
  const nextMine = classIdsOf(after).filter((id) => !locked.includes(id));
  const sameClasses =
    nextMine.length === mine.length &&
    nextMine.every((id) => mine.includes(id));
  return {
    changes,
    ...(sameClasses ? {} : { myClassIds: nextMine }),
  };
}

export async function saveSharedActivityWall(
  request: SharedWallEditRequest
): Promise<void> {
  await httpsCallable(functions, 'saveSharedActivityWallV1')(request);
}
