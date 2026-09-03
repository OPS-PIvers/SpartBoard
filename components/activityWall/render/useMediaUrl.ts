import { useEffect, useState } from 'react';
import { getDownloadURL, ref as storageRef } from 'firebase/storage';
import { storage } from '@/config/firebase';
import type { ActivityWallSubmission } from '@/types';

/** True only for http(s) URLs; anything else is treated as a Storage path. */
export const isSafeHttpUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
};

export const isArchived = (submission: ActivityWallSubmission): boolean =>
  submission.archiveStatus === 'archived' || Boolean(submission.driveFileId);

const STORAGE_BACKED_TYPES = new Set(['photo', 'video', 'file']);

export interface MediaUrlState {
  url: string | null;
  failed: boolean;
}

/** Resolves an upload's renderable URL: a Storage download URL while in transit, the Drive URL once archived. */
export const useMediaUrl = (
  submission: ActivityWallSubmission
): MediaUrlState => {
  const archived = isArchived(submission);
  const transitPath = submission.storagePath ?? submission.content;
  const storageBacked = STORAGE_BACKED_TYPES.has(submission.type ?? 'text');
  const [resolvedByPath, setResolvedByPath] = useState<Record<string, string>>(
    {}
  );
  const [failedPaths, setFailedPaths] = useState<Record<string, true>>({});
  const alreadyResolved = Boolean(resolvedByPath[transitPath]);
  const alreadyFailed = Boolean(failedPaths[transitPath]);

  useEffect(() => {
    if (
      !storageBacked ||
      archived ||
      !transitPath ||
      isSafeHttpUrl(transitPath) ||
      alreadyResolved ||
      alreadyFailed
    ) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const url = await getDownloadURL(storageRef(storage, transitPath));
        if (!cancelled) {
          setResolvedByPath((previous) => ({
            ...previous,
            [transitPath]: url,
          }));
        }
      } catch (error) {
        console.warn(
          '[ActivityWall] Failed to resolve media URL:',
          transitPath,
          error
        );
        if (!cancelled) {
          setFailedPaths((previous) => ({ ...previous, [transitPath]: true }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [alreadyFailed, alreadyResolved, archived, storageBacked, transitPath]);

  if (archived)
    return { url: submission.driveUrl ?? submission.content, failed: false };
  if (isSafeHttpUrl(transitPath)) return { url: transitPath, failed: false };
  if (!storageBacked) return { url: null, failed: false };
  return { url: resolvedByPath[transitPath] ?? null, failed: alreadyFailed };
};
