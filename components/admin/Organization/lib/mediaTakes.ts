import type { MediaResponseRow } from '@/hooks/useOrgMediaResponses';

// A take is deletable while any copy of it may still exist — the Drive file,
// or a Storage transit object that outlived a failed archive. Only a settled
// `'deleted'` tombstone is never re-deletable: the server refuses it and the
// audit stamps stand. A `'deleting'` claim whose bytes were never confirmed
// stays selectable so an admin can retry it.
export function isTakeDeletable(take: {
  archiveStatus: string;
  driveFileId?: string;
  hasStorageObject: boolean;
}): boolean {
  if (take.archiveStatus === 'deleted') return false;
  if (take.archiveStatus === 'deleting') return true;
  return Boolean(take.driveFileId) || take.hasStorageObject;
}

export function countDeletableTakes(row: MediaResponseRow): number {
  return row.takes.filter(isTakeDeletable).length;
}

// A whiteboard take is one take but up to three files; the confirm dialog counts files.
export function countDeletableFiles(row: MediaResponseRow): number {
  return row.takes.reduce((sum, take) => {
    if (!isTakeDeletable(take)) return sum;
    const files = take.files?.filter(isTakeDeletable).length ?? 0;
    return sum + Math.max(files, 1);
  }, 0);
}
