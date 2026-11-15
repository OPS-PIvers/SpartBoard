import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { GoogleDriveService } from '@/utils/googleDriveService';

export const NEXTUP_FOLDER_NAME = 'NextUp';

type FolderCheck = Pick<GoogleDriveService, 'isInAppFolder'>;

// One Drive lookup per queue file per signed-in Drive; a failed lookup is retried next time.
let verdictsByDrive = new WeakMap<FolderCheck, Map<string, Promise<boolean>>>();

/** `nextup_sessions` id for a teacher's widget: [teacherUid]_[widgetId], widget id sanitized. */
export const nextUpSessionId = (uid: string, widgetId: string): string =>
  `${uid}_${widgetId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

/** True when the owner-written session record names this file; a co-teacher's or import's widget id never does. */
async function sessionNamesFile(
  sessionId: string,
  fileId: string
): Promise<boolean> {
  const snap = await getDoc(doc(db, 'nextup_sessions', sessionId));
  return snap.exists() && snap.data()?.activeDriveFileId === fileId;
}

/** True when the queue file is in the teacher's NextUp folder and this widget's own session record names it. */
export function isNextUpQueueFile(
  drive: FolderCheck,
  fileId: string,
  sessionId: string
): Promise<boolean> {
  let verdicts = verdictsByDrive.get(drive);
  if (!verdicts) {
    verdicts = new Map();
    verdictsByDrive.set(drive, verdicts);
  }
  const key = `${sessionId}/${fileId}`;
  const cached = verdicts.get(key);
  if (cached) return cached;
  const check = sessionNamesFile(sessionId, fileId).then(
    (bound) => bound && drive.isInAppFolder(fileId, [NEXTUP_FOLDER_NAME])
  );
  verdicts.set(key, check);
  const forget = () => verdicts.delete(key);
  void check.then((owned) => {
    if (!owned) forget();
  }, forget);
  return check;
}

/** Throws unless the file is the queue file this teacher's session record binds to the widget. */
export async function assertNextUpQueueFile(
  drive: FolderCheck,
  fileId: string,
  sessionId: string
): Promise<void> {
  if (!(await isNextUpQueueFile(drive, fileId, sessionId)))
    throw new Error('Queue file is not bound to this Next Up session');
}

// Test hook.
export const resetNextUpQueueFileCache = (): void => {
  verdictsByDrive = new WeakMap();
};
