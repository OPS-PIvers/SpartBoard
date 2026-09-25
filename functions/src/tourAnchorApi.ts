// Private endpoint the tour-anchor-mapper routine reads and resolves (LIVE_TOURS_V2.md PR 3).
import { onRequest } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { TOUR_ANCHOR_API_TOKEN } from './secrets';
import {
  ANCHOR_ID_RE,
  DAY_MS,
  FINGERPRINT_RE,
  TOUR_ANCHOR_QUEUE,
} from './tourAnchorQueue';
import './functionsInit';

export const API_ITEM_CAP = 50;
export const STALE_PR_MS = 7 * DAY_MS;
export const MAX_RESOLUTIONS = 100;
const MAX_REASON = 500;
const PR_URL_RE = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+$/;

/** Constant-time bearer check; hashing both sides makes the buffers equal length. */
export function isAuthorized(
  header: string | undefined,
  token: string | undefined
): boolean {
  if (!token || !header?.startsWith('Bearer ')) return false;
  const given = createHash('sha256').update(header.slice(7)).digest();
  const want = createHash('sha256').update(token).digest();
  return timingSafeEqual(given, want);
}

type Stamp = { toMillis?: () => number } | undefined;

export interface QueueDoc {
  status?: unknown;
  updatedAt?: Stamp;
  firstSeenAt?: Stamp;
  reboundAt?: Stamp;
  [key: string]: unknown;
}

const STAMP_KEYS = new Set(['updatedAt', 'firstSeenAt', 'reboundAt']);

const millis = (t: Stamp) =>
  typeof t?.toMillis === 'function' ? t.toMillis() : 0;

/** Open items, plus PRs older than a week so abandoned ones are retried. */
export function selectOpenItems(
  docs: Array<{ id: string; data: QueueDoc }>,
  now: number
): Array<Record<string, unknown>> {
  return docs
    .filter(
      ({ data }) =>
        data.status === 'open' ||
        (data.status === 'pr-open' &&
          now - millis(data.updatedAt) > STALE_PR_MS)
    )
    .sort((a, b) => millis(a.data.firstSeenAt) - millis(b.data.firstSeenAt))
    .slice(0, API_ITEM_CAP)
    .map(({ id, data }) => ({
      ...Object.fromEntries(
        Object.entries(data).filter(([k]) => !STAMP_KEYS.has(k))
      ),
      fingerprint: id,
      firstSeenAt: new Date(millis(data.firstSeenAt)).toISOString(),
      updatedAt: new Date(millis(data.updatedAt)).toISOString(),
    }));
}

export interface Resolution {
  fingerprint: string;
  status: 'pr-open' | 'needs-human';
  anchorId?: string;
  prUrl?: string;
  reason?: string;
}

/** Validates a POST /resolve body into the only fields the routine may write. */
export function parseResolutions(
  body: unknown
): { ok: true; items: Resolution[] } | { ok: false; error: string } {
  if (!Array.isArray(body) || body.length === 0)
    return { ok: false, error: 'body must be a non-empty array' };
  if (body.length > MAX_RESOLUTIONS)
    return { ok: false, error: `at most ${MAX_RESOLUTIONS} items` };
  const items: Resolution[] = [];
  for (const [i, raw] of body.entries()) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const bad = (field: string) => ({
      ok: false as const,
      error: `item ${i}: invalid ${field}`,
    });
    if (
      typeof r.fingerprint !== 'string' ||
      !FINGERPRINT_RE.test(r.fingerprint)
    )
      return bad('fingerprint');
    if (r.status !== 'pr-open' && r.status !== 'needs-human')
      return bad('status');
    const item: Resolution = { fingerprint: r.fingerprint, status: r.status };
    if (r.anchorId !== undefined) {
      if (typeof r.anchorId !== 'string' || !ANCHOR_ID_RE.test(r.anchorId))
        return bad('anchorId');
      item.anchorId = r.anchorId;
    }
    if (r.prUrl !== undefined) {
      if (typeof r.prUrl !== 'string' || !PR_URL_RE.test(r.prUrl))
        return bad('prUrl');
      item.prUrl = r.prUrl;
    }
    if (r.reason !== undefined) {
      if (
        typeof r.reason !== 'string' ||
        !r.reason.trim() ||
        r.reason.length > MAX_REASON
      )
        return bad('reason');
      item.reason = r.reason.trim();
    }
    if (item.status === 'pr-open' && (!item.anchorId || !item.prUrl))
      return bad('pr-open (needs anchorId and prUrl)');
    if (item.status === 'needs-human' && !item.reason)
      return bad('needs-human (needs a reason)');
    items.push(item);
  }
  return { ok: true, items };
}

export const tourAnchorApi = onRequest(
  {
    invoker: 'public',
    secrets: [TOUR_ANCHOR_API_TOKEN],
    memory: '256MiB',
    timeoutSeconds: 30,
    maxInstances: 2,
  },
  async (req, res) => {
    const requestId = randomUUID();
    res.setHeader('X-Request-Id', requestId);
    if (
      !isAuthorized(req.headers.authorization, TOUR_ANCHOR_API_TOKEN.value())
    ) {
      res.status(401).json({ error: 'unauthenticated', requestId });
      return;
    }
    const db = admin.firestore();
    const path = req.path.replace(/\/+$/, '') || '/';
    try {
      if (req.method === 'GET' && path === '/') {
        const snap = await db
          .collection(TOUR_ANCHOR_QUEUE)
          .where('status', 'in', ['open', 'pr-open'])
          .get();
        const items = selectOpenItems(
          snap.docs.map((d) => ({ id: d.id, data: d.data() as QueueDoc })),
          Date.now()
        );
        res.json({
          project: process.env.GCLOUD_PROJECT ?? null,
          items,
          requestId,
        });
        return;
      }
      if (req.method === 'POST' && path === '/resolve') {
        const parsed = parseResolutions(req.body);
        if (!parsed.ok) {
          res.status(400).json({ error: parsed.error, requestId });
          return;
        }
        const refs = parsed.items.map((r) =>
          db.collection(TOUR_ANCHOR_QUEUE).doc(r.fingerprint)
        );
        const existing = await db.getAll(...refs);
        const batch = db.batch();
        const missing: string[] = [];
        parsed.items.forEach((r, i) => {
          if (!existing[i].exists) {
            missing.push(r.fingerprint);
            return;
          }
          batch.update(refs[i], {
            status: r.status,
            ...(r.anchorId ? { anchorId: r.anchorId } : {}),
            ...(r.prUrl ? { prUrl: r.prUrl } : {}),
            ...(r.reason ? { reason: r.reason } : {}),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        });
        const updated = parsed.items.length - missing.length;
        if (updated > 0) await batch.commit();
        logger.info('[tourAnchorApi] resolved', {
          requestId,
          updated,
          missing: missing.length,
        });
        res.json({ updated, missing, requestId });
        return;
      }
      res.status(404).json({ error: 'not-found', requestId });
    } catch (err) {
      logger.error('[tourAnchorApi] failed', { requestId, err });
      res.status(500).json({ error: 'internal', requestId });
    }
  }
);
