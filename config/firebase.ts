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
 */
export const isAuthBypass = import.meta.env.VITE_AUTH_BYPASS === 'true';

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let storage: FirebaseStorage;
let functions: Functions;
let googleProvider: GoogleAuthProvider;

/** All Google OAuth scopes the app requests at sign-in and when refreshing tokens. */
export const GOOGLE_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/calendar.readonly',
];

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
