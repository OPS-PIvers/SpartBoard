// Client ID Metadata Documents: Claude's client_id is an https URL on a Claude host that we fetch.
import type * as admin from '../firebaseAdmin';
import { STATUS_CACHE_MS, isAllowedRedirectUri } from './config';

type Firestore = admin.firestore.Firestore;

export interface CimdClient {
  redirectUris: string[];
  clientName: string;
}

/** Kill switch doc; the connector advertises and accepts CIMD only while `enabled` is true. */
export const CIMD_SETTINGS_PATH = 'admin_settings/claude_connector_cimd';

const CIMD_HOSTS = new Set(['claude.ai', 'claude.com']);
const DOC_CACHE_MS = 5 * 60 * 1000;
const MAX_DOC_BYTES = 16 * 1024;
const FETCH_TIMEOUT_MS = 3000;
const MAX_CACHED = 20;

let switchCache: { enabled: boolean; at: number } | null = null;
const docCache = new Map<string, { client: CimdClient; at: number }>();

/** Test hook: forget cached switch reads and documents. */
export function resetCimdCache(): void {
  switchCache = null;
  docCache.clear();
}

export async function isCimdEnabled(
  db: Firestore,
  now = Date.now()
): Promise<boolean> {
  if (switchCache && now - switchCache.at < STATUS_CACHE_MS) {
    return switchCache.enabled;
  }
  let enabled = false;
  try {
    const snap = await db.doc(CIMD_SETTINGS_PATH).get();
    enabled = snap.exists && snap.get('enabled') === true;
  } catch (err) {
    console.error('[cimd] switch read failed', err);
  }
  switchCache = { enabled, at: now };
  return enabled;
}

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
    url.pathname.length > 1 &&
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

export async function fetchCimdClient(
  clientId: string,
  now = Date.now()
): Promise<CimdClient | null> {
  if (!isCimdClientId(clientId)) return null;
  const cached = docCache.get(clientId);
  if (cached && now - cached.at < DOC_CACHE_MS) return cached.client;
  try {
    const res = await fetch(clientId, {
      redirect: 'error',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (text.length > MAX_DOC_BYTES) return null;
    const client = parseCimdDocument(clientId, JSON.parse(text) as unknown);
    if (!client) return null;
    if (docCache.size >= MAX_CACHED) docCache.clear();
    docCache.set(clientId, { client, at: now });
    return client;
  } catch (err) {
    console.warn('[cimd] fetch failed', { clientId, err });
    return null;
  }
}
