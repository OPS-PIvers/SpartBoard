// focusStatusV1 and focusReportV1: the student's extension, signed in with its Chrome Google token (CHROME_EXTENSION.md F3, H7).
import '../functionsInit';
import { createHash } from 'node:crypto';
import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import {
  CLASSLINK_CLIENT_ID,
  CLASSLINK_CLIENT_SECRET,
  CLASSLINK_TENANT_URL,
  STUDENT_PSEUDONYM_HMAC_SECRET,
} from '../secrets';
import {
  EXTENSION_OAUTH_CLIENTS,
  ExtensionCallError,
  bearerToken,
  fetchTokenInfo,
  verifiedTokenEmail,
} from '../webTourExtension';
import {
  StudentLookupError,
  resolveStudentByEmail,
} from '../studentEmailIdentity';
import {
  FOCUS_PUSH_COLLECTION,
  FOCUS_SESSIONS_COLLECTION,
  FOCUS_SETTINGS_DOC,
  FOCUS_STUDENTS_SUBCOLLECTION,
  FOCUS_STUDENT_EMAIL_DOMAIN,
  FOCUS_TTL_FIELD,
  type FocusSessionDoc,
  type FocusStudentDoc,
} from './shared.gen';
import {
  FocusCallError,
  focusReport,
  focusStatus,
  isSessionRunning,
  type FocusStudentStore,
} from './studentStatus';

type Firestore = admin.firestore.Firestore;

const SIGN_IN = 'Sign in to Chrome with your school account.';
const MAX_OPEN_SESSIONS = 10;
const CACHE_MAX = 5_000;
const TOKEN_CACHE_MS = 10 * 60_000;
const UID_CACHE_MS = 60 * 60_000;
const NO_UID_CACHE_MS = 10 * 60_000;
const SETTINGS_CACHE_MS = 30_000;

/** Insertion-ordered map that drops its oldest entry when full. */
class BoundedCache<V> {
  private readonly map = new Map<string, V>();
  get(key: string): V | undefined {
    return this.map.get(key);
  }
  set(key: string, value: V): void {
    this.map.delete(key);
    if (this.map.size >= CACHE_MAX) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, value);
  }
}

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

// Instance memory only: each student device checks every 5 minutes, so Google and ClassLink see a fraction of the calls.
const tokenCache = new BoundedCache<{ email: string; until: number }>();
const uidCache = new BoundedCache<{ uid: string | null; until: number }>();
const pushCache = new BoundedCache<string>();
let settingsCache: { showLiveSite: boolean; until: number } | null = null;

async function tokenEmail(
  token: string,
  clientId: string,
  now: number
): Promise<string> {
  const key = sha256(token);
  const hit = tokenCache.get(key);
  if (hit && hit.until > now) return hit.email;
  let expiresIn = 0;
  const email = await verifiedTokenEmail(
    token,
    {
      clientId,
      tokenInfo: async (t) => {
        const info = await fetchTokenInfo(t);
        expiresIn = Number(info?.expires_in) || 0;
        return info;
      },
    },
    FOCUS_STUDENT_EMAIL_DOMAIN,
    SIGN_IN
  );
  tokenCache.set(key, {
    email,
    until: now + Math.min(expiresIn * 1000, TOKEN_CACHE_MS),
  });
  return email;
}

/** The student's pseudonym uid, or null when they aren't on a roster or a mock class. */
async function studentUid(
  db: Firestore,
  email: string,
  now: number
): Promise<string | null> {
  const key = sha256(email);
  const hit = uidCache.get(key);
  if (hit && hit.until > now) return hit.uid;
  const secrets = {
    hmacSecret: STUDENT_PSEUDONYM_HMAC_SECRET.value(),
    classlinkClientId: CLASSLINK_CLIENT_ID.value(),
    classlinkClientSecret: CLASSLINK_CLIENT_SECRET.value(),
    tenantUrl: CLASSLINK_TENANT_URL.value(),
  };
  if (Object.values(secrets).some((v) => !v)) {
    console.error('[focusStudent] Missing required server configuration.');
    throw new FocusCallError(503, 'Focus sessions are not set up yet.');
  }
  let uid: string | null;
  try {
    uid = (await resolveStudentByEmail(db, { email }, secrets, 'focusStudent'))
      .uid;
  } catch (err) {
    if (!(err instanceof StudentLookupError)) throw err;
    if (err.reason === 'roster-unavailable')
      throw new FocusCallError(503, 'Roster service unavailable.');
    uid = null;
  }
  uidCache.set(key, {
    uid,
    until: now + (uid ? UID_CACHE_MS : NO_UID_CACHE_MS),
  });
  return uid;
}

const pushFingerprint = (p: { endpoint: string; keys: object } | null) =>
  p ? sha256(JSON.stringify([p.endpoint, p.keys])) : '';

function firestoreStore(db: Firestore): FocusStudentStore {
  const sessions = db.collection(FOCUS_SESSIONS_COLLECTION);
  const studentRef = (sessionId: string, uid: string) =>
    sessions.doc(sessionId).collection(FOCUS_STUDENTS_SUBCOLLECTION).doc(uid);
  return {
    async openSessionsFor(uid) {
      const snap = await sessions
        .where('studentUids', 'array-contains', uid)
        .where('endedAt', '==', null)
        .limit(MAX_OPEN_SESSIONS)
        .get();
      if (snap.empty) return [];
      const students = await db.getAll(
        ...snap.docs.map((d) => studentRef(d.id, uid))
      );
      return snap.docs.map((d, i) => ({
        id: d.id,
        session: d.data() as FocusSessionDoc,
        student: students[i].exists
          ? (students[i].data() as FocusStudentDoc)
          : null,
      }));
    },
    promote(sessionId, uid, now) {
      return db.runTransaction(async (tx) => {
        const [session, student] = await Promise.all([
          tx.get(sessions.doc(sessionId)),
          tx.get(studentRef(sessionId, uid)),
        ]);
        if (
          !session.exists ||
          !isSessionRunning(session.data() as FocusSessionDoc, now) ||
          student.get('status') !== 'other-session'
        )
          return false;
        tx.update(student.ref, { status: 'waiting', otherSessionEndsAt: null });
        return true;
      });
    },
    async savePush(uid, push, now) {
      const print = pushFingerprint(push);
      if (pushCache.get(uid) === print) return;
      const ref = db.collection(FOCUS_PUSH_COLLECTION).doc(uid);
      const snap = await ref.get();
      const stored = snap.exists
        ? pushFingerprint({
            endpoint: String(snap.get('endpoint')),
            keys: snap.get('keys') as object,
          })
        : '';
      if (stored !== print) {
        if (push) await ref.set({ ...push, updatedAt: now });
        else await ref.delete();
      }
      pushCache.set(uid, print);
    },
    async showLiveSite() {
      const now = Date.now();
      if (settingsCache && settingsCache.until > now)
        return settingsCache.showLiveSite;
      const snap = await db
        .collection('admin_settings')
        .doc(FOCUS_SETTINGS_DOC)
        .get();
      const showLiveSite = snap.get('showLiveSite') === true;
      settingsCache = { showLiveSite, until: now + SETTINGS_CACHE_MS };
      return showLiveSite;
    },
    report(sessionId, uid, apply) {
      return db.runTransaction(async (tx) => {
        const [session, student] = await Promise.all([
          tx.get(sessions.doc(sessionId)),
          tx.get(studentRef(sessionId, uid)),
        ]);
        const sessionDoc = session.exists
          ? (session.data() as FocusSessionDoc)
          : null;
        const { write, active } = apply(
          sessionDoc,
          student.exists ? (student.data() as FocusStudentDoc) : null
        );
        if (write && student.exists) tx.update(student.ref, { ...write });
        else if (write)
          // The start normally writes this doc; a missing one keeps the session's TTL so it still expires.
          tx.set(student.ref, {
            ...write,
            otherSessionEndsAt: null,
            ...(sessionDoc?.[FOCUS_TTL_FIELD] !== undefined
              ? { [FOCUS_TTL_FIELD]: sessionDoc[FOCUS_TTL_FIELD] }
              : {}),
          });
        return active;
      });
    },
  };
}

type Handler = (
  body: unknown,
  uid: string | null,
  store: FocusStudentStore,
  now: number
) => Promise<unknown>;

const studentEndpoint = (handler: Handler) =>
  onRequest(
    {
      memory: '256MiB',
      timeoutSeconds: 30,
      invoker: 'public',
      maxInstances: 30,
      secrets: [
        CLASSLINK_CLIENT_ID,
        CLASSLINK_CLIENT_SECRET,
        CLASSLINK_TENANT_URL,
        STUDENT_PSEUDONYM_HMAC_SECRET,
      ],
    },
    async (req, res) => {
      try {
        if (req.method !== 'POST') throw new FocusCallError(405, 'Use POST.');
        const clientId =
          EXTENSION_OAUTH_CLIENTS[process.env.GCLOUD_PROJECT ?? ''] ?? '';
        if (!clientId)
          throw new FocusCallError(503, 'Focus sessions are not set up yet.');
        const now = Date.now();
        const db = admin.firestore();
        const email = await tokenEmail(
          bearerToken(req.get('authorization')),
          clientId,
          now
        );
        const uid = await studentUid(db, email, now);
        res.json(await handler(req.body, uid, firestoreStore(db), now));
      } catch (error) {
        if (
          error instanceof FocusCallError ||
          error instanceof ExtensionCallError
        ) {
          res.status(error.status).json({ error: error.message });
          return;
        }
        // Class of failure only: never the token, the email or the request.
        console.error(
          '[focusStudent] failed:',
          error instanceof Error ? error.name : 'unknown'
        );
        res.status(500).json({ error: 'Something went wrong.' });
      }
    }
  );

/** The student's one running session, or none; also keeps their Web Push subscription. */
export const focusStatusV1 = studentEndpoint((body, uid, store, now) =>
  uid
    ? focusStatus(body, uid, store, now)
    : Promise.resolve({ session: null, serverNow: now })
);

/** On task, away and blocked tries for the student's session, at most once a minute plus each change. */
export const focusReportV1 = studentEndpoint((body, uid, store, now) => {
  if (!uid) throw new FocusCallError(403, "You aren't in a focus session.");
  return focusReport(body, uid, store, now);
});
