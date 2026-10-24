// SpartBoard's tour calls (docs/plans/WEB_TOURS_HELP_PANEL.md H7): a Google access token as the bearer, no Firebase.

/** Why a call failed, in words the side panel can show. */
export type ApiFailure =
  'signed-out' | 'no-access' | 'not-set-up' | 'not-found' | 'offline';

export type ApiResult<T> =
  { ok: true; value: T } | { ok: false; why: ApiFailure };

export interface ApiDeps {
  base: string;
  /** A cached token, or a fresh one when `interactive`; null when Chrome has none. */
  getToken: (interactive: boolean) => Promise<string | null>;
  dropToken: (token: string) => Promise<void>;
  fetch: typeof fetch;
}

const failureFor = (status: number): ApiFailure =>
  status === 401
    ? 'signed-out'
    : status === 403
      ? 'no-access'
      : status === 503
        ? 'not-set-up'
        : status === 404
          ? 'not-found'
          : 'offline';

/** Posts to one endpoint; a rejected token is dropped and fetched once more, since Chrome may have cached a revoked one. */
export async function callSpartBoard<T>(
  deps: ApiDeps,
  name: string,
  body: unknown,
  interactive = false
): Promise<ApiResult<T>> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await deps.getToken(interactive).catch(() => null);
    if (!token) return { ok: false, why: 'signed-out' };
    let res: Response;
    try {
      res = await deps.fetch(`${deps.base}/${name}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body ?? {}),
      });
    } catch {
      return { ok: false, why: 'offline' };
    }
    if (res.status === 401 && attempt === 0) {
      await deps.dropToken(token).catch(() => undefined);
      continue;
    }
    if (!res.ok) return { ok: false, why: failureFor(res.status) };
    try {
      return { ok: true, value: (await res.json()) as T };
    } catch {
      return { ok: false, why: 'offline' };
    }
  }
  return { ok: false, why: 'signed-out' };
}

/** The real Chrome token calls; `getAuthToken` throws before the listing has an OAuth client. */
export const chromeTokens: Pick<ApiDeps, 'getToken' | 'dropToken'> = {
  getToken: async (interactive) => {
    try {
      const result = await chrome.identity.getAuthToken({ interactive });
      return result.token ?? null;
    } catch {
      return null;
    }
  },
  dropToken: (token) => chrome.identity.removeCachedAuthToken({ token }),
};
