import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, Auth } from 'firebase/auth';
import { Firestore, initializeFirestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import { getFunctions, Functions } from 'firebase/functions';

const apiKey = import.meta.env.VITE_FIREBASE_API_KEY as string | undefined;

// Export a flag to check if firebase is configured
export const isConfigured = !!apiKey;

/**
 * Authentication bypass flag.
 *
 * Controlled via the Vite environment variable `VITE_AUTH_BYPASS`.
 *
 * IMPORTANT SECURITY WARNING:
 * - This must only ever be used in development or automated testing.
 * - It must NEVER be enabled in production, as it bypasses normal auth.
 *
 * Defense-in-depth: the bypass is honored ONLY when the app is served from a
 * localhost origin (local `pnpm dev` and the Playwright E2E `vite preview`
 * server, both on localhost:3000). On ANY deployed origin — spartboard.web.app,
 * *.firebaseapp.com, dev-preview channels — it is force-disabled at runtime,
 * regardless of how the bundle was built. So even if a production bundle is
 * accidentally built with VITE_AUTH_BYPASS=true and shipped via a manual
 * `firebase deploy`, the deployed app can never authenticate as the mock user.
 *
 * This is a runtime ORIGIN check rather than `import.meta.env.PROD` on purpose:
 * the E2E suite runs a *production* build (`vite build && vite preview`) on
 * localhost and legitimately needs the bypass, so a `!PROD` guard would break
 * it. Origin distinguishes "served locally for dev/test" from "deployed".
 */
const isLocalhostOrigin =
  typeof window !== 'undefined' &&
  /^(localhost|127\.0\.0\.1|\[::1\]|::1)$/.test(window.location.hostname);

export const isAuthBypass =
  import.meta.env.VITE_AUTH_BYPASS === 'true' && isLocalhostOrigin;

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let storage: FirebaseStorage;
let functions: Functions;
let googleProvider: GoogleAuthProvider;

/**
 * Google OAuth scopes the app requests at sign-in and when SILENTLY refreshing
 * the shared access token.
 *
 * Path B (docs/wide-distro-plan.md): the login request asks ONLY for the
 * unrestricted `drive.file` scope — which needs no Google verification — so the
 * app can ship to external/unverified users without a consent-screen warning.
 *
 * The two "sensitive" scopes formerly listed here (`spreadsheets`,
 * `calendar.readonly`) are now acquired ON DEMAND the first time a user touches
 * Sheets/Calendar, via `AuthContext.ensureGoogleScope` (GIS token client). For
 * every existing user who already granted them, the on-demand acquisition is a
 * SILENT re-mint (no popup) and their experience is unchanged; for a
 * never-granted user it surfaces a one-time consent on first use.
 *
 * IMPORTANT: dropping a scope from this REQUEST does NOT drop it from an
 * existing GRANT. A user who previously consented to Sheets/Calendar keeps that
 * grant; the narrowed login simply stops asking new users for it up front.
 *
 * Deliberately excludes restricted scopes (e.g. drive.readonly): the Google
 * Picker grants per-file access under drive.file via PickerBuilder.setAppId,
 * so broad Drive read access is never needed.
 *
 * NOTE: a token minted from a single grant carries ALL scopes that grant
 * authorized, regardless of which subset is named in any one request. So a
 * silent re-mint here returns a token that already includes Sheets/Calendar for
 * users who granted them — see `ensureGoogleScope`.
 */
export const GOOGLE_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
];

/**
 * Sensitive scopes acquired on demand (NOT at login). Centralized so the
 * on-demand acquisition call sites and any future audit reference one source.
 */
export const GOOGLE_SHEETS_SCOPE =
  'https://www.googleapis.com/auth/spreadsheets';
export const GOOGLE_CALENDAR_READONLY_SCOPE =
  'https://www.googleapis.com/auth/calendar.readonly';

if (isConfigured) {
  const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string,
    messagingSenderId: import.meta.env
      .VITE_FIREBASE_MESSAGING_SENDER_ID as string,
    appId: import.meta.env.VITE_FIREBASE_APP_ID as string,
  };

  // Initialize Firebase
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = initializeFirestore(app, {
    ignoreUndefinedProperties: true,
    experimentalForceLongPolling: true,
  });
  storage = getStorage(app);
  functions = getFunctions(app, 'us-central1');
  googleProvider = new GoogleAuthProvider();
  GOOGLE_OAUTH_SCOPES.forEach((scope) => googleProvider.addScope(scope));
  // Force Google's consent screen on every sign-in. Without this, returning
  // users who previously authorized SpartBoard with fewer scopes get a
  // Firebase user without a Drive accessToken — they then have to click
  // "Connect Drive" manually to recover their data on a new device.
  googleProvider.setCustomParameters({ prompt: 'consent' });
} else {
  // Mock objects to prevent crashes when importing
  auth = {
    currentUser: null,
    onAuthStateChanged: () => {
      return () => {
        /* no-op */
      };
    },
    signOut: async () => {
      /* no-op */
    },
    signInWithPopup: async () => {
      /* no-op */
    },
  } as unknown as Auth;

  db = {} as unknown as Firestore;
  storage = {} as unknown as FirebaseStorage;
  functions = {} as unknown as Functions;
  googleProvider = {} as unknown as GoogleAuthProvider;
  app = {} as unknown as FirebaseApp;
  console.warn('Firebase is not configured. Missing VITE_FIREBASE_API_KEY.');
}

export { auth, db, storage, functions, googleProvider };
