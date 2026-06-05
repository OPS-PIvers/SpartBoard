// Schoology LTI 1.3 — Deep Linking 2.0 response building.
//
// When a teacher picks a SpartBoard quiz/activity in the picker, we return a SIGNED
// LtiDeepLinkingResponse JWT containing one `ltiResourceLink` content item. The item
// carries:
//   • `custom` { kind, quiz_code|session_id } — Schoology REPLAYS these on every
//     subsequent resource-link launch (app-level custom params are NOT replayed, so
//     the quiz identity MUST live here).
//   • `lineItem` { scoreMaximum, label } — so Schoology creates the gradebook column
//     up front (and, with unique-lineitem-per-section on, one per linked section).

import { LTI } from './config';

export const MESSAGE_TYPE_DL_RESPONSE = 'LtiDeepLinkingResponse';

export interface ContentItem {
  type: 'ltiResourceLink';
  url: string;
  title: string;
  custom?: Record<string, string>;
  lineItem?: { scoreMaximum: number; label: string };
  /**
   * LTI Deep Linking 2.0 submission window. `endDateTime` is the assignment DUE
   * date — Schoology applies it to the created assignment. A SIBLING of
   * `lineItem` on the content item (not nested inside it). We deliberately set
   * only `submission` (the due date), never `available` — `available.endDateTime`
   * is the hard LOCK date, which would block late work.
   */
  submission?: { endDateTime: string };
}

/**
 * Serialize a due-date instant (epoch ms) into the LTI `submission.endDateTime`
 * ISO 8601 string. The client (picker) already resolved the due date to an
 * ABSOLUTE instant in the teacher's local timezone (local end-of-day — 11:59 PM
 * Central for Orono), so the server makes NO timezone assumption: it just
 * serializes the instant. Returns null for absent/invalid input so callers can
 * omit `submission`.
 */
export function dueAtToSubmissionEndDateTime(
  dueAtMs: number | undefined
): string | null {
  if (
    typeof dueAtMs !== 'number' ||
    !Number.isFinite(dueAtMs) ||
    dueAtMs <= 0
  ) {
    return null;
  }
  return new Date(dueAtMs).toISOString();
}

export function buildQuizContentItem(opts: {
  launchUrl: string;
  title: string;
  custom: Record<string, string>;
  maxPoints?: number;
  /** Optional due date (epoch ms) → emitted as `submission.endDateTime`. */
  dueAtMs?: number;
}): ContentItem {
  const item: ContentItem = {
    type: 'ltiResourceLink',
    url: opts.launchUrl,
    title: opts.title,
    custom: opts.custom,
  };
  if (typeof opts.maxPoints === 'number' && opts.maxPoints > 0) {
    item.lineItem = { scoreMaximum: opts.maxPoints, label: opts.title };
  }
  const endDateTime = dueAtToSubmissionEndDateTime(opts.dueAtMs);
  if (endDateTime) {
    item.submission = { endDateTime };
  }
  return item;
}

export function buildDeepLinkResponseClaims(opts: {
  deploymentId: string;
  /**
   * A fresh nonce for THIS response message. LTI 1.3 requires every message JWT
   * — including the deep-linking response — to carry a `nonce`; Schoology rejects
   * the response without it ("Invalid parameter: nonce is required"). It is the
   * tool's own nonce for the response, NOT the launch nonce echoed back, so the
   * caller generates a random value per response.
   */
  nonce: string;
  data?: string;
  contentItems: ContentItem[];
}): Record<string, unknown> {
  const claims: Record<string, unknown> = {
    [LTI.MESSAGE_TYPE]: MESSAGE_TYPE_DL_RESPONSE,
    [LTI.VERSION]: '1.3.0',
    [LTI.DEPLOYMENT_ID]: opts.deploymentId,
    [LTI.DL_CONTENT_ITEMS]: opts.contentItems,
    nonce: opts.nonce,
  };
  // Echo the platform's opaque `data` exactly when present (DL spec requirement).
  if (opts.data) claims[LTI.DL_DATA] = opts.data;
  return claims;
}

/**
 * The deep-link response is auto-POSTed to a platform-supplied return URL. Validate
 * it really points at Schoology before we sign+submit, so a tampered client can't
 * redirect a signed response elsewhere.
 */
export function isSchoologyReturnUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && /(^|\.)schoology\.com$/.test(u.hostname);
  } catch {
    return false;
  }
}
