// F5: data-free Web Push "check now" wake-ups to students' extensions after a teacher changes a session.
import {
  createECDH,
  createPrivateKey,
  sign,
  type KeyObject,
} from 'node:crypto';
import type * as admin from '../firebaseAdmin';
import { GoogleAuth } from 'google-auth-library';
import { FOCUS_PUSH_COLLECTION } from './shared.gen';

type Firestore = admin.firestore.Firestore;

/** Secret Manager secret holding the base64url P-256 private key; read at run time so a project without it still deploys. */
export const FOCUS_VAPID_SECRET = 'FOCUS_VAPID_PRIVATE_KEY';
const VAPID_SUBJECT = 'https://spartboard.web.app';
// Must match the hosts FS4 accepts when it stores a subscription.
const PUSH_HOSTS = new Set(['fcm.googleapis.com', 'android.googleapis.com']);
/** A wake older than this is useless; the 5-minute check covers a device that was offline. */
const PUSH_TTL_SECONDS = 60;
const SEND_TIMEOUT_MS = 5_000;
/** The most a wake may add to a teacher's action or the sweep. */
const WAKE_DEADLINE_MS = 4_000;
const KEY_RETRY_MS = 60_000;
const SEND_CONCURRENCY = 50;
const GET_ALL_CHUNK = 100;
const KEY_CACHE_MS = 10 * 60_000;
const JWT_LIFETIME_S = 12 * 3600;
const JWT_REUSE_MS = 60 * 60_000;

export interface VapidKey {
  privateKey: KeyObject;
  /** Uncompressed P-256 point, base64url, as the extension's `applicationServerKey`. */
  publicKey: string;
}

const b64url = (buf: Buffer) => buf.toString('base64url');

/** Builds the signing key from a base64url 32-byte private scalar, or null when the value isn't one. */
export function parseVapidPrivateKey(raw: string): VapidKey | null {
  const bytes = Buffer.from(raw.trim(), 'base64url');
  if (
    bytes.length < 16 ||
    bytes.length > 32 ||
    b64url(bytes) !== raw.trim().replace(/=+$/, '')
  )
    return null;
  // Node's getPrivateKey drops leading zero bytes, so a short scalar is still a valid key.
  const d = Buffer.concat([Buffer.alloc(32 - bytes.length), bytes]);
  try {
    const ecdh = createECDH('prime256v1');
    ecdh.setPrivateKey(d);
    const point = ecdh.getPublicKey();
    const privateKey = createPrivateKey({
      key: {
        kty: 'EC',
        crv: 'P-256',
        d: b64url(d),
        x: b64url(point.subarray(1, 33)),
        y: b64url(point.subarray(33, 65)),
      },
      format: 'jwk',
    });
    return { privateKey, publicKey: b64url(point) };
  } catch {
    return null;
  }
}

/** RFC 8292 ES256 JWT for one push service origin. */
export function vapidJwt(key: VapidKey, audience: string, nowMs: number) {
  const header = b64url(
    Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))
  );
  const claims = b64url(
    Buffer.from(
      JSON.stringify({
        aud: audience,
        exp: Math.floor(nowMs / 1000) + JWT_LIFETIME_S,
        sub: VAPID_SUBJECT,
      })
    )
  );
  const input = `${header}.${claims}`;
  const signature = sign('sha256', Buffer.from(input), {
    key: key.privateKey,
    dsaEncoding: 'ieee-p1363',
  });
  return `${input}.${b64url(signature)}`;
}

/** The origin to send to, or null for anything but Chrome's push service over https. */
export function pushAudience(endpoint: unknown): string | null {
  if (typeof endpoint !== 'string' || endpoint.length > 2048) return null;
  try {
    const url = new URL(endpoint);
    if (
      url.protocol !== 'https:' ||
      url.port !== '' ||
      url.username !== '' ||
      url.password !== '' ||
      !PUSH_HOSTS.has(url.hostname)
    )
      return null;
    return url.origin;
  } catch {
    return null;
  }
}

export interface FocusPushDeps {
  now: () => number;
  /** The project's VAPID key, or null when none is set (devices then only poll). */
  vapidKey: () => Promise<VapidKey | null>;
  fetch: typeof fetch;
}

export interface FocusWakeResult {
  sent: number;
  dropped: number;
  failed: number;
}

async function eachLimited<T>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<void>
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await run(items[next++]);
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker)
  );
}

/** Wakes each student's devices; never throws, so a push problem can't fail the teacher's action. */
export async function wakeFocusStudents(
  db: Firestore,
  studentUids: readonly string[],
  deps: FocusPushDeps
): Promise<FocusWakeResult> {
  const result: FocusWakeResult = { sent: 0, dropped: 0, failed: 0 };
  const uids = [...new Set(studentUids)];
  if (uids.length === 0) return result;
  const deadline = AbortSignal.timeout(WAKE_DEADLINE_MS);
  const expired = new Promise<'expired'>((resolve) =>
    deadline.addEventListener('abort', () => resolve('expired'), {
      once: true,
    })
  );
  const work = sendWakes(db, uids, deps, result, deadline);
  if ((await Promise.race([work, expired])) === 'expired') {
    result.failed += 1;
    console.log('[focusPush] wake hit its deadline');
  }
  if (result.failed || result.dropped) console.log('[focusPush]', result);
  return result;
}

async function sendWakes(
  db: Firestore,
  uids: readonly string[],
  deps: FocusPushDeps,
  result: FocusWakeResult,
  deadline: AbortSignal
): Promise<void> {
  try {
    const key = await deps.vapidKey();
    if (!key) return;
    const col = db.collection(FOCUS_PUSH_COLLECTION);
    const subs: {
      ref: admin.firestore.DocumentReference;
      endpoint: string;
      audience: string;
    }[] = [];
    for (let i = 0; i < uids.length; i += GET_ALL_CHUNK) {
      const refs = uids.slice(i, i + GET_ALL_CHUNK).map((u) => col.doc(u));
      for (const snap of await db.getAll(...refs)) {
        const endpoint: unknown = snap.data()?.endpoint;
        const audience = pushAudience(endpoint);
        if (audience)
          subs.push({ ref: snap.ref, endpoint: endpoint as string, audience });
      }
    }
    const jwts = new Map<string, string>();
    const now = deps.now();
    await eachLimited(subs, SEND_CONCURRENCY, async (sub) => {
      if (deadline.aborted) return;
      let jwt = jwts.get(sub.audience);
      if (!jwt) {
        jwt = cachedJwt(key, sub.audience, now);
        jwts.set(sub.audience, jwt);
      }
      try {
        const res = await deps.fetch(sub.endpoint, {
          method: 'POST',
          headers: {
            TTL: String(PUSH_TTL_SECONDS),
            Urgency: 'high',
            Authorization: `vapid t=${jwt}, k=${key.publicKey}`,
          },
          redirect: 'error',
          signal: AbortSignal.any([
            deadline,
            AbortSignal.timeout(SEND_TIMEOUT_MS),
          ]),
        });
        if (res.ok) {
          result.sent += 1;
        } else if (res.status === 404 || res.status === 410) {
          result.dropped += 1;
          await dropIfUnchanged(db, sub.ref, sub.endpoint);
        } else {
          result.failed += 1;
        }
      } catch {
        result.failed += 1;
      }
    });
  } catch (err) {
    console.error('[focusPush] wake failed', (err as Error)?.name ?? 'Error');
    result.failed += 1;
  }
}

/** A device may have re-subscribed while the send was out; keep the newer subscription. */
async function dropIfUnchanged(
  db: Firestore,
  ref: admin.firestore.DocumentReference,
  endpoint: string
): Promise<void> {
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists && snap.data()?.endpoint === endpoint) tx.delete(ref);
  });
}

const jwtCache = new Map<
  string,
  { jwt: string; at: number; publicKey: string }
>();

function cachedJwt(key: VapidKey, audience: string, now: number): string {
  const hit = jwtCache.get(audience);
  if (hit && hit.publicKey === key.publicKey && now - hit.at < JWT_REUSE_MS)
    return hit.jwt;
  const jwt = vapidJwt(key, audience, now);
  jwtCache.set(audience, { jwt, at: now, publicKey: key.publicKey });
  return jwt;
}

let keyCache: { key: VapidKey | null; at: number } | null = null;
let auth: GoogleAuth | null = null;

/** Reads the latest secret version; a missing secret or access grant means push is off, not an error. */
export async function loadVapidKeyFromSecretManager(
  now: number
): Promise<VapidKey | null> {
  if (keyCache && now - keyCache.at < KEY_CACHE_MS) return keyCache.key;
  const project = process.env.GCLOUD_PROJECT;
  let key: VapidKey | null = null;
  if (project) {
    auth ??= new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    try {
      const client = await auth.getClient();
      const res = await client.request<{ payload?: { data?: string } }>({
        url: `https://secretmanager.googleapis.com/v1/projects/${project}/secrets/${FOCUS_VAPID_SECRET}/versions/latest:access`,
        timeout: SEND_TIMEOUT_MS,
      });
      const data = res.data.payload?.data;
      key = data
        ? parseVapidPrivateKey(Buffer.from(data, 'base64').toString('utf8'))
        : null;
      if (!key) console.error('[focusPush] VAPID secret is not a P-256 key');
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response
        ?.status;
      // 403/404: the secret or its grant isn't set up yet; devices fall back to their 5-minute check.
      if (status !== 403 && status !== 404) {
        console.error('[focusPush] VAPID secret read failed', status ?? '');
        // Keep the last good key through a Secret Manager hiccup, and retry in a minute.
        const stale = keyCache?.key ?? null;
        keyCache = { key: stale, at: now - KEY_CACHE_MS + KEY_RETRY_MS };
        return stale;
      }
    }
  }
  keyCache = { key, at: now };
  return key;
}

export const liveFocusPushDeps: FocusPushDeps = {
  now: () => Date.now(),
  vapidKey: () => loadVapidKeyFromSecretManager(Date.now()),
  fetch: (...args) => fetch(...args),
};
