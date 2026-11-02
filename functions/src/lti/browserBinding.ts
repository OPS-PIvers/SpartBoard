// Binds an LTI launch to the browser that started its OIDC login, via a partitioned cookie.
//
// Firebase Hosting forwards only the cookie named `__session` to rewritten functions,
// so the binding id rides in that name. The state doc stores a hash, never the id.

import { createHash, timingSafeEqual } from 'node:crypto';
import { newOpaqueId } from './stores';

export const BINDING_COOKIE = '__session';
const BINDING_MAX_AGE_S = 12 * 60 * 60;
const BINDING_ID_RE = /^[A-Za-z0-9_-]{32,64}$/;

export type LaunchBindingMode = 'monitor' | 'enforce';
export type BindingResult = 'ok' | 'missing' | 'mismatch' | 'legacy';

/** The login params a top-level relaunch replays to /lti/login. */
export interface LoginRestartParams {
  iss: string | null;
  login_hint: string;
  target_link_uri: string | null;
  lti_message_hint: string | null;
  client_id: string | null;
  lti_deployment_id: string | null;
}

export function readBindingCookie(
  cookieHeader: string | undefined
): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== BINDING_COOKIE) continue;
    const value = part.slice(eq + 1).trim();
    return BINDING_ID_RE.test(value) ? value : null;
  }
  return null;
}

/** Reuses this browser's binding id so parallel launches in two tabs both verify. */
export function bindingIdFor(cookieHeader: string | undefined): string {
  return readBindingCookie(cookieHeader) ?? newOpaqueId(32);
}

export function hashBindingId(id: string): string {
  return createHash('sha256').update(id).digest('base64url');
}

export function bindingCookieHeader(id: string): string {
  return `${BINDING_COOKIE}=${id}; Path=/lti; Max-Age=${BINDING_MAX_AGE_S}; HttpOnly; Secure; SameSite=None; Partitioned`;
}

export function checkBinding(
  storedHash: string | null,
  cookieHeader: string | undefined
): BindingResult {
  if (!storedHash) return 'legacy';
  const id = readBindingCookie(cookieHeader);
  if (!id) return 'missing';
  const a = Buffer.from(hashBindingId(id));
  const b = Buffer.from(storedHash);
  return a.length === b.length && timingSafeEqual(a, b) ? 'ok' : 'mismatch';
}

export function parseLaunchBindingMode(value: unknown): LaunchBindingMode {
  return value === 'enforce' ? 'enforce' : 'monitor';
}

/** Coarse, PII-free browser family for the binding log. */
export function browserFamily(userAgent: string | undefined): string {
  const ua = userAgent ?? '';
  if (/CrOS/.test(ua)) return 'chromebook';
  if (/Edg\//.test(ua)) return 'edge';
  if (/Firefox\//.test(ua)) return 'firefox';
  if (/Chrome\//.test(ua) || /CriOS\//.test(ua)) return 'chrome';
  if (/Safari\//.test(ua)) return 'safari';
  return 'other';
}

export function restartLoginPath(params: LoginRestartParams): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === 'string' && v) q.set(k, v);
  }
  q.set('top', '1');
  return `/lti/login?${q.toString()}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** One button that restarts the login in a top-level tab, where the cookie is first-party. */
export function restartPageHtml(path: string): string {
  const href = escapeHtml(path);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>SpartBoard</title><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f8fafc;font-family:system-ui,sans-serif}a{display:inline-block;padding:12px 20px;border-radius:12px;background:#2d3f89;color:#fff;font-weight:600;text-decoration:none}</style></head><body><a href="${href}" target="_blank" rel="noopener noreferrer">Open SpartBoard</a></body></html>`;
}
