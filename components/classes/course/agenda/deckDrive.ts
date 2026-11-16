// Drive calls for an Agenda deck: a 403 here means "not yours to share", not a lost sign-in, so it never fires the sign-in toast.
import { authError } from '@/utils/driveAuthErrors';
import type { DrivePermission } from '@/utils/googleDriveService';
import type { DeckSharingDrive } from '@/utils/course/deckSharing';

const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3';
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
  constructor(reason: DeckAccessReason, detail: string) {
    super(detail);
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
    if (
      reasons.some((r) =>
        /policy|publishOutNotPermitted|cannotShare|sharingRestricted/i.test(r)
      )
    ) {
      return new DeckAccessError('policy', body.slice(0, 200));
    }
    return new DeckAccessError('no-access', body.slice(0, 200));
  }
  if (status === 404) return new DeckAccessError('not-found', '');
  return new Error(`Drive request failed: ${status} ${body.slice(0, 200)}`);
}

export class DeckDrive implements DeckSharingDrive {
  private token: string;
  private readonly refresh: () => Promise<string | null>;

  constructor(token: string, refresh: () => Promise<string | null>) {
    this.token = token;
    this.refresh = refresh;
  }

  private async send(url: string, init: RequestInit = {}): Promise<Response> {
    const attempt = async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        return await fetch(url, {
          ...init,
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
    };
    let response = await attempt();
    if (response.status === 401) {
      const next = await this.refresh();
      if (next) {
        this.token = next;
        response = await attempt();
      }
    }
    return response;
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
