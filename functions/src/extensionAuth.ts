// Chrome extension sign-in checks, kept apart from web tours so focus and import don't load the tour tools.
export const DISTRICT_DOMAIN = 'orono.k12.mn.us';

// Each listing's "Chrome extension" OAuth client (H8). Keep equal to extension/src/listings.ts.
export const EXTENSION_OAUTH_CLIENTS: Record<string, string> = {
  spartboard:
    '759666600376-3588aon892pctctjtosfpurqksup9hk5.apps.googleusercontent.com',
  'spartboard-dev':
    '258543092004-9mfh4nls8a7edmift5dkh9l93jp7pdk1.apps.googleusercontent.com',
};

export class ExtensionCallError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** A machine-readable reason a newer extension can act on. */
    readonly code?: 'needs-update'
  ) {
    super(message);
  }
}

const fail = (status: number, message: string) =>
  new ExtensionCallError(status, message);

/** What Google's tokeninfo says about an access token. */
export interface TokenInfo {
  aud?: unknown;
  azp?: unknown;
  email?: unknown;
  email_verified?: unknown;
  expires_in?: unknown;
}

/** The signed-in staff member a token belongs to; its email is Google's, never the extension's. */
export interface ExtensionCaller {
  email: string;
  uid: string | null;
}

export interface ExtensionDeps {
  clientId: string;
  tokenInfo: (token: string) => Promise<TokenInfo | null>;
  uidForEmail: (email: string) => Promise<string | null>;
  allowed: (email: string, uid: string | null) => Promise<boolean>;
  isAdmin: (email: string) => Promise<boolean>;
}

export function bearerToken(header: unknown): string {
  const value = typeof header === 'string' ? header : '';
  const token = value.startsWith('Bearer ') ? value.slice(7).trim() : '';
  if (!token) throw fail(401, 'Sign in to Chrome with your Orono account.');
  return token;
}

/** Checks a token belongs to this listing's client and a verified address on `domain`; returns it lowercased. */
export async function verifiedTokenEmail(
  token: string,
  deps: Pick<ExtensionDeps, 'clientId' | 'tokenInfo'>,
  domain: string,
  message: string
): Promise<string> {
  // 502 reads as offline in the extension; a 401 would make it drop the token.
  const info = await deps.tokenInfo(token).catch(() => {
    throw fail(502, 'Google sign-in check is unavailable. Try again shortly.');
  });
  const email = typeof info?.email === 'string' ? info.email.toLowerCase() : '';
  if (
    !info ||
    info.aud !== deps.clientId ||
    (info.azp !== undefined && info.azp !== deps.clientId) ||
    !(Number(info.expires_in) > 0)
  )
    throw fail(401, message);
  if (String(info.email_verified) !== 'true' || !email.endsWith(`@${domain}`))
    throw fail(403, message);
  return email;
}

const TOKENINFO_TIMEOUT_MS = 5_000;

/** Google's tokeninfo for an access token, or null when Google refuses it; a slow answer throws. */
export async function fetchTokenInfo(token: string): Promise<TokenInfo | null> {
  const res = await fetch('https://oauth2.googleapis.com/tokeninfo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ access_token: token }).toString(),
    signal: AbortSignal.timeout(TOKENINFO_TIMEOUT_MS),
  });
  return res.ok ? ((await res.json()) as TokenInfo) : null;
}
