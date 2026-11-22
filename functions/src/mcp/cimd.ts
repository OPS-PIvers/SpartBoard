// Client ID Metadata Documents: Claude's client_id is an https URL on a Claude host that we fetch.
import type * as admin from '../firebaseAdmin';
import { isAllowedRedirectUri } from './config';
import { CIMD_SETTINGS_PATH, isSwitchOn, resetSwitchCache } from './switches';
import { safeErr } from '../safeLog';

type Firestore = admin.firestore.Firestore;

export interface CimdClient {
  redirectUris: string[];
  clientName: string;
}

const CIMD_HOSTS = new Set(['claude.ai', 'claude.com']);
// The metadata documents Claude publishes; any other path on a Claude host is never fetched.
const CIMD_PATHS = new Set([
  '/oauth/claude-code-client-metadata',
  '/oauth/mcp-oauth-client-metadata',
]);
const DOC_CACHE_MS = 5 * 60 * 1000;
// A failed fetch is remembered briefly so token retries don't refetch the document each time.
const FAIL_CACHE_MS = 30 * 1000;
const MAX_DOC_BYTES = 16 * 1024;
const FETCH_TIMEOUT_MS = 3000;
const MAX_CACHED = 20;
// A failed refetch serves the last good document for at most this long.
const MAX_STALE_MS = 60 * 60 * 1000;

const docCache = new Map<
  string,
  { client: CimdClient | null; expires: number; goodAt: number }
>();

/** Test hook: forget cached switch reads and documents. */
export function resetCimdCache(): void {
  resetSwitchCache();
  docCache.clear();
}

/** The connector advertises and accepts CIMD only while this switch is on. */
export const isCimdEnabled = (db: Firestore, now = Date.now()) =>
  isSwitchOn(db, CIMD_SETTINGS_PATH, now);

/** A client_id that names a metadata document we are willing to fetch. */
export function isCimdClientId(clientId: string): boolean {
  let url: URL;
  try {
    url = new URL(clientId);
  } catch {
    return false;
  }
  return (
    url.protocol === 'https:' &&
    CIMD_HOSTS.has(url.host) &&
    CIMD_PATHS.has(url.pathname) &&
    !url.search &&
    !url.hash &&
    !url.username &&
    !url.password &&
    url.href === clientId
  );
}

export function parseCimdDocument(
  clientId: string,
  raw: unknown
): CimdClient | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const doc = raw as Record<string, unknown>;
  if (doc.client_id !== clientId) return null;
  const method = doc.token_endpoint_auth_method;
  if (method !== undefined && method !== 'none') return null;
  const redirectUris = Array.isArray(doc.redirect_uris)
    ? doc.redirect_uris.filter(
        (u): u is string => typeof u === 'string' && isAllowedRedirectUri(u)
      )
    : [];
  if (redirectUris.length === 0) return null;
  const name =
    typeof doc.client_name === 'string' && doc.client_name.trim()
      ? doc.client_name.trim().slice(0, 80)
      : 'Claude';
  return { redirectUris, clientName: name };
}

/** Body text, or null once it passes MAX_DOC_BYTES; stops reading at the cap. */
async function readCappedText(res: Response): Promise<string | null> {
  if (!res.body) return null;
  const reader = (res.body as ReadableStream<Uint8Array>).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_DOC_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function fetchCimdClient(
  clientId: string,
  now = Date.now()
): Promise<CimdClient | null> {
  if (!isCimdClientId(clientId)) return null;
  const cached = docCache.get(clientId);
  if (cached && now < cached.expires) return cached.client;
  const fresh = await loadCimdClient(clientId);
  // Stale-if-error: a failed refetch keeps serving the last good document, up to MAX_STALE_MS.
  const stale =
    cached && now - cached.goodAt < MAX_STALE_MS ? cached.client : null;
  const client = fresh ?? stale;
  if (docCache.size >= MAX_CACHED) docCache.clear();
  docCache.set(clientId, {
    client,
    expires: now + (fresh ? DOC_CACHE_MS : FAIL_CACHE_MS),
    goodAt: fresh ? now : stale && cached ? cached.goodAt : 0,
  });
  return client;
}

async function loadCimdClient(clientId: string): Promise<CimdClient | null> {
  try {
    const res = await fetch(clientId, {
      redirect: 'error',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const text = await readCappedText(res);
    if (text === null) return null;
    return parseCimdDocument(clientId, JSON.parse(text) as unknown);
  } catch (err) {
    console.warn('[cimd] fetch failed', { clientId, err: safeErr(err) });
    return null;
  }
}
