// Server reads of the connector's `admin_settings` kill switches; only an explicit true turns one on.
import type * as admin from '../firebaseAdmin';
import { STATUS_CACHE_MS } from './config';

type Firestore = admin.firestore.Firestore;

export const CIMD_SETTINGS_PATH = 'admin_settings/claude_connector_cimd';
export const MANAGED_AUTH_SETTINGS_PATH = 'admin_settings/claude_managed_auth';

const cache = new Map<string, { enabled: boolean; at: number }>();

/** Test hook: forget cached switch reads. */
export function resetSwitchCache(): void {
  cache.clear();
}

export async function isSwitchOn(
  db: Firestore,
  path: string,
  now = Date.now()
): Promise<boolean> {
  const hit = cache.get(path);
  if (hit && now - hit.at < STATUS_CACHE_MS) return hit.enabled;
  let enabled = false;
  try {
    const snap = await db.doc(path).get();
    enabled = snap.exists && snap.get('enabled') === true;
  } catch (err) {
    console.error('[switches] read failed', { path, err });
  }
  cache.set(path, { enabled, at: now });
  return enabled;
}
