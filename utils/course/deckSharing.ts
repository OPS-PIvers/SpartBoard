// Reads and changes an Agenda deck's sharing (docs/plans/COURSE_AND_AGENDA.md D9, D10, D23, D24).
import type { DrivePermission } from '@/utils/googleDriveService';
import type { CourseDeckSharing } from './contract';

/** The Drive calls this needs; GoogleDriveService provides them. */
export interface DeckSharingDrive {
  listFilePermissions(fileId: string): Promise<DrivePermission[]>;
  addLinkReaderPermission(
    fileId: string,
    target: { type: 'domain'; domain: string } | { type: 'anyone' }
  ): Promise<void>;
  deletePermission(fileId: string, permissionId: string): Promise<void>;
  getFileModifiedTime(fileId: string): Promise<number | null>;
}

export interface DeckState {
  sharing: CourseDeckSharing;
  modifiedAt: number | null;
}

/** The address's domain, lowercased, or null. */
export function emailDomain(email: string | null | undefined): string | null {
  const at = email?.lastIndexOf('@') ?? -1;
  if (!email || at < 0 || at === email.length - 1) return null;
  return email.slice(at + 1).toLowerCase();
}

/** 'anyone' when anyone with the link can read, 'domain' when everyone in `domain` can, otherwise 'private'. */
export function deckSharingOf(
  permissions: readonly DrivePermission[],
  domain: string
): Exclude<CourseDeckSharing, 'unknown'> {
  if (permissions.some((p) => p.type === 'anyone')) return 'anyone';
  const d = domain.toLowerCase();
  if (
    permissions.some(
      (p) => p.type === 'domain' && p.domain?.toLowerCase() === d
    )
  )
    return 'domain';
  return 'private';
}

/** D24: the deck's sharing and last-modified time; a part Drive refuses reads as 'unknown' or null. */
export async function readDeckState(
  drive: DeckSharingDrive,
  fileId: string,
  domain: string
): Promise<DeckState> {
  const [perms, modified] = await Promise.allSettled([
    drive.listFilePermissions(fileId),
    drive.getFileModifiedTime(fileId),
  ]);
  return {
    sharing:
      perms.status === 'fulfilled'
        ? deckSharingOf(perms.value, domain)
        : 'unknown',
    modifiedAt: modified.status === 'fulfilled' ? modified.value : null,
  };
}

/** Thrown when a deck still reads as public after SpartBoard removed what it could (an inherited permission, say). */
export class DeckStillPublicError extends Error {
  constructor() {
    super('The deck is still shared with anyone who has the link.');
    this.name = 'DeckStillPublicError';
  }
}

/** D10, D23: 'domain' removes every anyone-with-the-link permission first, then adds the Orono one; 'anyone' adds one and keeps the domain one. */
export async function setDeckSharing(
  drive: DeckSharingDrive,
  fileId: string,
  level: 'domain' | 'anyone',
  domain: string
): Promise<void> {
  const perms = await drive.listFilePermissions(fileId);
  const d = domain.toLowerCase();
  if (level === 'domain') {
    // Public access goes first, so a failed add never leaves the deck public.
    for (const p of perms.filter((x) => x.type === 'anyone'))
      await drive.deletePermission(fileId, p.id);
  }
  const hasDomain = perms.some(
    (p) => p.type === 'domain' && p.domain?.toLowerCase() === d
  );
  if (!hasDomain)
    await drive.addLinkReaderPermission(fileId, { type: 'domain', domain: d });
  if (level === 'anyone') {
    if (!perms.some((p) => p.type === 'anyone'))
      await drive.addLinkReaderPermission(fileId, { type: 'anyone' });
    return;
  }
  if (perms.some((p) => p.type === 'anyone')) {
    const after = await drive.listFilePermissions(fileId);
    if (after.some((p) => p.type === 'anyone'))
      throw new DeckStillPublicError();
  }
}
