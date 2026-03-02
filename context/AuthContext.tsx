import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import {
  User,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  GoogleAuthProvider,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  collection,
  onSnapshot,
} from 'firebase/firestore';
import { auth, googleProvider, db, isAuthBypass } from '../config/firebase';
import {
  FeaturePermission,
  WidgetType,
  GlobalFeaturePermission,
  GlobalFeature,
  GradeLevel,
} from '../types';
import { AuthContext } from './AuthContextValue';
import { getBuildingGradeLevels } from '../config/buildings';
import i18n from '../i18n';

/**
 * IMPORTANT: Authentication bypass / mock user mode
 *
 * This file supports a special "auth bypass" mode controlled by `isAuthBypass`
 * from `config/firebase.ts`. When that flag is enabled, the app skips the
 * normal Firebase Authentication flow and instead uses a local mock `User`
 * instance (`MOCK_USER`) as if a real Firebase user had signed in.
 *
 * SECURITY IMPLICATIONS
 * ---------------------
 * - This mechanism is intended ONLY for local development, automated tests,
 *   or tightly controlled demo environments.
 * - It MUST NOT be enabled in production, staging, or any environment exposed
 *   to untrusted users. Treat it like a "god mode" that removes real auth.
 * - The mock user is created entirely on the client. Any code that trusts
 *   client-side state alone (without verifying Firebase ID tokens and claims)
 *   would be insecure if auth bypass were accidentally enabled in production.
 *
 * FIRESTORE RULES AND SERVER-SIDE ENFORCEMENT
 * -------------------------------------------
 * - Firestore Security Rules remain the ultimate source of truth for data
 *   access. They must NEVER assume that auth bypass is active.
 * - Rules and any server-side logic (Cloud Functions, backend services) should
 *   always authorize based on verified Firebase Auth tokens and claims, not
 *   on any client-side flags or the presence of `MOCK_USER`.
 * - Do not grant privileged access solely because this context reports an
 *   authenticated user; backends must still validate the ID token issued by
 *   Firebase Auth. In bypass mode, any such token is mock data and MUST NOT
 *   be accepted by trusted backends.
 *
 * USAGE GUIDELINES
 * ----------------
 * - Ensure `isAuthBypass` is derived from a development-only configuration
 *   (e.g., dev env var) and defaults to `false`.
 * - Never commit or deploy configuration that enables auth bypass in
 *   production builds.
 * - Any future changes to auth or permissions logic should be reviewed with
 *   this bypass mode in mind to avoid accidentally weakening security.
 */

// Constants for mock data consistency
const MOCK_TOKEN = 'mock-token';
const MOCK_ACCESS_TOKEN = 'mock-google-access-token';
const MOCK_TIME = new Date().toISOString(); // Fixed time at module load

const GOOGLE_ACCESS_TOKEN_KEY = 'spart_google_access_token';
const GOOGLE_TOKEN_EXPIRY_KEY = 'spart_google_token_expiry';

/**
 * Mock user object for bypass mode.
 * Defined at module level to ensure referential equality.
 * Timestamps are fixed at module load time for consistency.
 */
const MOCK_USER = {
  uid: 'mock-user-id',
  email: 'mock@example.com',
  displayName: 'Mock User',
  emailVerified: true,
  isAnonymous: false,
  photoURL: null,
  phoneNumber: null,
  providerData: [],
  metadata: {
    creationTime: MOCK_TIME,
    lastSignInTime: MOCK_TIME,
  },
  tenantId: null,
  delete: () => {
    // No-op for mock user
    return Promise.resolve();
  },
  getIdToken: () => {
    // Return fixed mock token
    return Promise.resolve(MOCK_TOKEN);
  },
  getIdTokenResult: () => {
    // Return fixed mock token result with consistent timestamps
    return Promise.resolve({
      token: MOCK_TOKEN,
      expirationTime: new Date(
        new Date(MOCK_TIME).getTime() + 3600000
      ).toISOString(),
      authTime: MOCK_TIME,
      issuedAtTime: MOCK_TIME,
      signInProvider: 'google',
      signInSecondFactor: null,
      claims: {},
    });
  },
  reload: () => {
    // No-op for mock user
    return Promise.resolve();
  },
  toJSON: () => ({}),
} as unknown as User;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(
    isAuthBypass ? MOCK_USER : null
  );
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(
    () => {
      if (isAuthBypass) return MOCK_ACCESS_TOKEN;
      const token = localStorage.getItem(GOOGLE_ACCESS_TOKEN_KEY);
      const expiry = localStorage.getItem(GOOGLE_TOKEN_EXPIRY_KEY);

      // If token is expired or about to expire (within 5 mins), don't load it
      if (
        token &&
        expiry &&
        Date.now() > parseInt(expiry, 10) - 5 * 60 * 1000
      ) {
        localStorage.removeItem(GOOGLE_ACCESS_TOKEN_KEY);
        localStorage.removeItem(GOOGLE_TOKEN_EXPIRY_KEY);
        return null;
      }
      return token;
    }
  );
  // Note: In bypass mode we initialize `loading` to false because the mock user
  // and admin status are set synchronously above. This makes the auth state
  // appear "ready" immediately for faster local development and testing.
  const [loading, setLoading] = useState(!isAuthBypass);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(
    isAuthBypass ? true : null
  ); // null = not yet checked
  const [featurePermissions, setFeaturePermissions] = useState<
    FeaturePermission[]
  >([]);
  const [globalPermissions, setGlobalPermissions] = useState<
    GlobalFeaturePermission[]
  >([]);
  const [selectedBuildings, setSelectedBuildingsState] = useState<string[]>([]);
  // Initialise from i18n.language. If i18n.init() hasn't resolved its async
  // language detection yet, the useEffect below will sync the state once it fires.
  const [language, setLanguageState] = useState<string>(
    () => i18n.language ?? 'en'
  );
  // Tracks the latest setSelectedBuildings / setLanguage call to detect and suppress stale writes
  const writeTokenRef = useRef(0);

  // Keep language state in sync with i18next, including the async startup
  // detection that may resolve after the first render.
  useEffect(() => {
    const handleLanguageChange = (lng: string) => {
      setLanguageState(lng);
    };
    i18n.on('languageChanged', handleLanguageChange);
    // Catch cases where detection finished before this effect mounted
    if (i18n.language && i18n.language !== language) {
      setLanguageState(i18n.language);
    }
    return () => {
      i18n.off('languageChanged', handleLanguageChange);
    };
    // language intentionally omitted — we only want to subscribe once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Check for Google token expiry periodically
  useEffect(() => {
    if (isAuthBypass) return;

    const checkToken = () => {
      const expiry = localStorage.getItem(GOOGLE_TOKEN_EXPIRY_KEY);
      if (expiry && Date.now() > parseInt(expiry, 10)) {
        setGoogleAccessToken(null);
        localStorage.removeItem(GOOGLE_ACCESS_TOKEN_KEY);
        localStorage.removeItem(GOOGLE_TOKEN_EXPIRY_KEY);
      }
    };

    const interval = setInterval(checkToken, 60000); // Check every minute
    return () => clearInterval(interval);
  }, []);

  // Persist googleAccessToken to localStorage
  useEffect(() => {
    if (isAuthBypass) return;
    if (googleAccessToken) {
      localStorage.setItem(GOOGLE_ACCESS_TOKEN_KEY, googleAccessToken);
    } else {
      localStorage.removeItem(GOOGLE_ACCESS_TOKEN_KEY);
    }
  }, [googleAccessToken]);

  // Check if user is admin
  useEffect(() => {
    if (isAuthBypass) return;

    const checkAdminStatus = async () => {
      if (!user?.email) {
        setIsAdmin(null);
        return;
      }

      try {
        const adminDoc = await getDoc(
          doc(db, 'admins', user.email.toLowerCase())
        );
        setIsAdmin(adminDoc.exists());
      } catch (error) {
        console.error('Error checking admin status:', error);
        setIsAdmin(false);
      }
    };

    void checkAdminStatus();
  }, [user]);

  // Listen to feature permissions (only when authenticated)
  useEffect(() => {
    if (isAuthBypass) return;

    // Don't set up listener if user is not authenticated
    if (!user) {
      // Don't call setState synchronously in an effect - let it happen naturally
      return;
    }

    const unsubscribe = onSnapshot(
      collection(db, 'feature_permissions'),
      (snapshot) => {
        const permissions: FeaturePermission[] = [];
        snapshot.forEach((doc) => {
          permissions.push(doc.data() as FeaturePermission);
        });
        setFeaturePermissions(permissions);
      },
      (error) => {
        console.error('Error loading feature permissions:', error);
      }
    );

    const globalUnsubscribe = onSnapshot(
      collection(db, 'global_permissions'),
      (snapshot) => {
        const permissions: GlobalFeaturePermission[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data() as GlobalFeaturePermission;
          if (!data.featureId) data.featureId = doc.id as GlobalFeature;
          permissions.push(data);
        });
        setGlobalPermissions(permissions);
      },
      (error) => {
        // Log error with more context to help debugging if it persists
        if (auth.currentUser) {
          console.error(
            `[AuthContext] Firestore Error (${error.code}):`,
            error.message
          );
        }
      }
    );

    return () => {
      unsubscribe();
      globalUnsubscribe();
    };
  }, [user]);

  // Load user profile (selectedBuildings) from Firestore when user signs in
  useEffect(() => {
    if (isAuthBypass) return;

    let isCancelled = false;

    const loadProfile = async () => {
      if (!user) {
        setSelectedBuildingsState([]);
        return;
      }
      try {
        const profileDoc = await getDoc(
          doc(db, 'users', user.uid, 'userProfile', 'profile')
        );
        if (isCancelled) return;
        if (!profileDoc.exists()) {
          setSelectedBuildingsState([]);
          return;
        }
        const rawData: unknown = profileDoc.data();
        if (typeof rawData === 'object' && rawData !== null) {
          const data = rawData as Record<string, unknown>;

          // Load selectedBuildings
          if ('selectedBuildings' in data) {
            const { selectedBuildings } = data as {
              selectedBuildings: unknown;
            };
            if (
              Array.isArray(selectedBuildings) &&
              selectedBuildings.every((id) => typeof id === 'string')
            ) {
              setSelectedBuildingsState(selectedBuildings);
            } else {
              setSelectedBuildingsState([]);
            }
          } else {
            setSelectedBuildingsState([]);
          }

          // Load language preference
          if (
            'language' in data &&
            typeof data.language === 'string' &&
            data.language.length > 0
          ) {
            const savedLang = data.language;
            setLanguageState(savedLang);
            void i18n.changeLanguage(savedLang);
          }
          return;
        }
        // Profile exists but has no valid data; clear any previous selection
        setSelectedBuildingsState([]);
      } catch (error) {
        if (!isCancelled) {
          console.error('Error loading user profile:', error);
        }
      }
    };

    void loadProfile();
    return () => {
      isCancelled = true;
    };
  }, [user]);

  const setSelectedBuildings = useCallback(
    async (buildings: string[]) => {
      setSelectedBuildingsState(buildings);
      if (!user || isAuthBypass) return;
      // Assign a token so we can detect if a newer call supersedes this one
      const myToken = ++writeTokenRef.current;
      try {
        await setDoc(
          doc(db, 'users', user.uid, 'userProfile', 'profile'),
          { selectedBuildings: buildings },
          { merge: true }
        );
      } catch (error) {
        // Only log if this is still the latest write (not superseded by a newer one)
        if (myToken === writeTokenRef.current) {
          console.error('Error saving user profile:', error);
        }
      }
    },
    [user]
  );

  const setLanguage = useCallback(
    async (lang: string) => {
      // i18n.changeLanguage() triggers the 'languageChanged' event, which the
      // effect above uses to update React state — no manual setLanguageState needed.
      void i18n.changeLanguage(lang);
      if (!user || isAuthBypass) return;
      const myToken = ++writeTokenRef.current;
      try {
        await setDoc(
          doc(db, 'users', user.uid, 'userProfile', 'profile'),
          { language: lang },
          { merge: true }
        );
      } catch (error) {
        if (myToken === writeTokenRef.current) {
          console.error('Error saving language preference:', error);
        }
      }
    },
    [user]
  );

  const userGradeLevels = useMemo<GradeLevel[]>(
    () => getBuildingGradeLevels(selectedBuildings),
    [selectedBuildings]
  );

  // Auth state listener
  useEffect(() => {
    if (isAuthBypass) return;

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      if (!user) {
        setGoogleAccessToken(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Check if user can access a specific widget
  // Wrapped in useCallback to prevent unnecessary re-renders since this function
  // is passed through context and used in component dependencies
  const canAccessWidget = useCallback(
    (widgetType: WidgetType): boolean => {
      // In bypass mode, always allow everything
      if (isAuthBypass) return true;

      if (!user) return false;

      const permission = featurePermissions.find(
        (p: FeaturePermission) => p.widgetType === widgetType
      );

      // Default behavior: If no permission record exists, allow public access
      // This means new widgets are accessible to all authenticated users until
      // an admin explicitly configures permissions
      if (!permission) return true;

      // If the feature is disabled, no one can access it (including admins)
      if (!permission.enabled) return false;

      // Admins can access everything (except disabled features)
      if (isAdmin) return true;

      // Check access level for non-admin users
      switch (permission.accessLevel) {
        case 'admin':
          return false; // Only admins can access
        case 'beta':
          return permission.betaUsers.includes(user.email ?? '');
        case 'public':
          return true;
        default:
          return false;
      }
    },
    [user, featurePermissions, isAdmin]
  );

  const canAccessFeature = useCallback(
    (featureId: GlobalFeature): boolean => {
      if (isAuthBypass) return true;
      if (!user) return false;

      const permission = globalPermissions.find(
        (p) => p.featureId === featureId
      );

      if (!permission) return true;
      if (!permission.enabled) return false;
      if (isAdmin) return true;

      switch (permission.accessLevel) {
        case 'admin':
          return false;
        case 'beta':
          return permission.betaUsers.includes(user.email ?? '');
        case 'public':
          return true;
        default:
          return false;
      }
    },
    [user, globalPermissions, isAdmin]
  );

  const signInWithGoogle = async () => {
    if (isAuthBypass) {
      console.warn('Bypassing Google Sign In');
      setUser(MOCK_USER);
      setGoogleAccessToken(MOCK_ACCESS_TOKEN);
      localStorage.setItem(
        GOOGLE_TOKEN_EXPIRY_KEY,
        (Date.now() + 3600 * 1000).toString()
      );
      setIsAdmin(true); // Restore admin status on sign in
      return;
    }
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential) {
        const token = credential.accessToken ?? null;
        setGoogleAccessToken(token);
        if (token) {
          // Tokens usually last 1 hour (3600s). Save expiry time.
          localStorage.setItem(
            GOOGLE_TOKEN_EXPIRY_KEY,
            (Date.now() + 3600 * 1000).toString()
          );
        }
      }
    } catch (error) {
      console.error('Sign in error:', error);
      throw error;
    }
  };

  const refreshGoogleToken = async (): Promise<string | null> => {
    if (isAuthBypass) return MOCK_ACCESS_TOKEN;

    try {
      // Re-running signInWithPopup with the same provider will refresh the credential.
      // If the user is already signed into Chrome and has authorized, this
      // is usually very quick and sometimes doesn't even show a full UI interaction.
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential) {
        const token = credential.accessToken ?? null;
        setGoogleAccessToken(token);
        if (token) {
          localStorage.setItem(
            GOOGLE_TOKEN_EXPIRY_KEY,
            (Date.now() + 3600 * 1000).toString()
          );
        }
        return token;
      }
      return null;
    } catch (error) {
      console.error('Error refreshing Google token:', error);
      return null;
    }
  };

  const signOut = async () => {
    if (isAuthBypass) {
      console.warn('Bypassing Sign Out');
      setUser(null);
      setGoogleAccessToken(null);
      setIsAdmin(null); // Clear admin status on sign out (consistent with non-bypass behavior)
      setFeaturePermissions([]); // Clear feature permissions on sign out in bypass mode
      return;
    }
    try {
      await firebaseSignOut(auth);
      setGoogleAccessToken(null);
    } catch (error) {
      console.error('Sign out error:', error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        googleAccessToken,
        loading,
        isAdmin,
        featurePermissions,
        globalPermissions,
        canAccessWidget,
        canAccessFeature,
        signInWithGoogle,
        signOut,
        selectedBuildings,
        userGradeLevels,
        setSelectedBuildings,
        language,
        setLanguage,
        refreshGoogleToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
