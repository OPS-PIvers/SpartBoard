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
}

export function buildQuizContentItem(opts: {
  launchUrl: string;
  title: string;
  custom: Record<string, string>;
  maxPoints?: number;
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
  return item;
}

export function buildDeepLinkResponseClaims(opts: {
  deploymentId: string;
  data?: string;
  contentItems: ContentItem[];
}): Record<string, unknown> {
  const claims: Record<string, unknown> = {
    [LTI.MESSAGE_TYPE]: MESSAGE_TYPE_DL_RESPONSE,
    [LTI.VERSION]: '1.3.0',
    [LTI.DEPLOYMENT_ID]: opts.deploymentId,
    [LTI.DL_CONTENT_ITEMS]: opts.contentItems,
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
