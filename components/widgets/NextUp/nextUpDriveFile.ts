import type { GoogleDriveService } from '@/utils/googleDriveService';

export const NEXTUP_FOLDER_NAME = 'NextUp';

type FolderCheck = Pick<GoogleDriveService, 'isInAppFolder'>;

// One Drive lookup per queue file per signed-in Drive; a failed lookup is retried next time.
let verdictsByDrive = new WeakMap<FolderCheck, Map<string, Promise<boolean>>>();

/** True when the queue file sits in the teacher's NextUp folder, so an imported widget's id is never used. */
export function isNextUpQueueFile(
  drive: FolderCheck,
  fileId: string
): Promise<boolean> {
  let verdicts = verdictsByDrive.get(drive);
  if (!verdicts) {
    verdicts = new Map();
    verdictsByDrive.set(drive, verdicts);
  }
  const cached = verdicts.get(fileId);
  if (cached) return cached;
  const check = drive.isInAppFolder(fileId, [NEXTUP_FOLDER_NAME]);
  verdicts.set(fileId, check);
  const forget = () => verdicts.delete(fileId);
  void check.then((owned) => {
    if (!owned) forget();
  }, forget);
  return check;
}

/** Throws unless the file is this teacher's own queue file. */
export async function assertNextUpQueueFile(
  drive: FolderCheck,
  fileId: string
): Promise<void> {
  if (!(await isNextUpQueueFile(drive, fileId)))
    throw new Error('Queue file is not in the NextUp folder');
}

// Test hook.
export const resetNextUpQueueFileCache = (): void => {
  verdictsByDrive = new WeakMap();
};
