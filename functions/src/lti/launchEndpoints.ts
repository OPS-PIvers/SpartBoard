// Schoology LTI 1.3 — the live launch endpoints.
//
//   ltiLogin    (onRequest GET/POST)  /lti/login   — OIDC third-party login init
//   ltiLaunch   (onRequest POST)      /lti/launch  — OIDC callback: validate id_token → launch code
//   ltiExchange (onCall)                            — SPA trades the launch code for context (+ a
//                                                     studentRole custom token for Learner launches)
//
// Cookieless by design: the OIDC state/nonce live in Firestore (stores.ts), not a 3rd-party cookie.
// region is set explicitly (separate-file functions run before index.ts setGlobalOptions).

import { onRequest, onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import * as CryptoJS from 'crypto-js';

import {
  getLtiPlatformConfig,
  TOOL_ORIGIN,
  TOOL_LAUNCH_URL,
  MESSAGE_TYPE_DEEP_LINKING,
} from './config';
import { verifyLaunchJwt, launchRedirectTarget } from './jwt';
import {
  putOidcState,
  consumeOidcState,
  mintLaunchCode,
  consumeLaunchCode,
  mintGradePushAuth,
  newOpaqueId,
} from './stores';
import {
  ALLOWED_ORIGINS,
  normalizeEmailDomain,
  resolveOrgIdForDomain,
} from '../classlinkShared';

const STUDENT_PSEUDONYM_HMAC_SECRET = defineSecret(
  'STUDENT_PSEUDONYM_HMAC_SECRET'
);

/** Stable Firebase uid for a Schoology user, namespaced off their LTI `sub`. */
function ltiStudentUid(sub: string, hmacSecret: string): string {
  return CryptoJS.HmacSHA256(`schoology-sub:${sub}`, hmacSecret).toString(
    CryptoJS.enc.Hex
  );
}

function mergedParams(req: {
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const src of [req.query ?? {}, req.body ?? {}]) {
    for (const [k, v] of Object.entries(src)) {
      if (typeof v === 'string') out[k] = v;
      else if (Array.isArray(v) && typeof v[0] === 'string') out[k] = v[0];
    }
  }
  return out;
}

// ── ltiLogin ────────────────────────────────────────────────────────────────
export const ltiLogin = onRequest(
  { region: 'us-central1', memory: '256MiB' },
  async (req, res) => {
    try {
      const db = admin.firestore();
      const cfg = await getLtiPlatformConfig(db);
      const p = mergedParams(req);

      // Verbose for Spike-0 — especially lti_storage_target (cookieless decision).
      console.log('[ltiLogin] inbound', {
        iss: p.iss,
        client_id: p.client_id,
        target_link_uri: p.target_link_uri,
        lti_message_hint: p.lti_message_hint,
        lti_deployment_id: p.lti_deployment_id,
        lti_storage_target: p.lti_storage_target,
        hasLoginHint: !!p.login_hint,
      });

      if (p.iss && p.iss !== cfg.issuer) {
        res.status(400).send('Invalid issuer');
        return;
      }
      if (p.client_id && p.client_id !== cfg.clientId) {
        res.status(400).send('Invalid client_id');
        return;
      }
      if (!p.login_hint) {
        res.status(400).send('Missing login_hint');
        return;
      }

      const state = newOpaqueId(32);
      const nonce = newOpaqueId(32);
      await putOidcState(db, state, nonce);

      const authUrl = new URL(cfg.authorizeUrl);
      const q = authUrl.searchParams;
      q.set('scope', 'openid');
      q.set('response_type', 'id_token');
      q.set('response_mode', 'form_post');
      q.set('client_id', cfg.clientId);
      q.set('redirect_uri', TOOL_LAUNCH_URL);
      q.set('login_hint', p.login_hint);
      q.set('state', state);
      q.set('nonce', nonce);
      q.set('prompt', 'none');
      if (p.lti_message_hint) q.set('lti_message_hint', p.lti_message_hint);

      res.redirect(302, authUrl.toString());
    } catch (err) {
      console.error('[ltiLogin] error', err);
      res.status(500).send('LTI login initiation failed.');
    }
  }
);

// ── ltiLaunch ─────────────────────────────────────────────────────────────────
export const ltiLaunch = onRequest(
  { region: 'us-central1', memory: '256MiB' },
  async (req, res) => {
    try {
      const db = admin.firestore();
      const cfg = await getLtiPlatformConfig(db);
      const p = mergedParams(req);
      const idToken = p.id_token ?? '';
      const state = p.state ?? '';

      console.log('[ltiLaunch] inbound', {
        hasIdToken: !!idToken,
        hasState: !!state,
        contentType: req.get('content-type'),
      });

      if (!idToken || !state) {
        res.status(400).send('Missing id_token or state.');
        return;
      }

      const nonce = await consumeOidcState(db, state);
      if (!nonce) {
        res.status(400).send('Invalid or expired launch state.');
        return;
      }

      let claims;
      try {
        claims = await verifyLaunchJwt(idToken, {
          clientId: cfg.clientId,
          expectedDeploymentId: cfg.deploymentId,
          issuer: cfg.issuer,
        });
      } catch (e) {
        console.error('[ltiLaunch] id_token validation failed', e);
        res.status(401).send('Launch validation failed.');
        return;
      }

      if (claims.nonce !== nonce) {
        console.error('[ltiLaunch] nonce mismatch');
        res.status(401).send('Launch validation failed (nonce).');
        return;
      }

      console.log('[ltiLaunch] validated', {
        role: claims.role,
        messageType: claims.messageType,
        contextId: claims.contextId,
        deploymentId: claims.deploymentId,
        hasAgs: !!claims.ags,
        hasNrps: !!claims.nrps,
        hasDeepLinking: !!claims.deepLinking,
      });

      const code = await mintLaunchCode(db, {
        role: claims.role,
        messageType: claims.messageType,
        sub: claims.sub,
        deploymentId: claims.deploymentId,
        contextId: claims.contextId,
        contextTitle: claims.contextTitle,
        resourceLinkId: claims.resourceLinkId,
        ags: claims.ags,
        nrps: claims.nrps,
        deepLinking: claims.deepLinking,
        custom: claims.custom,
        email: claims.email,
        name: claims.name,
      });

      const target = launchRedirectTarget(claims.role, claims.isDeepLinking);
      const url = new URL(TOOL_ORIGIN + target.path);
      url.searchParams.set('lc', code);
      if (target.deeplink) {
        url.searchParams.set('mode', 'deeplink');
      } else if (claims.role === 'student' && claims.custom) {
        // Surface the quiz/VA identity from the content item's custom claim so the
        // runner can SSO-auto-join (the quiz code is a join code, not a secret).
        const custom = claims.custom;
        const kind =
          typeof custom['kind'] === 'string' ? custom['kind'] : 'quiz';
        url.searchParams.set('kind', kind);
        if (kind === 'va' && typeof custom['session_id'] === 'string') {
          url.searchParams.set('sessionId', custom['session_id']);
        } else if (typeof custom['quiz_code'] === 'string') {
          url.searchParams.set('code', custom['quiz_code']);
        }
      }

      res.redirect(302, url.toString());
    } catch (err) {
      console.error('[ltiLaunch] error', err);
      res.status(500).send('LTI launch failed.');
    }
  }
);

// ── ltiExchange ───────────────────────────────────────────────────────────────
export const ltiExchange = onCall(
  {
    region: 'us-central1',
    invoker: 'public',
    cors: ALLOWED_ORIGINS,
    secrets: [STUDENT_PSEUDONYM_HMAC_SECRET],
  },
  async (request) => {
    const data = (request.data ?? {}) as { code?: unknown };
    const code = typeof data.code === 'string' ? data.code : '';
    if (!code) {
      throw new HttpsError('invalid-argument', 'Missing launch code.');
    }

    const db = admin.firestore();
    const launch = await consumeLaunchCode(db, code);
    if (!launch) {
      throw new HttpsError(
        'unauthenticated',
        'Launch code is invalid or expired.'
      );
    }

    // Safe, PII-light context for the SPA to render.
    const context = {
      role: launch.role,
      messageType: launch.messageType,
      isDeepLinking: launch.messageType === MESSAGE_TYPE_DEEP_LINKING,
      contextId: launch.contextId,
      contextTitle: launch.contextTitle,
      resourceLinkId: launch.resourceLinkId,
      deploymentId: launch.deploymentId,
      name: launch.name,
      email: launch.email,
      // deep_linking_settings (return URL + opaque data) for the picker; custom
      // params (quiz identity) for diagnostics.
      deepLinking: launch.deepLinking ?? null,
      custom: launch.custom ?? null,
    };

    // Teacher launches don't get a studentRole token — the grader signs in with the
    // teacher's own SpartBoard account to read their session. For an INSTRUCTOR
    // resource-link launch we mint a short-lived grade-push authorization (the
    // LIVE-token model) the grader passes to authorize an AGS push. Deep-linking
    // launches use the picker instead, so they need no push-auth here.
    if (launch.role !== 'student') {
      let pushAuth: string | undefined;
      if (
        launch.role === 'teacher' &&
        launch.messageType !== MESSAGE_TYPE_DEEP_LINKING &&
        launch.resourceLinkId
      ) {
        try {
          pushAuth = await mintGradePushAuth(db, {
            resourceLinkId: launch.resourceLinkId,
            contextId: launch.contextId,
          });
        } catch (err) {
          console.error('[ltiExchange] grade-push-auth mint failed', err);
        }
      }
      return {
        ...context,
        studentRole: false,
        ...(pushAuth ? { pushAuth } : {}),
      };
    }

    // Learner launch: mint a studentRole custom token (mirrors classroomAddonLoginV1).
    const hmacSecret = STUDENT_PSEUDONYM_HMAC_SECRET.value();
    if (!hmacSecret) {
      throw new HttpsError('internal', 'Server not configured.');
    }
    const uid = ltiStudentUid(launch.sub, hmacSecret);

    let orgId: string | null = null;
    if (launch.email) {
      const domain = normalizeEmailDomain(launch.email);
      if (domain) orgId = await resolveOrgIdForDomain(db, domain);
    }
    const classIds = launch.contextId ? [`schoology:${launch.contextId}`] : [];

    let customToken: string;
    try {
      customToken = await admin.auth().createCustomToken(uid, {
        studentRole: true,
        ...(orgId ? { orgId } : {}),
        classIds,
      });
    } catch (err) {
      console.error('[ltiExchange] createCustomToken failed', err);
      throw new HttpsError('internal', 'Failed to mint auth token.');
    }

    // Persist the PII-free grade-sync key from THIS launch's AGS endpoint, keyed by
    // pseudonym uid → { sub, lineitem }. Per-student resolution is what makes
    // linked/merged sections post correctly (each section's lineitem differs).
    if (launch.resourceLinkId && launch.ags) {
      try {
        await db
          .doc(`lti_grade_links/${uid}/resources/${launch.resourceLinkId}`)
          .set(
            {
              sub: launch.sub,
              contextId: launch.contextId,
              resourceLinkId: launch.resourceLinkId,
              ags: launch.ags,
              updatedAt: Date.now(),
            },
            { merge: true }
          );
      } catch (err) {
        console.warn(
          '[ltiExchange] grade-link persist failed (non-fatal)',
          err
        );
      }
    }

    return { ...context, studentRole: true, customToken };
  }
);
