// Public tour links (TOURS_10X.md S6, ADR 0003): serves a public tour's Steps view without sign-in, and turns a link off when its pictures change.
import './functionsInit';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import * as admin from './firebaseAdmin';
import { isAiTeacherCaller, type AiCallerToken } from './aiCallerGate';
import { GL_TOURS_COLLECTION } from './glTours';
import { assertViewAsAllowed } from './viewAsGuard';
import {
  MAX_PUBLIC_PICTURE_BYTES,
  PUBLIC_LINKS_DOC,
  PUBLIC_LINKS_SUBCOLLECTION,
  PUBLIC_STEP_ID_RE,
  PUBLIC_TOKEN_RE,
  kindOf,
  parseLinkRecord,
  pictureFingerprint,
  publicTourOf,
  sniffImage,
  type PublicLinkOffReason,
  type PublicLinkRecord,
  type PublicTour,
} from './tourPublicLinkModel';

export const TOUR_STEPS_VIEW_FEATURE_ID = 'tour-steps-view';
const CONTROL_IDS = new Set(['_meta', '_lock']);

export interface PublicLinkDeps {
  findLink: (
    token: string
  ) => Promise<{ setId: string; record: PublicLinkRecord } | null>;
  /** The published copy's `set`, or null when the tour isn't published. */
  loadPublished: (setId: string) => Promise<unknown>;
  /** The confirming admin still has an /admins doc. */
  isAdmin: (email: string) => Promise<boolean>;
  /** The steps-view flag is on for that admin. */
  flagOn: (email: string) => Promise<boolean>;
  latchOff: (setId: string, reason: PublicLinkOffReason) => Promise<void>;
  bucket: string;
  /** The Storage object's current generation, or null when it is gone. */
  pictureGeneration: (path: string) => Promise<string | null>;
  /** That exact generation's bytes when it exists and fits the size cap; null otherwise. */
  readPicture: (path: string, generation: string) => Promise<Uint8Array | null>;
}

const latch = async (
  deps: PublicLinkDeps,
  setId: string,
  reason: PublicLinkOffReason
) => {
  // A failed latch still refuses this request; the next one tries again.
  await deps.latchOff(setId, reason).catch((err: unknown) => {
    logger.warn('[tourPublicLink] latch failed', { err: String(err) });
  });
};

/** The tour behind a token when every check passes; null for every refusal, so callers can't tell them apart. `only` limits the content check to one step's picture. */
export async function resolvePublicTour(
  token: unknown,
  deps: PublicLinkDeps,
  only?: string
) {
  if (typeof token !== 'string' || !PUBLIC_TOKEN_RE.test(token)) return null;
  const link = await deps.findLink(token);
  if (!link || link.record.off) return null;
  const { setId, record } = link;
  if (!(await deps.isAdmin(record.confirmedBy))) {
    await latch(deps, setId, 'confirmer');
    return null;
  }
  if (!(await deps.flagOn(record.confirmedBy))) return null;
  const published = await deps.loadPublished(setId);
  if (!published) return null;
  if (kindOf(published) !== record.kind) return null;
  // Not the pictures confirmed: refuse, and keep the link off even if they change back.
  if (pictureFingerprint(published) !== record.fingerprint) {
    await latch(deps, setId, 'pictures');
    return null;
  }
  const served = publicTourOf(setId, published, deps.bucket);
  if (!served) return null;
  // Same path, new bytes (an overwrite or delete-and-recreate) is a new generation: refused too.
  const paths =
    only === undefined
      ? [...served.sources.values()]
      : [served.sources.get(only)].filter((p): p is string => !!p);
  // A Storage error refuses this request without switching the link off; only a real mismatch latches.
  const current = await Promise.all(
    paths.map((p) => deps.pictureGeneration(p))
  );
  if (
    paths.some(
      (p, i) => !record.pictures[p] || current[i] !== record.pictures[p]
    )
  ) {
    await latch(deps, setId, 'pictures');
    return null;
  }
  return { setId, record, ...served };
}

export type PublicResponse =
  | { status: 200; tour: PublicTour }
  | { status: 200; picture: { bytes: Uint8Array; mime: string } }
  | { status: 404 };

/** One request: the tour (no `p`) or one step's picture (`p` = step id). */
export async function handlePublicRequest(
  query: { t?: unknown; p?: unknown },
  deps: PublicLinkDeps
): Promise<PublicResponse> {
  // Repeated or malformed parameters are refused before anything is read.
  if (typeof query.t !== 'string' || !PUBLIC_TOKEN_RE.test(query.t))
    return { status: 404 };
  let stepId: string | undefined;
  if (query.p !== undefined) {
    if (typeof query.p !== 'string' || !PUBLIC_STEP_ID_RE.test(query.p))
      return { status: 404 };
    stepId = query.p;
  }
  const resolved = await resolvePublicTour(query.t, deps, stepId).catch(
    (err: unknown) => {
      logger.error('[tourPublicLink] check failed', { err: String(err) });
      return null;
    }
  );
  if (!resolved) return { status: 404 };
  if (stepId === undefined) return { status: 200, tour: resolved.tour };
  const path = resolved.sources.get(stepId);
  if (!path) return { status: 404 };
  // Pinned to the confirmed generation, so bytes swapped in after the check above are never sent.
  const bytes = await deps
    .readPicture(path, resolved.record.pictures[path] ?? '')
    .catch(() => null);
  const mime = bytes ? sniffImage(bytes) : null;
  return bytes && mime
    ? { status: 200, picture: { bytes, mime } }
    : { status: 404 };
}

/** After a publish: a public link whose pictures no longer match what was confirmed is switched off. */
export async function guardPublicLink(
  setId: string,
  deps: Pick<PublicLinkDeps, 'loadPublished' | 'latchOff'> & {
    getLink: (setId: string) => Promise<PublicLinkRecord | null>;
  }
): Promise<'kept' | 'off' | 'none'> {
  const record = await deps.getLink(setId);
  if (!record || record.off) return 'none';
  const published = await deps.loadPublished(setId);
  if (!published) {
    await deps.latchOff(setId, 'unpublished');
    return 'off';
  }
  if (
    kindOf(published) === record.kind &&
    pictureFingerprint(published) === record.fingerprint
  )
    return 'kept';
  await deps.latchOff(setId, 'pictures');
  return 'off';
}

// Best-effort per-instance limits, as linkPreview.ts: not shared across instances, but enough to blunt scraping.
export const RATE_WINDOW_MS = 60_000;
export const RATE_PER_CLIENT = 600;
export const RATE_PER_INSTANCE = 3000;
const hits = new Map<string, number[]>();
let instanceHits: number[] = [];

/** The caller as the platform saw it: the last X-Forwarded-For hop is appended by Google's front end; earlier ones are the caller's to forge. */
export function clientKey(forwarded: unknown, ip: unknown): string {
  const hops = (typeof forwarded === 'string' ? forwarded : '')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);
  return hops.at(-1) ?? (typeof ip === 'string' && ip ? ip : 'unknown');
}

export function rateLimited(client: string, now: number): boolean {
  instanceHits = instanceHits.filter((t) => now - t < RATE_WINDOW_MS);
  if (instanceHits.length >= RATE_PER_INSTANCE) return true;
  const mine = (hits.get(client) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (mine.length >= RATE_PER_CLIENT) {
    hits.set(client, mine);
    return true;
  }
  mine.push(now);
  hits.set(client, mine);
  instanceHits.push(now);
  if (hits.size > 5000) hits.delete(hits.keys().next().value as string);
  return false;
}

export const __resetRateLimitForTests = () => {
  hits.clear();
  instanceHits = [];
};

const linksOf = (db: admin.firestore.Firestore) =>
  db.doc(PUBLIC_LINKS_DOC).collection(PUBLIC_LINKS_SUBCOLLECTION);

export function defaultPublicLinkDeps(
  db: admin.firestore.Firestore
): PublicLinkDeps & {
  getLink: (setId: string) => Promise<PublicLinkRecord | null>;
} {
  const bucket = admin.storage().bucket();
  return {
    async findLink(token) {
      const snap = await linksOf(db).where('token', '==', token).limit(2).get();
      // Two tours sharing a token is never expected; refuse rather than pick one.
      if (snap.size !== 1) return null;
      const record = parseLinkRecord(snap.docs[0].data());
      return record ? { setId: snap.docs[0].id, record } : null;
    },
    async getLink(setId) {
      const snap = await linksOf(db).doc(setId).get();
      return snap.exists ? parseLinkRecord(snap.data()) : null;
    },
    async loadPublished(setId) {
      const snap = await db.collection(GL_TOURS_COLLECTION).doc(setId).get();
      return snap.exists ? ((snap.get('set') as unknown) ?? null) : null;
    },
    async isAdmin(email) {
      return !!email && (await db.collection('admins').doc(email).get()).exists;
    },
    async flagOn(email) {
      const { isGlobalFeatureGranted } = await import('./quizMediaArchive');
      return isGlobalFeatureGranted(db, TOUR_STEPS_VIEW_FEATURE_ID, email, '');
    },
    async latchOff(setId, reason) {
      await linksOf(db)
        .doc(setId)
        .update({ off: { reason, at: Date.now() } });
    },
    bucket: bucket.name,
    async pictureGeneration(path) {
      try {
        const [meta] = await bucket.file(path).getMetadata();
        return meta.generation === undefined ? null : String(meta.generation);
      } catch (err) {
        if ((err as { code?: unknown }).code === 404) return null;
        throw err;
      }
    },
    async readPicture(path, generation) {
      const file = bucket.file(path, { generation });
      const [meta] = await file.getMetadata();
      if (Number(meta.size ?? 0) > MAX_PUBLIC_PICTURE_BYTES) return null;
      const [data] = await file.download();
      return new Uint8Array(data);
    },
  };
}

/** Headers every answer carries; a refusal is never cached, a success only briefly and only by the browser. */
export const OK_CACHE = 'private, max-age=60';
export const NOT_FOUND_CACHE = 'no-store';

// Served same-origin through the /api/tour-steps hosting rewrite, so no CORS headers are sent.
export const tourPublicStepsV1 = onRequest(
  {
    memory: '512MiB',
    timeoutSeconds: 30,
    invoker: 'public',
    maxInstances: 10,
    concurrency: 20,
  },
  async (req, res) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'no-referrer');
    if (req.method !== 'GET') {
      res.set('Allow', 'GET').status(405).end();
      return;
    }
    if (
      rateLimited(clientKey(req.get('x-forwarded-for'), req.ip), Date.now())
    ) {
      res.set('Cache-Control', NOT_FOUND_CACHE).set('Retry-After', '60');
      res.status(429).json({ error: 'busy' });
      return;
    }
    try {
      const out = await handlePublicRequest(
        { t: req.query.t, p: req.query.p },
        defaultPublicLinkDeps(admin.firestore())
      );
      if (out.status === 404) {
        res
          .set('Cache-Control', NOT_FOUND_CACHE)
          .status(404)
          .json({ error: 'not-found' });
      } else if ('tour' in out) {
        res.set('Cache-Control', OK_CACHE).status(200).json(out.tour);
      } else {
        res
          .set('Cache-Control', OK_CACHE)
          .set('Content-Type', out.picture.mime)
          .status(200)
          .send(Buffer.from(out.picture.bytes));
      }
    } catch (err) {
      logger.error('[tourPublicLink] failed', { err: String(err) });
      res
        .set('Cache-Control', NOT_FOUND_CACHE)
        .status(404)
        .json({ error: 'not-found' });
    }
  }
);

/** The web tour behind a live public link, for a staff caller; null for anyone else or any refusal. */
export async function startSetIdFor(
  token: unknown,
  isStaff: () => Promise<boolean>,
  deps: PublicLinkDeps
): Promise<string | null> {
  if (typeof token !== 'string' || !PUBLIC_TOKEN_RE.test(token)) return null;
  if (!(await isStaff())) return null;
  const resolved = await resolvePublicTour(token, deps).catch(() => null);
  return resolved?.record.kind === 'web' ? resolved.setId : null;
}

// The public response never names the set (ADR 0003), so Start tour on the public page asks for it signed in.
export const tourPublicLinkStartV1 = onCall(
  { memory: '256MiB', timeoutSeconds: 30, maxInstances: 10 },
  async (request) => {
    await assertViewAsAllowed(request, { read: true });
    if (!request.auth)
      throw new HttpsError('unauthenticated', 'Sign in required.');
    const db = admin.firestore();
    const token = request.auth.token as AiCallerToken;
    const setId = await startSetIdFor(
      (request.data as { token?: unknown } | null)?.token,
      () => isAiTeacherCaller(db, token),
      defaultPublicLinkDeps(db)
    );
    if (!setId) throw new HttpsError('not-found', 'Tour not found.');
    return { setId };
  }
);

export const tourPublicLinkGuard = onDocumentWritten(
  {
    document: `${GL_TOURS_COLLECTION}/{setId}`,
    memory: '256MiB',
    maxInstances: 10,
  },
  async (event) => {
    const { setId } = event.params;
    if (CONTROL_IDS.has(setId)) return;
    const result = await guardPublicLink(
      setId,
      defaultPublicLinkDeps(admin.firestore())
    );
    if (result === 'off')
      logger.info('[tourPublicLink] link off after publish', { setId });
  }
);
