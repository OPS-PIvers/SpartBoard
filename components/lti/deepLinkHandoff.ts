/**
 * postMessage handoff protocol between the in-iframe deep-link LAUNCHER
 * (LtiDeepLinkPicker, embedded in Schoology) and the top-level handoff WINDOW
 * (LtiDeepLinkWindow, opened via window.open).
 *
 * Why a handoff at all: Google Workspace Context-Aware Access denies the
 * teacher's Google OAuth token when the sign-in popup is spawned from the
 * partitioned Schoology iframe ("Account Restricted" — access_not_configured).
 * Running sign-in + quiz pick in a TOP-LEVEL spartboard.web.app window makes the
 * OAuth first-party, so CAA passes (it's the same context where the normal app
 * sign-in already works). The window then hands the signed
 * LtiDeepLinkingResponse JWT back to the iframe, which form-POSTs it to
 * Schoology's return URL — the normal deep-link ending. (Students are
 * unaffected: their session is a server-minted custom token, no popup.)
 *
 * Both ends are the SAME origin (spartboard.web.app ↔ spartboard.web.app), so
 * every message is validated against `window.location.origin`.
 */

/** Path the launcher opens as a top-level window. Relative → resolves to our origin. */
export const DL_HANDOFF_WINDOW_PATH = '/lti/teacher?mode=deeplink&handoff=1';

export const DL_HANDOFF_READY = 'lti-dl-handoff-ready';
export const DL_HANDOFF_CONTEXT = 'lti-dl-handoff-context';
export const DL_HANDOFF_RESPONSE = 'lti-dl-handoff-response';

/**
 * Deep-link context the launcher hands to the window. Sourced from the
 * launcher's one-time launch-code exchange (the window has no launch code of its
 * own — it's single-use and already consumed by the iframe).
 */
export interface DlHandoffContext {
  /** Schoology's `deep_link_return_url` — where the signed response is POSTed. */
  returnUrl: string;
  /** Opaque platform round-trip value that MUST be echoed back in the response. */
  dlData?: string;
  /** LTI context id → scopes the created quiz session (`schoology:<contextId>`). */
  contextId: string;
}

/** Window → launcher: the signed LtiDeepLinkingResponse JWT to POST back. */
export interface DlHandoffResponse {
  jwt: string;
  returnUrl: string;
}

type ReadyMsg = { type: typeof DL_HANDOFF_READY };
type ContextMsg = {
  type: typeof DL_HANDOFF_CONTEXT;
  context: DlHandoffContext;
};
type ResponseMsg = {
  type: typeof DL_HANDOFF_RESPONSE;
  response: DlHandoffResponse;
};
export type DlHandoffMessage = ReadyMsg | ContextMsg | ResponseMsg;

function isContext(v: unknown): v is DlHandoffContext {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.returnUrl === 'string' &&
    o.returnUrl.length > 0 &&
    typeof o.contextId === 'string' &&
    o.contextId.length > 0 &&
    (o.dlData === undefined || typeof o.dlData === 'string')
  );
}

function isResponse(v: unknown): v is DlHandoffResponse {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.jwt === 'string' &&
    o.jwt.length > 0 &&
    typeof o.returnUrl === 'string' &&
    o.returnUrl.length > 0
  );
}

/**
 * Parse a MessageEvent into a typed handoff message, or `null` if it isn't a
 * well-formed handoff message FROM OUR OWN ORIGIN. Centralizes the origin check
 * both ends depend on, so a message from any other frame/extension is dropped.
 */
export function parseHandoffMessage(
  event: MessageEvent
): DlHandoffMessage | null {
  if (typeof window === 'undefined') return null;
  if (event.origin !== window.location.origin) return null;
  const data: unknown = event.data;
  if (!data || typeof data !== 'object') return null;
  const type = (data as { type?: unknown }).type;
  if (type === DL_HANDOFF_READY) return { type: DL_HANDOFF_READY };
  if (type === DL_HANDOFF_CONTEXT) {
    const context = (data as { context?: unknown }).context;
    return isContext(context) ? { type: DL_HANDOFF_CONTEXT, context } : null;
  }
  if (type === DL_HANDOFF_RESPONSE) {
    const response = (data as { response?: unknown }).response;
    return isResponse(response)
      ? { type: DL_HANDOFF_RESPONSE, response }
      : null;
  }
  return null;
}

/** Post a typed handoff message to `target`, constrained to our own origin. */
export function postHandoffMessage(
  target: Window,
  msg: DlHandoffMessage
): void {
  if (typeof window === 'undefined') return;
  target.postMessage(msg, window.location.origin);
}

/**
 * Deliver the signed LTI deep-linking response: an auto-submitting hidden-form
 * POST to the platform's `deep_link_return_url` carrying a single `JWT` field.
 * The form is attached just long enough to submit (a detached form cannot
 * navigate); submitting navigates the current window back to the platform.
 * Used by the launcher (navigates the Schoology iframe) and, as a fallback when
 * the opener is gone, by the window itself.
 */
export function postDeepLinkResponse(returnUrl: string, jwt: string): void {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = returnUrl;
  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = 'JWT';
  input.value = jwt;
  form.appendChild(input);
  document.body.appendChild(form);
  form.submit();
}
