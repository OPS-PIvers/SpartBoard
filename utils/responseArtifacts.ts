import type { ArtifactArchiveEntry } from '@/types';

// Playable only once archival finished and Drive has the file.
export function isArtifactPlayable(
  entry: ArtifactArchiveEntry | undefined
): boolean {
  return entry?.archiveStatus === 'archived' && !!entry.driveFileId;
}
