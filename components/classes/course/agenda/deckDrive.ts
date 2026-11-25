// Drive calls for an Agenda deck: a 403 here means "not yours to share", not a lost sign-in, so it never fires the sign-in toast.
import { authError } from '@/utils/driveAuthErrors';
import { DRIVE_API_URL, DriveSession } from '@/utils/driveRequest';
import { aspectFromPageSize } from '@/utils/course/agendaFrame';
import { cleanAgendaAspect } from '@/utils/course/contract';
import type { DrivePermission } from '@/utils/googleDriveService';
import {
  deckSharingOf,
  type DeckSharingDrive,
  type DeckState,
} from '@/utils/course/deckSharing';

const SLIDES_API_URL = 'https://slides.googleapis.com/v1/presentations';
const THUMBNAIL_TIMEOUT_MS = 10_000;
const TIMEOUT_MS = 20_000;
// Drive's 403 reasons that mean the token itself lacks Drive access.
const AUTH_REASONS = new Set([
  'authError',
  'insufficientPermissions',
  'ACCESS_TOKEN_SCOPE_INSUFFICIENT',
]);

export type DeckAccessReason = 'no-access' | 'not-found' | 'policy';

/** Drive refused the deck itself: the teacher can't change its sharing, it is gone, or a district policy blocks the change. */
export class DeckAccessError extends Error {
  readonly reason: DeckAccessReason;
  constructor(reason: DeckAccessReason) {
    super(`Drive refused the deck (${reason}).`);
    this.name = 'DeckAccessError';
    this.reason = reason;
  }
}

function reasonsOf(body: string): string[] {
  try {
    const parsed = JSON.parse(body) as {
      error?: {
        status?: unknown;
        errors?: Array<{ reason?: unknown }>;
        details?: Array<{ reason?: unknown }>;
      };
    };
    const e = parsed.error;
    return [
      e?.status,
      ...(e?.errors ?? []).map((x) => x.reason),
      ...(e?.details ?? []).map((x) => x.reason),
    ].filter((x): x is string => typeof x === 'string');
  } catch {
    return [];
  }
}

/** Maps a failed Drive response to the error a deck caller can act on. */
export function deckErrorFor(status: number, body: string): Error {
  if (status === 401) {
    return authError('Google Drive access expired. Please sign in again.');
  }
  const reasons = reasonsOf(body);
  if (status === 403) {
    if (reasons.some((r) => AUTH_REASONS.has(r))) {
      return authError('Google Drive access expired. Please sign in again.');
    }
    // A rate limit is a passing failure, not a refusal.
    if (reasons.some((r) => /rateLimitExceeded/i.test(r))) {
      return new Error('Drive is busy (rate limit).');
    }
    if (
      reasons.some((r) =>
        /policy|publishOutNotPermitted|cannotShare|sharingRestricted/i.test(r)
      )
    ) {
      return new DeckAccessError('policy');
    }
    return new DeckAccessError('no-access');
  }
  if (status === 404) return new DeckAccessError('not-found');
  return new Error(`Drive request failed: ${status} ${body.slice(0, 200)}`);
}

export class DeckDrive implements DeckSharingDrive {
  private readonly session: DriveSession;

  constructor(token: string, refresh: () => Promise<string | null>) {
    this.session = new DriveSession(token, refresh);
  }

  private send(url: string, init: RequestInit = {}): Promise<Response> {
    return this.session.request(
      url,
      { ...init, headers: { 'Content-Type': 'application/json' } },
      { timeoutMs: TIMEOUT_MS }
    );
  }

  private async ok(url: string, init?: RequestInit): Promise<Response> {
    const response = await this.send(url, init);
    if (!response.ok)
      throw deckErrorFor(response.status, await response.text());
    return response;
  }

  async listFilePermissions(fileId: string): Promise<DrivePermission[]> {
    const out: DrivePermission[] = [];
    let pageToken: string | undefined;
    do {
      const url = new URL(
        `${DRIVE_API_URL}/files/${encodeURIComponent(fileId)}/permissions`
      );
      url.searchParams.set(
        'fields',
        'nextPageToken,permissions(id,type,role,emailAddress,domain)'
      );
      url.searchParams.set('pageSize', '100');
      url.searchParams.set('supportsAllDrives', 'true');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const data = (await (await this.ok(url.toString())).json()) as {
        nextPageToken?: string;
        permissions?: Array<Partial<DrivePermission>>;
      };
      out.push(
        ...(data.permissions ?? []).filter(
          (p): p is DrivePermission => typeof p.id === 'string'
        )
      );
      pageToken = data.nextPageToken;
    } while (pageToken);
    return out;
  }

  async addLinkReaderPermission(
    fileId: string,
    target: { type: 'domain'; domain: string } | { type: 'anyone' }
  ): Promise<void> {
    await this.ok(
      `${DRIVE_API_URL}/files/${encodeURIComponent(fileId)}/permissions?sendNotificationEmail=false&supportsAllDrives=true`,
      {
        method: 'POST',
        body: JSON.stringify({
          role: 'reader',
          allowFileDiscovery: false,
          ...target,
        }),
      }
    );
  }

  async deletePermission(fileId: string, permissionId: string): Promise<void> {
    const response = await this.send(
      `${DRIVE_API_URL}/files/${encodeURIComponent(fileId)}/permissions/${encodeURIComponent(permissionId)}?supportsAllDrives=true`,
      { method: 'DELETE' }
    );
    if (!response.ok && response.status !== 404)
      throw deckErrorFor(response.status, await response.text());
  }

  /** The file's name and whether it is a Google Slides deck; a file this app can't see throws DeckAccessError. */
  async getDeckInfo(
    fileId: string
  ): Promise<{ name: string; isSlides: boolean }> {
    const response = await this.ok(
      `${DRIVE_API_URL}/files/${encodeURIComponent(fileId)}?fields=name,mimeType&supportsAllDrives=true`
    );
    const data = (await response.json()) as {
      name?: unknown;
      mimeType?: unknown;
    };
    return {
      name: typeof data.name === 'string' ? data.name : '',
      isSlides: data.mimeType === 'application/vnd.google-apps.presentation',
    };
  }

  /** The deck's slide width over height, or null when Google can't say. Never throws. */
  async getDeckAspect(fileId: string): Promise<number | null> {
    try {
      const response = await this.send(
        `${SLIDES_API_URL}/${encodeURIComponent(fileId)}?fields=pageSize`
      );
      if (response.ok) {
        const data = (await response.json()) as { pageSize?: unknown };
        const aspect = aspectFromPageSize(data.pageSize);
        if (aspect !== null) return aspect;
      }
    } catch {
      // Falls through to the thumbnail.
    }
    try {
      const response = await this.send(
        `${DRIVE_API_URL}/files/${encodeURIComponent(fileId)}?fields=thumbnailLink&supportsAllDrives=true`
      );
      if (!response.ok) return null;
      const data = (await response.json()) as { thumbnailLink?: unknown };
      if (typeof data.thumbnailLink !== 'string') return null;
      return await imageAspect(largeThumbnail(data.thumbnailLink));
    } catch {
      return null;
    }
  }

  async getFileModifiedTime(fileId: string): Promise<number | null> {
    const response = await this.ok(
      `${DRIVE_API_URL}/files/${encodeURIComponent(fileId)}?fields=modifiedTime&supportsAllDrives=true`
    );
    const data = (await response.json()) as { modifiedTime?: unknown };
    const ms =
      typeof data.modifiedTime === 'string'
        ? Date.parse(data.modifiedTime)
        : NaN;
    return Number.isFinite(ms) ? ms : null;
  }
}

// Drive thumbnails end in a size like "=s220"; a bigger one gives a more exact shape.
export function largeThumbnail(link: string): string {
  return /=s\d+$/.test(link) ? link.replace(/=s\d+$/, '=s1600') : link;
}

function imageAspect(src: string): Promise<number | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => finish(null), THUMBNAIL_TIMEOUT_MS);
    function finish(value: number | null) {
      clearTimeout(timer);
      img.onload = null;
      img.onerror = null;
      resolve(value);
    }
    img.onload = () =>
      finish(
        img.naturalHeight > 0
          ? cleanAgendaAspect(img.naturalWidth / img.naturalHeight)
          : null
      );
    img.onerror = () => finish(null);
    img.referrerPolicy = 'no-referrer';
    img.src = src;
  });
}

/** D24 reading: a deck Drive refuses reads as 'unknown'; a sign-in or network failure gives null, so no check is written. */
export async function readDeckForCheck(
  drive: DeckSharingDrive,
  fileId: string,
  domain: string
): Promise<DeckState | null> {
  const [perms, modified] = await Promise.allSettled([
    drive.listFilePermissions(fileId),
    drive.getFileModifiedTime(fileId),
  ]);
  const refused = (r: PromiseSettledResult<unknown>) =>
    r.status === 'rejected' && r.reason instanceof DeckAccessError;
  if (
    (perms.status === 'rejected' && !refused(perms)) ||
    (modified.status === 'rejected' && !refused(modified))
  )
    return null;
  return {
    sharing:
      perms.status === 'fulfilled'
        ? deckSharingOf(perms.value, domain)
        : 'unknown',
    modifiedAt: modified.status === 'fulfilled' ? modified.value : null,
  };
}
