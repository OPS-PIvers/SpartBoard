import type { MediaResponseRow } from '@/hooks/useOrgMediaResponses';

// A take is deletable while any copy of it may still exist — the Drive file,
// or a Storage transit object that outlived a failed archive. A tombstoned
// take is never re-deletable: the server refuses it and the audit stamps stand.
export function isTakeDeletable(take: {
  archiveStatus: string;
  driveFileId?: string;
  hasStorageObject: boolean;
}): boolean {
  if (take.archiveStatus === 'deleted') return false;
  return Boolean(take.driveFileId) || take.hasStorageObject;
}

export function countDeletableTakes(row: MediaResponseRow): number {
  return row.takes.filter(isTakeDeletable).length;
}
