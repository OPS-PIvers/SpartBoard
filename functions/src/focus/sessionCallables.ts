// onCall wrappers and the scheduled ender for teacher focus sessions; the logic is in sessions.ts.
import {
  HttpsError,
  onCall,
  onRequest,
  type CallableRequest,
} from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import '../functionsInit';
import { ALLOWED_ORIGINS } from '../classlinkShared';
import {
  CLASSLINK_CLIENT_ID,
  CLASSLINK_CLIENT_SECRET,
  CLASSLINK_TENANT_URL,
  STUDENT_PSEUDONYM_HMAC_SECRET,
} from '../secrets';
import { loadTaughtClassEnrollment } from '../studentIdentity';
import { assertViewAsAllowed } from '../viewAsGuard';
import { liveFocusPushDeps, wakeFocusStudents } from './push';
import {
  DISTRICT_DOMAIN,
  EXTENSION_OAUTH_CLIENTS,
  ExtensionCallError,
  bearerToken,
  fetchTokenInfo,
  verifiedTokenEmail,
} from '../webTourExtension';
import { handleFocusPanel } from './panel';
import {
  handleFocusAddSite,
  handleFocusEnd,
  handleFocusExtend,
  handleFocusOpen,
  handleFocusRelease,
  handleFocusStart,
  sweepFocusSessions,
  type FocusCaller,
  type FocusDeps,
} from './sessions';

const liveDeps: FocusDeps = {
  now: () => Date.now(),
  hmacSecret: () => STUDENT_PSEUDONYM_HMAC_SECRET.value(),
  taughtClassEnrollment: (email, classId) =>
    loadTaughtClassEnrollment(email, classId, {
      classlinkClientId: CLASSLINK_CLIENT_ID.value(),
      classlinkClientSecret: CLASSLINK_CLIENT_SECRET.value(),
      tenantUrl: CLASSLINK_TENANT_URL.value(),
    }),
  mockClassesOpen: () => process.env.GCLOUD_PROJECT === 'spartboard-dev',
  wake: (uids) => wakeFocusStudents(admin.firestore(), uids, liveFocusPushDeps),
};

function callerOf(request: CallableRequest): FocusCaller | null {
  const auth = request.auth;
  if (!auth) return null;
  return {
    uid: auth.uid,
    email: auth.token.email ?? null,
    emailVerified: auth.token.email_verified === true,
    anonymous: auth.token.firebase?.sign_in_provider === 'anonymous',
    studentRole: auth.token.studentRole === true,
    name: typeof auth.token.name === 'string' ? auth.token.name : null,
  };
}

const OPTIONS = {
  memory: '256MiB' as const,
  // A co-teacher's first action runs the ClassLink check, which can take several sequential requests.
  timeoutSeconds: 120,
  secrets: [
    CLASSLINK_CLIENT_ID,
    CLASSLINK_CLIENT_SECRET,
    CLASSLINK_TENANT_URL,
    STUDENT_PSEUDONYM_HMAC_SECRET,
  ],
  cors: ALLOWED_ORIGINS,
  invoker: 'public' as const,
};

// Every action reaches students' devices, so a View as session needs it unlocked (outward).
export const focusStartV1 = onCall(OPTIONS, async (request) => {
  assertViewAsAllowed(request, { outward: true });
  return handleFocusStart(
    admin.firestore(),
    callerOf(request),
    request.data,
    liveDeps
  );
});

export const focusExtendV1 = onCall(OPTIONS, async (request) => {
  assertViewAsAllowed(request, { outward: true });
  return handleFocusExtend(
    admin.firestore(),
    callerOf(request),
    request.data,
    liveDeps
  );
});

export const focusReleaseV1 = onCall(OPTIONS, async (request) => {
  assertViewAsAllowed(request, { outward: true });
  return handleFocusRelease(
    admin.firestore(),
    callerOf(request),
    request.data,
    liveDeps
  );
});

export const focusAddSiteV1 = onCall(OPTIONS, async (request) => {
  assertViewAsAllowed(request, { outward: true });
  return handleFocusAddSite(
    admin.firestore(),
    callerOf(request),
    request.data,
    liveDeps
  );
});

// Read-only for the session's content; it only adds the caller as a reader.
export const focusOpenV1 = onCall(OPTIONS, async (request) => {
  assertViewAsAllowed(request, { read: true });
  return handleFocusOpen(
    admin.firestore(),
    callerOf(request),
    request.data,
    liveDeps
  );
});

export const focusEndV1 = onCall(OPTIONS, async (request) => {
  assertViewAsAllowed(request, { outward: true });
  return handleFocusEnd(
    admin.firestore(),
    callerOf(request),
    request.data,
    liveDeps
  );
});

const SIGN_IN = 'Sign in to Chrome with your Orono account.';

/** The staff member a side panel token belongs to, as the callables see a signed-in teacher (H7). */
async function panelCaller(token: string): Promise<FocusCaller> {
  const clientId = EXTENSION_OAUTH_CLIENTS[process.env.GCLOUD_PROJECT ?? ''];
  if (!clientId) throw new ExtensionCallError(503, 'Focus is not set up yet.');
  const email = await verifiedTokenEmail(
    token,
    { clientId, tokenInfo: fetchTokenInfo },
    DISTRICT_DOMAIN,
    SIGN_IN
  );
  const user = await admin
    .auth()
    .getUserByEmail(email)
    .catch((err: { code?: unknown }) => {
      // Any other Auth error is a 500, which the panel treats as offline and retries.
      if (err?.code === 'auth/user-not-found') return null;
      throw err;
    });
  if (!user || user.disabled)
    throw new ExtensionCallError(
      403,
      'Sign in to SpartBoard once, then try again.'
    );
  return {
    uid: user.uid,
    email,
    emailVerified: true,
    anonymous: false,
    studentRole: user.customClaims?.studentRole === true,
    name: user.displayName ?? null,
  };
}

// The side panel's Focus tab (F12): the teacher's Chrome Google token, never Firebase auth, so no View as.
export const focusPanelV1 = onRequest(
  {
    memory: OPTIONS.memory,
    timeoutSeconds: OPTIONS.timeoutSeconds,
    secrets: OPTIONS.secrets,
    invoker: 'public',
    maxInstances: 20,
  },
  async (req, res) => {
    try {
      if (req.method !== 'POST') throw new ExtensionCallError(405, 'Use POST.');
      const caller = await panelCaller(bearerToken(req.get('authorization')));
      res.json(
        await handleFocusPanel(admin.firestore(), caller, req.body, liveDeps)
      );
    } catch (error) {
      if (error instanceof ExtensionCallError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      if (error instanceof HttpsError && error.httpErrorCode.status < 500) {
        res.status(error.httpErrorCode.status).json({ error: error.message });
        return;
      }
      console.error('[focusPanel] failed:', error);
      res.status(500).json({ error: 'Something went wrong.' });
    }
  }
);

/** F6: ends sessions whose time ran out or whose window closed; status checks already treat a passed `endsAt` as over. */
export const focusSweepSessions = onSchedule(
  { schedule: 'every 1 minutes', memory: '256MiB', timeoutSeconds: 120 },
  async () => {
    const { ended, failed } = await sweepFocusSessions(
      admin.firestore(),
      Date.now(),
      liveDeps.wake
    );
    if (ended || failed) console.log('[focusSweep]', { ended, failed });
  }
);
