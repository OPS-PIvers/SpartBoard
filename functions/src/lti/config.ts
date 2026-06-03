// Schoology LTI 1.3 — platform constants + runtime config.
//
// The Schoology platform endpoints are public, stable constants (baked in here).
// The per-install values that only exist AFTER registration — `clientId` and
// `deploymentId` — live in Firestore at `admin_settings/lti_config` so they can be
// set/rotated without a code change or redeploy. They are read (and cached) at runtime.

import type * as admin from 'firebase-admin';

// ── Schoology platform endpoints (constants) ───────────────────────────────
export const SCHOOLOGY_ISSUER = 'https://schoology.schoology.com';
export const SCHOOLOGY_AUTHORIZE_URL =
  'https://lti-service.svc.schoology.com/lti-service/authorize-redirect';
export const SCHOOLOGY_TOKEN_URL =
  'https://lti-service.svc.schoology.com/lti-service/access-token';
export const SCHOOLOGY_JWKS_URI =
  'https://lti-service.svc.schoology.com/lti-service/.well-known/jwks';

// Our tool's public origin (login-init / launch / jwks all live here).
export const TOOL_ORIGIN = 'https://spartboard.web.app';
export const TOOL_LOGIN_URL = `${TOOL_ORIGIN}/lti/login`;
export const TOOL_LAUNCH_URL = `${TOOL_ORIGIN}/lti/launch`;
export const TOOL_JWKS_URL = `${TOOL_ORIGIN}/.well-known/jwks.json`;

// ── LTI 1.3 / Advantage claim URIs ─────────────────────────────────────────
export const LTI = {
  MESSAGE_TYPE: 'https://purl.imsglobal.org/spec/lti/claim/message_type',
  VERSION: 'https://purl.imsglobal.org/spec/lti/claim/version',
  DEPLOYMENT_ID: 'https://purl.imsglobal.org/spec/lti/claim/deployment_id',
  TARGET_LINK_URI: 'https://purl.imsglobal.org/spec/lti/claim/target_link_uri',
  ROLES: 'https://purl.imsglobal.org/spec/lti/claim/roles',
  CONTEXT: 'https://purl.imsglobal.org/spec/lti/claim/context',
  RESOURCE_LINK: 'https://purl.imsglobal.org/spec/lti/claim/resource_link',
  CUSTOM: 'https://purl.imsglobal.org/spec/lti/claim/custom',
  AGS_ENDPOINT: 'https://purl.imsglobal.org/spec/lti-ags/claim/endpoint',
  NRPS: 'https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice',
  DL_SETTINGS:
    'https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings',
  DL_CONTENT_ITEMS:
    'https://purl.imsglobal.org/spec/lti-dl/claim/content_items',
  DL_DATA: 'https://purl.imsglobal.org/spec/lti-dl/claim/data',
} as const;

export const MESSAGE_TYPE_RESOURCE_LINK = 'LtiResourceLinkRequest';
export const MESSAGE_TYPE_DEEP_LINKING = 'LtiDeepLinkingRequest';

// AGS / NRPS OAuth2 scopes (client-credentials).
export const AGS_SCOPE_LINEITEM =
  'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem';
export const AGS_SCOPE_SCORE =
  'https://purl.imsglobal.org/spec/lti-ags/scope/score';
export const AGS_SCOPE_RESULT =
  'https://purl.imsglobal.org/spec/lti-ags/scope/result.readonly';
export const NRPS_SCOPE =
  'https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly';

// ── Runtime platform config (clientId / deploymentId) ──────────────────────
export interface LtiPlatformConfig {
  issuer: string;
  clientId: string;
  deploymentId: string;
  authorizeUrl: string;
  tokenUrl: string;
  jwksUri: string;
}

export const LTI_CONFIG_DOC = 'admin_settings/lti_config';

let cachedConfig: { value: LtiPlatformConfig; at: number } | null = null;
const CONFIG_TTL_MS = 5 * 60 * 1000;

/** Clears the in-memory config cache (used by tests). */
export function _resetLtiConfigCache(): void {
  cachedConfig = null;
}

/**
 * Reads `admin_settings/lti_config` (cached in-memory for 5 min). Throws a clear
 * error if `clientId`/`deploymentId` have not been provisioned yet — the spike
 * checklist hands those over after the Schoology app is registered + installed.
 */
export async function getLtiPlatformConfig(
  db: admin.firestore.Firestore
): Promise<LtiPlatformConfig> {
  const now = Date.now();
  if (cachedConfig && now - cachedConfig.at < CONFIG_TTL_MS) {
    return cachedConfig.value;
  }
  const snap = await db.doc(LTI_CONFIG_DOC).get();
  const data = (snap.exists ? snap.data() : {}) ?? {};
  const clientId =
    typeof data.clientId === 'string' ? data.clientId.trim() : '';
  const deploymentId =
    typeof data.deploymentId === 'string' ? data.deploymentId.trim() : '';
  if (!clientId || !deploymentId) {
    throw new Error(
      'LTI platform not configured: set clientId and deploymentId on admin_settings/lti_config.'
    );
  }
  const value: LtiPlatformConfig = {
    issuer:
      typeof data.issuer === 'string' && data.issuer.trim()
        ? data.issuer.trim()
        : SCHOOLOGY_ISSUER,
    clientId,
    deploymentId,
    authorizeUrl: SCHOOLOGY_AUTHORIZE_URL,
    tokenUrl: SCHOOLOGY_TOKEN_URL,
    jwksUri: SCHOOLOGY_JWKS_URI,
  };
  cachedConfig = { value, at: now };
  return value;
}
