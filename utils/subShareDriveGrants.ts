/**
 * Granting a sub read access to the roster files a share needs.
 *
 * Drive's `permissions.create` is idempotent — the same (file, email) returns
 * the SAME permissionId — so an existing grant is reused rather than duplicated.
 * That is what lets the expiry sweep refcount a permission across overlapping
 * shares instead of revoking one another share still depends on.
 *
 * Failures are collected rather than thrown: a share whose roster grant partly
 * failed is still worth creating, and the caller tells the teacher which subs
 * missed out.
 */

import type { SubstituteShareDriveGrant, SubstituteShareRoster } from '@/types';

/** The slice of `GoogleDriveService` this needs. */
export interface RosterGrantingDrive {
  listFilePermissions: (
    fileId: string
  ) => Promise<
    Array<{ id: string; emailAddress?: string; role?: string; type?: string }>
  >;
  grantUserReaderPermission: (fileId: string, email: string) => Promise<string>;
}

export interface ResolvedDriveGrants {
  driveGrants: SubstituteShareDriveGrant[];
  /** (email, file) pairs that could not be granted. */
  failedPairs: Array<{ email: string; fileId: string }>;
}

export async function resolveSubShareDriveGrants({
  driveService,
  fileIds,
  emails,
  scope,
}: {
  driveService: RosterGrantingDrive | null | undefined;
  fileIds: string[];
  emails: string[];
  /** Log prefix, e.g. 'shareSubstituteCollection'. */
  scope: string;
}): Promise<ResolvedDriveGrants> {
  const driveGrants: SubstituteShareDriveGrant[] = [];
  const failedPairs: Array<{ email: string; fileId: string }> = [];
  if (emails.length === 0 || fileIds.length === 0) {
    return { driveGrants, failedPairs };
  }
  if (!driveService) {
    // Sharing was asked for but the teacher has no live Drive service (no
    // token / disconnected). Every requested pair fails.
    for (const fileId of fileIds) {
      for (const email of emails) failedPairs.push({ email, fileId });
    }
    return { driveGrants, failedPairs };
  }

  for (const fileId of fileIds) {
    let existingPerms: Awaited<
      ReturnType<RosterGrantingDrive['listFilePermissions']>
    > = [];
    try {
      existingPerms = await driveService.listFilePermissions(fileId);
    } catch (err) {
      console.error(
        `[${scope}] listFilePermissions(${fileId}) failed; will fall back to grant calls:`,
        err
      );
    }
    for (const email of emails) {
      const lower = email.toLowerCase();
      const existing = existingPerms.find(
        (p) =>
          p.type === 'user' &&
          p.emailAddress?.toLowerCase() === lower &&
          typeof p.id === 'string'
      );
      if (existing) {
        driveGrants.push({ email, fileId, permissionId: existing.id });
        continue;
      }
      try {
        const permissionId = await driveService.grantUserReaderPermission(
          fileId,
          email
        );
        driveGrants.push({ email, fileId, permissionId });
      } catch (err) {
        console.error(
          `[${scope}] Drive grant failed for ${email} on ${fileId}:`,
          err
        );
        failedPairs.push({ email, fileId });
      }
    }
  }
  return { driveGrants, failedPairs };
}

/** Only rosters with a landed grant are loadable by the sub. */
export function grantedRosters(
  rosters: SubstituteShareRoster[] | undefined,
  grants: SubstituteShareDriveGrant[]
): SubstituteShareRoster[] | undefined {
  const grantedFileIds = new Set(grants.map((g) => g.fileId));
  const granted = (rosters ?? []).filter((r) =>
    grantedFileIds.has(r.driveFileId)
  );
  return granted.length > 0 ? granted : undefined;
}
