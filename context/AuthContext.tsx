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
import {
  auth,
  googleProvider,
  db,
  isAuthBypass,
  GOOGLE_OAUTH_SCOPES,
} from '../config/firebase';
import {
  FeaturePermission,
  WidgetType,
  GlobalFeaturePermission,
  GlobalFeature,
  GradeLevel,
  WidgetConfig,
  UserRolesConfig,
  AppSettings,
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
const GOOGLE_TOKEN_TTL_MS = 3600 * 1000; // 1 hour (Google's default access token lifetime)
const GOOGLE_TOKEN_CHECK_INTERVAL_MS = 60 * 1000; // How often to poll for expiry
const GOOGLE_TOKEN_REFRESH_THRESHOLD_MS = 10 * 60 * 1000; // Refresh this far before expiry
const GOOGLE_TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000; // Don't use tokens within 5 min of expiry

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
        Date.now() > parseInt(expiry, 10) - GOOGLE_TOKEN_EXPIRY_BUFFER_MS
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
  const [userRoles, setUserRoles] = useState<UserRolesConfig | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [featurePermissions, setFeaturePermissions] = useState<
    FeaturePermission[]
  >([]);
  const [globalPermissions, setGlobalPermissions] = useState<
    GlobalFeaturePermission[]
  >([]);
  const [selectedBuildings, setSelectedBuildingsState] = useState<string[]>([]);
  const [savedWidgetConfigs, setSavedWidgetConfigs] = useState<
    Partial<Record<WidgetType, Partial<WidgetConfig>>>
  >({});
  // Initialise from i18n.language. If i18n.init() hasn't resolved its async
  // language detection yet, the useEffect below will sync the state once it fires.
  const [language, setLanguageState] = useState<string>(
    () => i18n.language ?? 'en'
  );
  const [profileLoaded, setProfileLoaded] = useState(isAuthBypass);
  const [setupCompleted, setSetupCompletedState] = useState(isAuthBypass);
  // Tracks the latest setSelectedBuildings / setLanguage call to detect and suppress stale writes
  const writeTokenRef = useRef(0);
  const widgetConfigTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Prevents concurrent proactive token refresh calls from the checkToken interval
  const isRefreshingRef = useRef(false);
  // Prevents duplicate root-doc syncs within the same session
  const rootDocSyncedRef = useRef(false);

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

  const refreshGoogleToken = useCallback(
    async (silent: boolean = true): Promise<string | null> => {
      if (isAuthBypass) return MOCK_ACCESS_TOKEN;

      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as
        | string
        | undefined;
      const email = user?.email;

      // Prefer GIS silent refresh when the client ID env var is configured.
      // google.accounts is loaded asynchronously via the GIS script tag in index.html.
      if (clientId && email && typeof window.google !== 'undefined') {
        let gisToken: string | null = null;
        try {
          gisToken = await new Promise<string | null>((resolve) => {
            // Use optional chaining as a belt-and-suspenders guard: the outer
            // typeof check confirms window.google exists, but accounts/oauth2
            // sub-properties could still be absent if the GIS script partially
            // loaded or a future API change removes them.
            const tokenClient =
              window.google?.accounts?.oauth2?.initTokenClient({
                client_id: clientId,
                scope: GOOGLE_OAUTH_SCOPES.join(' '),
                hint: email,
                callback: (response: google.accounts.oauth2.TokenResponse) => {
                  try {
                    if (response.access_token) {
                      const expiryMs =
                        Date.now() +
                        (parseInt(response.expires_in ?? '3600', 10) || 3600) *
                          1000;
                      // Write token before expiry so that a fast page reload never
                      // finds an expiry key without its accompanying token.
                      // Note: two separate setItem calls are not truly atomic; this
                      // ordering minimises the window where expiry exists without token.
                      localStorage.setItem(
                        GOOGLE_ACCESS_TOKEN_KEY,
                        response.access_token
                      );
                      localStorage.setItem(
                        GOOGLE_TOKEN_EXPIRY_KEY,
                        expiryMs.toString()
                      );
                      setGoogleAccessToken(response.access_token);
                      resolve(response.access_token);
                    } else {
                      resolve(null);
                    }
                  } catch (err) {
                    console.error('Failed to handle GIS token response', err);
                    resolve(null);
                  }
                },
                error_callback: () => resolve(null),
              });
            if (!tokenClient) {
              resolve(null);
              return;
            }
            // prompt: '' = attempt silent authorization without showing a popup.
            // A popup only appears when the user's Google session has expired.
            tokenClient.requestAccessToken({ prompt: '' });
          });
        } catch {
          // initTokenClient or requestAccessToken threw synchronously.
          // Treat as a GIS failure so the silent/Firebase fallback logic below runs.
          gisToken = null;
        }

        // GIS succeeded — return immediately.
        if (gisToken) return gisToken;

        // GIS failed (e.g. domain not in authorized JavaScript origins).
        // For silent background refreshes, give up here to avoid unexpected popups.
        // For explicit user-triggered reconnects (silent=false), fall through to
        // the Firebase popup below, which uses the already-authorized Firebase
        // OAuth client and avoids redirect_uri_mismatch errors.
        if (silent) return null;
      }

      // Fallback: re-run Firebase popup sign-in to get a fresh access token.
      // Skip when called silently (e.g. from the background interval) — browsers
      // block popups that are not triggered by a direct user gesture.
      if (silent) return null;

      try {
        const result = await signInWithPopup(auth, googleProvider);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        if (credential) {
          const token = credential.accessToken ?? null;
          setGoogleAccessToken(token);
          if (token) {
            localStorage.setItem(
              GOOGLE_TOKEN_EXPIRY_KEY,
              (Date.now() + GOOGLE_TOKEN_TTL_MS).toString()
            );
          }
          return token;
        }
        return null;
      } catch (error) {
        console.error('Error refreshing Google token:', error);
        return null;
      }
    },
    [user?.email]
  );

  /**
   * Reconnect Google Drive without touching Firebase auth state.
   * Tries a silent GIS refresh first; falls back to a popup on failure.
   */
  const connectGoogleDrive = useCallback(async (): Promise<void> => {
    if (isAuthBypass) {
      setGoogleAccessToken(MOCK_ACCESS_TOKEN);
      localStorage.setItem(
        GOOGLE_TOKEN_EXPIRY_KEY,
        (Date.now() + GOOGLE_TOKEN_TTL_MS).toString()
      );
      return;
    }
    // Try a silent GIS refresh first; only fall back to a popup if it fails.
    const token = await refreshGoogleToken(true);
    if (!token) {
      await refreshGoogleToken(false);
    }
  }, [refreshGoogleToken]);

  // On startup: if the user has a Firebase session but the Drive token is
  // missing or expired, attempt a silent GIS refresh automatically.
  // This handles the common case where the 1-hour token expires between
  // sessions and the user reloads without going through the sidebar.
  useEffect(() => {
    if (isAuthBypass || !user) return;

    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as
      | string
      | undefined;
    if (!clientId) return;

    const stored = localStorage.getItem(GOOGLE_ACCESS_TOKEN_KEY);
    const expiry = localStorage.getItem(GOOGLE_TOKEN_EXPIRY_KEY);
    const hasValidToken =
      stored &&
      expiry &&
      Date.now() < parseInt(expiry, 10) - GOOGLE_TOKEN_EXPIRY_BUFFER_MS;

    if (hasValidToken) return;

    // GIS script is loaded async — poll every 200 ms until it's ready
    // rather than guessing a fixed delay, which can fail on slow networks.
    const pollGis = setInterval(() => {
      if (typeof window.google !== 'undefined') {
        clearInterval(pollGis);
        clearTimeout(pollTimeout);
        void refreshGoogleToken(true);
      }
    }, 200);
    // Safety valve: stop polling after 10 s to prevent indefinite loops.
    const pollTimeout = setTimeout(() => clearInterval(pollGis), 10000);

    return () => {
      clearInterval(pollGis);
      clearTimeout(pollTimeout);
    };
  }, [user, refreshGoogleToken]);

  // Check for Google token expiry every minute; proactively refresh before expiry
  // so the Drive connection stays alive without user interaction.
  useEffect(() => {
    if (isAuthBypass) return;

    const checkToken = async () => {
      const expiry = localStorage.getItem(GOOGLE_TOKEN_EXPIRY_KEY);
      if (!expiry) return;

      const expiryTime = parseInt(expiry, 10);
      const now = Date.now();

      if (now > expiryTime) {
        // Already expired — clear state
        setGoogleAccessToken(null);
        localStorage.removeItem(GOOGLE_ACCESS_TOKEN_KEY);
        localStorage.removeItem(GOOGLE_TOKEN_EXPIRY_KEY);
      } else if (now > expiryTime - GOOGLE_TOKEN_REFRESH_THRESHOLD_MS) {
        // Expiring soon — refresh proactively while the service is still valid.
        // Guard against concurrent calls if a previous refresh is still in flight.
        if (!isRefreshingRef.current) {
          isRefreshingRef.current = true;
          await refreshGoogleToken();
          isRefreshingRef.current = false;
        }
      }
    };

    const interval = setInterval(() => {
      void checkToken();
    }, GOOGLE_TOKEN_CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refreshGoogleToken]);

  // Persist googleAccessToken to localStorage
  useEffect(() => {
    if (isAuthBypass) return;
    if (googleAccessToken) {
      localStorage.setItem(GOOGLE_ACCESS_TOKEN_KEY, googleAccessToken);
    } else {
      localStorage.removeItem(GOOGLE_ACCESS_TOKEN_KEY);
    }
  }, [googleAccessToken]);

  // Listen to user roles
  useEffect(() => {
    if (isAuthBypass) return;
    if (!user) {
      setUserRoles(null);
      return;
    }

    const unsubscribe = onSnapshot(
      doc(db, 'admin_settings', 'user_roles'),
      (doc) => {
        if (doc.exists()) {
          setUserRoles(doc.data() as UserRolesConfig);
        } else {
          setUserRoles(null);
        }
      },
      (error) => {
        console.error('Error loading user roles:', error);
      }
    );

    const appSettingsUnsubscribe = onSnapshot(
      doc(db, 'admin_settings', 'app_settings'),
      (doc) => {
        if (doc.exists()) {
          setAppSettings(doc.data() as AppSettings);
        } else {
          setAppSettings(null);
        }
      },
      (error) => {
        console.error('Error loading app settings:', error);
      }
    );

    return () => {
      unsubscribe();
      appSettingsUnsubscribe();
    };
  }, [user]);

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

        // As per code review, we are keeping isAdmin aligned with the /admins collection
        // until a safer data model for roles is established, to avoid authorization failures
        // on writes since firestore.rules still only uses the /admins collection.
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
      // Reset stale state from the previous user before loading new profile
      setProfileLoaded(false);
      setSetupCompletedState(false);
      setSavedWidgetConfigs({});

      if (!user) {
        setSelectedBuildingsState([]);
        setSavedWidgetConfigs({});
        setProfileLoaded(true);
        return;
      }
      try {
        const profileDoc = await getDoc(
          doc(db, 'users', user.uid, 'userProfile', 'profile')
        );
        if (isCancelled) return;
        if (!profileDoc.exists()) {
          setSelectedBuildingsState([]);
          setSavedWidgetConfigs({});
          setProfileLoaded(true);
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

          // Load savedWidgetConfigs
          if (
            'savedWidgetConfigs' in data &&
            typeof data.savedWidgetConfigs === 'object' &&
            data.savedWidgetConfigs !== null
          ) {
            setSavedWidgetConfigs(
              data.savedWidgetConfigs as Partial<
                Record<WidgetType, Partial<WidgetConfig>>
              >
            );
          }

          // Load setupCompleted. The field is only written by the wizard on new
          // accounts, so its absence from an existing profile doc means the user
          // pre-dates the wizard — treat them as having completed setup already.
          setSetupCompletedState(
            !('setupCompleted' in data) || data.setupCompleted === true
          );

          setProfileLoaded(true);
          return;
        }
        // Profile exists but has no valid data; clear any previous selection.
        // Doc existence implies the user pre-dates or completed setup already.
        setSelectedBuildingsState([]);
        setSetupCompletedState(true);
        setProfileLoaded(true);
      } catch (error) {
        if (!isCancelled) {
          console.error('Error loading user profile:', error);
        }
        if (!isCancelled) setProfileLoaded(true);
      }
    };

    void loadProfile();
    return () => {
      isCancelled = true;
    };
  }, [user]);

  // Sync the root users/{uid} document so the admin analytics Cloud Function can
  // read email, lastLogin, and buildings without querying subcollections.
  useEffect(() => {
    if (!user || isAuthBypass || !profileLoaded) return;
    if (rootDocSyncedRef.current) return;
    rootDocSyncedRef.current = true;

    void setDoc(
      doc(db, 'users', user.uid),
      {
        email: user.email ?? '',
        lastLogin: Date.now(),
        buildings: selectedBuildings,
      },
      { merge: true }
    ).catch((err: unknown) => {
      console.error('Error syncing user root document:', err);
      // Reset so the next render can retry
      rootDocSyncedRef.current = false;
    });
  }, [user, profileLoaded, selectedBuildings]);

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
        // Keep root doc buildings in sync for admin analytics
        void setDoc(
          doc(db, 'users', user.uid),
          { buildings },
          { merge: true }
        ).catch((err: unknown) =>
          console.error('Error updating root doc buildings:', err)
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

  const completeSetup = useCallback(async () => {
    setSetupCompletedState(true);
    if (!user || isAuthBypass) return;
    try {
      await setDoc(
        doc(db, 'users', user.uid, 'userProfile', 'profile'),
        { setupCompleted: true },
        { merge: true }
      );
    } catch (error) {
      console.error('Error saving setup completion:', error);
    }
  }, [user]);

  const saveWidgetConfig = useCallback(
    (type: WidgetType, config: Partial<WidgetConfig>) => {
      setSavedWidgetConfigs((prev) => {
        const newConfigs = {
          ...prev,
          [type]: {
            ...(prev[type] ?? {}),
            ...config,
          },
        };

        if (widgetConfigTimeoutRef.current) {
          clearTimeout(widgetConfigTimeoutRef.current);
        }

        widgetConfigTimeoutRef.current = setTimeout(() => {
          if (!user || isAuthBypass) return;
          const myToken = ++writeTokenRef.current;
          setDoc(
            doc(db, 'users', user.uid, 'userProfile', 'profile'),
            { savedWidgetConfigs: newConfigs },
            { merge: true }
          ).catch((error) => {
            if (myToken === writeTokenRef.current) {
              console.error('Error saving widget configs:', error);
            }
          });
        }, 1000);

        return newConfigs;
      });
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
        rootDocSyncedRef.current = false;
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Helper for checking if a user has beta access
  const isBetaUser = useCallback(
    (betaUsers: string[], email: string | null | undefined) => {
      const lowerEmail = email?.toLowerCase() ?? '';
      return (
        betaUsers.some((e) => e.toLowerCase() === lowerEmail) ||
        (userRoles?.betaTeachers?.some((e) => e.toLowerCase() === lowerEmail) ??
          false) ||
        (userRoles?.superAdmins?.some((e) => e.toLowerCase() === lowerEmail) ??
          false)
      );
    },
    [userRoles]
  );

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
          return isBetaUser(permission.betaUsers, user.email);
        case 'public':
          return true;
        default:
          return false;
      }
    },
    [user, featurePermissions, isAdmin, isBetaUser]
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
          return isBetaUser(permission.betaUsers, user.email);
        case 'public':
          return true;
        default:
          return false;
      }
    },
    [user, globalPermissions, isAdmin, isBetaUser]
  );

  const signInWithGoogle = async () => {
    if (isAuthBypass) {
      console.warn('Bypassing Google Sign In');
      setUser(MOCK_USER);
      setGoogleAccessToken(MOCK_ACCESS_TOKEN);
      localStorage.setItem(
        GOOGLE_TOKEN_EXPIRY_KEY,
        (Date.now() + GOOGLE_TOKEN_TTL_MS).toString()
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
          localStorage.setItem(
            GOOGLE_TOKEN_EXPIRY_KEY,
            (Date.now() + GOOGLE_TOKEN_TTL_MS).toString()
          );
        }
      }
    } catch (error) {
      console.error('Sign in error:', error);
      throw error;
    }
  };

  const updateAppSettings = useCallback(
    async (updates: Partial<AppSettings>) => {
      if (!isAdmin || isAuthBypass) return;
      try {
        await setDoc(doc(db, 'admin_settings', 'app_settings'), updates, {
          merge: true,
        });
      } catch (error) {
        console.error('Error updating app settings:', error);
        throw error;
      }
    },
    [isAdmin]
  );

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
        userRoles,
        appSettings,
        featurePermissions,
        globalPermissions,
        updateAppSettings,
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
        connectGoogleDrive,
        savedWidgetConfigs,
        saveWidgetConfig,
        profileLoaded,
        setupCompleted,
        completeSetup,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
