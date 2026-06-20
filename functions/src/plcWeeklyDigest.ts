/**
 * Opt-in weekly PLC activity digest (Wave 4 — PRD §5 / §8 / §2.3, Decision 2.3).
 *
 * A scheduled (weekly) `onSchedule` function that, for every PLC that has
 * opted in (`digestOptIn === true` on the root doc, default OFF), reads the
 * PLC's `activity` log for the past 7 days, composes ONE shared digest summary,
 * and queues a SINGLE `/mail` doc per PLC addressed to ALL current member
 * emails. There is deliberately NO per-member fan-out (§8): one summary, one
 * mail doc, one `to: [...]` recipient list. The `firestore-send-email`
 * extension delivers the single message to every address.
 *
 * Two independent OFF-by-default gates must BOTH be satisfied for a PLC to
 * receive a digest:
 *
 *   1. A global kill switch at `/global_permissions/plc-digest.enabled`,
 *      loaded EXACTLY like `loadInviteEmailConfig` in `plcInviteEmails.ts`
 *      (missing doc / missing field ⇒ `false`). This is a SEPARATE flag from
 *      the invite-email switch (`invite-emails.enabled`) so an operator can
 *      enable transactional invites without also broadcasting digests.
 *
 *   2. A per-PLC `digestOptIn` flag on the PLC root doc (default `false`). Any
 *      PLC member may toggle it via the `isUpdatingPlcDigestOptIn()` rules
 *      branch (mirroring `isUpdatingPlcFeatures`).
 *
 * Security: `/mail/*` writes are denied to clients in `firestore.rules`; the
 * Admin SDK inside this function is the only path that can create these docs,
 * which is why the `firestore-send-email` extension is safe to point at a
 * user-readable collection.
 *
 * Template helpers (`escapeHtml`, `buildPlcDigestEmail`, `MailDoc`) mirror
 * `buildPlcInvitationEmail` rather than importing it, so the two pipelines stay
 * independent — each can evolve its own template without breaking the other.
 * They are exported for unit-test coverage.
 *
 * Cost posture (§5/§8): a BOUNDED collection scan with batched per-PLC reads.
 * memory / maxInstances / timeZone are pinned so the weekly job can never fan
 * out or monopolise the scheduler slot.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';
import './functionsInit';

// ───────────────────────── tunables (per-run caps) ─────────────────────────

/** Digest window — the trailing 7 days of activity. */
export const DIGEST_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Max PLCs visited per run — keeps one sweep from monopolising the slot. */
export const MAX_PLCS_PER_RUN = 1000;

/** Max activity events scanned per PLC per run (bounded read). */
export const MAX_ACTIVITY_PER_PLC = 500;

/** Max event lines rendered in a single digest body (the long tail is summarised by count). */
export const MAX_DIGEST_LINES = 25;

// ───────────────────────── types (local — no shared tsconfig) ──────────────

export interface DigestEmailConfig {
  enabled: boolean;
  from?: string;
  replyTo?: string;
}

export interface MailDoc {
  to: string[];
  from?: string;
  replyTo?: string;
  message: {
    subject: string;
    text: string;
    html: string;
  };
}

/** A single PLC activity event, as written by `writePlcActivityEvent`. */
export interface DigestActivityEvent {
  type: string;
  actorName: string;
  targetTitle?: string;
  createdAt: number;
}

// ───────────────────────── pure helpers (exported for tests) ───────────────

export function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Tolerant millis extraction (mirrors `gcPlcOrphans.toMillis`). Accepts a
 * Firestore `Timestamp` (has `.toMillis()`), a raw number (legacy rollout
 * value), or anything else (treated as 0). Returns 0 for null/undefined/
 * malformed so a missing timestamp never throws inside the digest reader.
 */
export function toMillis(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as { toMillis?: unknown }).toMillis === 'function'
  ) {
    const ms = (value as { toMillis: () => unknown }).toMillis();
    return typeof ms === 'number' && Number.isFinite(ms) ? ms : 0;
  }
  return 0;
}

/** A PLC has opted in only when `digestOptIn` is the literal boolean `true`. */
export function isDigestOptIn(plc: { digestOptIn?: unknown }): boolean {
  return plc.digestOptIn === true;
}

/**
 * An activity event is in-window when its `createdAt` falls within the trailing
 * `windowMs` ending at `now`. Future-dated and pre-window events are excluded.
 */
export function isWithinDigestWindow(
  createdAt: unknown,
  now: number,
  windowMs: number = DIGEST_WINDOW_MS
): boolean {
  const ms = toMillis(createdAt);
  if (ms <= 0) return false;
  return ms > now - windowMs && ms <= now;
}

/** Human-readable label for an activity event type (falls back to the raw type). */
const EVENT_LABELS: Record<string, string> = {
  member_joined: 'joined the PLC',
  member_left: 'left the PLC',
  role_changed: 'changed a member role',
  assessment_created: 'created an assessment',
  assessment_shared: 'shared an assessment',
  assessment_results_ready: 'has results ready for an assessment',
  meeting_held: 'logged a meeting',
  note_created: 'added a note',
  comment_added: 'left a comment',
  item_deleted: 'deleted an item',
  item_restored: 'restored an item',
};

export function describeDigestEvent(event: DigestActivityEvent): string {
  const verb = EVENT_LABELS[event.type] ?? event.type.replace(/_/g, ' ');
  const actor = event.actorName.trim() || 'A member';
  const target = event.targetTitle?.trim();
  return target ? `${actor} ${verb}: ${target}` : `${actor} ${verb}`;
}

/**
 * Compose the shared digest email body from the in-window events. Newest-first.
 * The long tail beyond `MAX_DIGEST_LINES` is summarised by count so a busy PLC
 * doesn't get a wall of text. Callers only invoke this when `events` is
 * non-empty (an empty week queues no mail at all).
 */
export function buildPlcDigestEmail(opts: {
  plcName: string;
  events: DigestActivityEvent[];
}): { subject: string; text: string; html: string } {
  const { plcName, events } = opts;
  const sorted = [...events].sort((a, b) => b.createdAt - a.createdAt);
  const shown = sorted.slice(0, MAX_DIGEST_LINES);
  const overflow = sorted.length - shown.length;
  const count = sorted.length;

  const subject =
    count === 1
      ? `1 update this week in "${plcName}"`
      : `${count} updates this week in "${plcName}"`;

  const lines = shown.map((e) => describeDigestEvent(e));
  const textLines = [
    `Here's what happened in your Professional Learning Community "${plcName}" this past week.`,
    '',
    ...lines.map((l) => `• ${l}`),
  ];
  if (overflow > 0) {
    textLines.push(`…and ${overflow} more update${overflow === 1 ? '' : 's'}.`);
  }
  textLines.push(
    '',
    'You are receiving this because your PLC opted in to the weekly digest. A PLC member can turn it off in PLC Settings.'
  );
  const text = textLines.join('\n');

  const safePlc = escapeHtml(plcName);
  const itemHtml = lines
    .map(
      (l) =>
        `<tr><td style="padding:6px 0;color:#334155;font-size:14px;line-height:1.5;border-bottom:1px solid #f1f5f9;">${escapeHtml(
          l
        )}</td></tr>`
    )
    .join('');
  const overflowHtml =
    overflow > 0
      ? `<tr><td style="padding:8px 0 0 0;color:#64748b;font-size:13px;">…and ${overflow} more update${
          overflow === 1 ? '' : 's'
        }.</td></tr>`
      : '';

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 0;">
      <tr><td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;padding:32px;">
          <tr><td style="padding:0 0 8px 0;">
            <div style="font-size:20px;font-weight:600;color:#1d2a5d;">Your weekly PLC digest</div>
          </td></tr>
          <tr><td style="padding:0 0 16px 0;color:#334155;font-size:15px;line-height:1.5;">
            Here's what happened in <strong>${safePlc}</strong> this past week.
          </td></tr>
          <tr><td>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              ${itemHtml}
              ${overflowHtml}
            </table>
          </td></tr>
          <tr><td style="padding:24px 0 0 0;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:12px;line-height:1.5;">
            You are receiving this because your PLC opted in to the weekly digest. A PLC member can turn it off in PLC Settings.
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  return { subject, text, html };
}

// ───────────────────────── Firestore helpers ───────────────────────────────

type Firestore = admin.firestore.Firestore;

/**
 * Reads the digest kill switch from `/global_permissions/plc-digest`. Missing
 * doc / missing `enabled` field defaults to `false` so the digest never sends
 * accidentally — an operator has to opt-in explicitly. Loaded EXACTLY like
 * `loadInviteEmailConfig` in `plcInviteEmails.ts`, against a SEPARATE doc id so
 * the two switches are independent.
 */
export async function loadDigestConfig(
  db: Firestore
): Promise<DigestEmailConfig> {
  const snap = await db
    .collection('global_permissions')
    .doc('plc-digest')
    .get();
  if (!snap.exists) return { enabled: false };
  const data = snap.data() ?? {};
  return {
    enabled: data.enabled === true,
    from: typeof data.from === 'string' ? data.from : undefined,
    replyTo: typeof data.replyTo === 'string' ? data.replyTo : undefined,
  };
}

/** Lowercased, de-duplicated, valid recipient list for a PLC root doc. */
export function collectRecipientEmails(plc: {
  memberEmails?: unknown;
  members?: unknown;
  memberUids?: unknown;
}): string[] {
  const out = new Set<string>();
  const add = (raw: unknown) => {
    if (typeof raw !== 'string') return;
    const email = raw.trim().toLowerCase();
    if (email.includes('@')) out.add(email);
  };
  // Denormalized index of CURRENT (active) member uids — maintained active-only
  // since Wave 1. Used to filter the legacy memberEmails mirror so a removed
  // teacher still lingering there (un-migrated PLC) is never emailed. Null when
  // absent (cannot filter — fall back to all, the legacy-of-legacy case).
  const activeMemberUids = Array.isArray(plc.memberUids)
    ? new Set(plc.memberUids as string[])
    : null;
  // Prefer the canonical members map (carries email); fall back to the
  // denormalized memberEmails mirror for legacy PLCs.
  const members = plc.members;
  if (members && typeof members === 'object') {
    for (const member of Object.values(members as Record<string, unknown>)) {
      if (member && typeof member === 'object') {
        // Removed members keep an audit entry in the map (status 'removed')
        // but must NOT receive the digest — only active members are recipients.
        if ((member as { status?: unknown }).status === 'removed') continue;
        add((member as { email?: unknown }).email);
      }
    }
  }
  const memberEmails = plc.memberEmails;
  if (memberEmails && typeof memberEmails === 'object') {
    for (const [uid, email] of Object.entries(
      memberEmails as Record<string, unknown>
    )) {
      // Skip emails whose uid is no longer an active member (defends the
      // legacy/un-migrated path; the members-map path above filters by status).
      if (activeMemberUids && !activeMemberUids.has(uid)) continue;
      add(email);
    }
  }
  return [...out].sort();
}

/**
 * Read up to `MAX_ACTIVITY_PER_PLC` recent activity events for a PLC and return
 * the in-window subset, mapped to the digest event shape. Bounded read — the
 * activity feed is append-only and GC-trimmed to ~90 days, so a single bounded
 * page comfortably covers a 7-day window.
 */
async function readWindowedActivity(
  plcRef: admin.firestore.DocumentReference,
  now: number
): Promise<DigestActivityEvent[]> {
  const snap = await plcRef
    .collection('activity')
    .orderBy('createdAt', 'desc')
    .limit(MAX_ACTIVITY_PER_PLC)
    .get();
  const events: DigestActivityEvent[] = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    if (!isWithinDigestWindow(data.createdAt, now)) continue;
    if (typeof data.type !== 'string') continue;
    events.push({
      type: data.type,
      actorName: typeof data.actorName === 'string' ? data.actorName : '',
      targetTitle:
        typeof data.targetTitle === 'string' ? data.targetTitle : undefined,
      createdAt: toMillis(data.createdAt),
    });
  }
  return events;
}

interface DigestRunCounts {
  plcsConsidered: number;
  optedIn: number;
  mailQueued: number;
  skippedNoActivity: number;
  skippedNoRecipients: number;
}

/**
 * Core sweep, extracted from the scheduler wrapper so it can be exercised
 * directly in tests against a stub / emulator Firestore without invoking
 * `onSchedule`. Bounded PLC scan; one mail doc per opted-in PLC with activity.
 */
export async function runPlcWeeklyDigest(
  db: Firestore,
  now: number = Date.now()
): Promise<DigestRunCounts> {
  const counts: DigestRunCounts = {
    plcsConsidered: 0,
    optedIn: 0,
    mailQueued: 0,
    skippedNoActivity: 0,
    skippedNoRecipients: 0,
  };

  // Global kill switch — default OFF. When disabled, no mail is queued at all.
  const config = await loadDigestConfig(db);
  if (!config.enabled) {
    logger.info('plcWeeklyDigest: kill switch off — skipping run');
    return counts;
  }

  const plcsSnap = await db.collection('plcs').limit(MAX_PLCS_PER_RUN).get();
  counts.plcsConsidered = plcsSnap.size;
  // Coverage alarm: this is a single bounded page (no pagination). If a tenant
  // ever grows past the cap, PLCs beyond it are silently skipped every run —
  // warn so an operator knows to add startAfter pagination before that bites.
  if (plcsSnap.size >= MAX_PLCS_PER_RUN) {
    logger.warn(
      'plcWeeklyDigest: hit MAX_PLCS_PER_RUN — some PLCs may be skipped; add pagination',
      { cap: MAX_PLCS_PER_RUN }
    );
  }

  for (const plcDoc of plcsSnap.docs) {
    const plc = plcDoc.data();
    if (!isDigestOptIn(plc)) continue;
    counts.optedIn += 1;

    const events = await readWindowedActivity(plcDoc.ref, now);
    if (events.length === 0) {
      counts.skippedNoActivity += 1;
      continue;
    }

    const recipients = collectRecipientEmails(plc);
    if (recipients.length === 0) {
      counts.skippedNoRecipients += 1;
      continue;
    }

    const plcName = typeof plc.name === 'string' ? plc.name : 'your PLC';
    const body = buildPlcDigestEmail({ plcName, events });

    // ONE mail doc per PLC (NO per-member fan-out, §8). Deterministic doc id
    // keyed by PLC + run-week so a retried run overwrites rather than
    // duplicates. The `to: [...]` list carries every recipient.
    const weekStamp = Math.floor(now / DIGEST_WINDOW_MS);
    const mailId = `plc-digest_${plcDoc.id}_${weekStamp}`;
    const mailDoc: MailDoc = {
      to: recipients,
      message: body,
    };
    if (config.from) mailDoc.from = config.from;
    if (config.replyTo) mailDoc.replyTo = config.replyTo;

    try {
      await db.collection('mail').doc(mailId).set(mailDoc);
      counts.mailQueued += 1;
      logger.info('plcWeeklyDigest: queued digest mail', {
        plcId: plcDoc.id,
        recipients: recipients.length,
        events: events.length,
      });
    } catch (err) {
      // Log and continue — a thrown handler would retry the whole weekly run.
      logger.error('plcWeeklyDigest: failed to queue digest mail', {
        plcId: plcDoc.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return counts;
}

export const plcWeeklyDigest = onSchedule(
  {
    // Weekly, Monday 06:00 America/Chicago — start-of-week recap, off-peak.
    schedule: 'every monday 06:00',
    timeZone: 'America/Chicago',
    // Cost posture (§5/§8): a bounded scan with batched reads + one mail doc
    // per PLC. Pin memory + cap concurrency so the weekly job can never fan out.
    memory: '256MiB',
    maxInstances: 1,
    timeoutSeconds: 540,
  },
  async () => {
    const db = admin.firestore();
    const counts = await runPlcWeeklyDigest(db);
    logger.info('plcWeeklyDigest: run complete', counts);
  }
);
