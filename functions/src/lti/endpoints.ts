// Schoology LTI 1.3 — HTTP endpoints (Firebase Hosting rewrites point here).
//
// Phase A: ltiJwks only. The OIDC login-init (ltiLogin) and launch callback
// (ltiLaunch) onRequest functions land here in Phase B.
//
// NOTE: region is set explicitly (not via setGlobalOptions) — separate-file
// functions are evaluated before index.ts's setGlobalOptions runs, matching the
// convention in the other extracted function modules in this codebase.

import { onRequest } from 'firebase-functions/v2/https';
import { TOOL_PUBLIC_JWKS } from './toolJwks';

/**
 * Publishes the tool's PUBLIC JWK Set so Schoology can verify the JWTs we sign
 * (deep-linking responses + AGS/NRPS client-credentials assertions). Served at
 * https://spartboard.web.app/.well-known/jwks.json via a hosting rewrite.
 */
export const ltiJwks = onRequest(
  // 256MiB: a 128MiB instance OOMs on the bundled nodejs24 cold-start (~140MiB).
  { region: 'us-central1', cors: true, memory: '256MiB' },
  (_req, res) => {
    res.set('Cache-Control', 'public, max-age=3600');
    res.status(200).json(TOOL_PUBLIC_JWKS);
  }
);
