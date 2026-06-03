// Schoology LTI 1.3 — Assignment and Grade Services (AGS) client.
//
// Auth is OAuth2 client_credentials via a SIGNED JWT assertion (Schoology rejects
// HTTP Basic). We sign the assertion with the tool private key (toolKey.ts), trade
// it for a scoped bearer token, then POST scores to a line item.

import { signToolJwt } from './toolKey';

const ASSERTION_TYPE = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer';
const NET_TIMEOUT_MS = 15000;
// Refresh the cached bearer a full minute before expiry. The margin must exceed
// NET_TIMEOUT_MS (15s) so an in-flight score POST can't outlive the token it was
// issued under and 401 mid-request.
const TOKEN_REFRESH_MARGIN_MS = 60_000;

interface TokenCacheEntry {
  token: string;
  expiresAt: number;
}
const tokenCache = new Map<string, TokenCacheEntry>();

/** Test seam: clear the bearer-token cache. */
export function _resetAgsTokenCache(): void {
  tokenCache.clear();
}

export interface AgsTokenOptions {
  clientId: string;
  tokenUrl: string;
  privatePem: string;
  scopes: string[];
}

/**
 * Obtains a scoped AGS bearer token via client_credentials + JWT assertion.
 * Cached per scope-set until ~10s before expiry.
 */
export async function getAgsAccessToken(
  opts: AgsTokenOptions
): Promise<string> {
  // Key the cache by (client, token endpoint, scope-set) — not scope alone — so a
  // client_id or token-URL change never serves a token minted for a different
  // config from a warm instance.
  const scopeKey = opts.scopes.slice().sort().join(' ');
  const cacheKey = `${opts.clientId}\n${opts.tokenUrl}\n${scopeKey}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + TOKEN_REFRESH_MARGIN_MS)
    return cached.token;

  const assertion = await signToolJwt(opts.privatePem, {
    issuer: opts.clientId,
    subject: opts.clientId,
    audience: opts.tokenUrl,
    expiresInSec: 300,
  });

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_assertion_type: ASSERTION_TYPE,
    client_assertion: assertion,
    scope: opts.scopes.join(' '),
  });

  const res = await fetch(opts.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(NET_TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `AGS token exchange failed (${res.status}): ${text.slice(0, 300)}`
    );
  }
  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!json.access_token) {
    throw new Error('AGS token response missing access_token');
  }
  const ttlMs =
    (typeof json.expires_in === 'number' ? json.expires_in : 3600) * 1000;
  tokenCache.set(cacheKey, {
    token: json.access_token,
    expiresAt: Date.now() + ttlMs,
  });
  return json.access_token;
}

/** AGS scores endpoint = the line item URL + `/scores`, before any query string. */
export function scoresUrl(lineitemUrl: string): string {
  const q = lineitemUrl.indexOf('?');
  const query = q < 0 ? '' : lineitemUrl.slice(q);
  // Strip any trailing slash(es) on the path so a line item URL that ends in `/`
  // yields `.../lineitem/scores`, not a 404-prone `.../lineitem//scores`.
  const base = (q < 0 ? lineitemUrl : lineitemUrl.slice(0, q)).replace(
    /\/+$/,
    ''
  );
  return `${base}/scores${query}`;
}

export interface AgsScore {
  /** The LTI `sub` of the student (the platform user id). */
  userId: string;
  scoreGiven: number;
  scoreMaximum: number;
  comment?: string;
}

/**
 * Posts a score to a line item. For an autograded quiz we always report
 * Completed + FullyGraded. Returns the HTTP status (caller maps to per-student
 * results); never throws on a non-2xx (returns ok:false instead).
 */
export async function postScore(opts: {
  lineitemUrl: string;
  accessToken: string;
  score: AgsScore;
  timestamp: string;
}): Promise<{ ok: boolean; status: number }> {
  const payload = {
    userId: opts.score.userId,
    scoreGiven: opts.score.scoreGiven,
    scoreMaximum: opts.score.scoreMaximum,
    activityProgress: 'Completed',
    gradingProgress: 'FullyGraded',
    timestamp: opts.timestamp,
    ...(opts.score.comment ? { comment: opts.score.comment } : {}),
  };
  try {
    const res = await fetch(scoresUrl(opts.lineitemUrl), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.accessToken}`,
        'Content-Type': 'application/vnd.ims.lis.v1.score+json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(NET_TIMEOUT_MS),
    });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}
