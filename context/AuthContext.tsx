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
  signInAnonymously,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  GoogleAuthProvider,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  collection,
  onSnapshot,
  limit,
  query,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  auth,
  googleProvider,
  db,
  functions,
  isAuthBypass,
  GOOGLE_OAUTH_SCOPES,
  GOOGLE_DRIVE_FILE_SCOPE,
  GOOGLE_SHEETS_SCOPE,
  GOOGLE_CALENDAR_READONLY_SCOPE,
} from '@/config/firebase';
import {
  FeaturePermission,
  WidgetType,
  GlobalFeaturePermission,
  GlobalFeature,
  GradeLevel,
  WidgetConfig,
  UserRolesConfig,
  AppSettings,
  DockPosition,
  AssignmentMode,
  AssignmentWidgetKey,
  UserTier,
} from '@/types';
import type { MemberRecord, BuildingRecord } from '@/types/organization';
import { AuthContext } from './AuthContextValue';
import {
  buildingRecordToBuilding,
  canonicalizeBuildingIds,
  canonicalizeBuildingKeyedRecord,
  getBuildingGradeLevels,
} from '@/config/buildings';
import i18n from '@/i18n';
import { GoogleDriveService } from '@/utils/googleDriveService';
import { onDriveTokenChange } from '@/utils/driveAuthErrors';
import { reportGlobalPermissionsError } from '@/utils/globalPermissionsErrors';
import {
  refreshAccessTokenViaBackend,
  requestAndExchangeAuthCode,
  revokeBackendRefreshToken,
} from '@/utils/googleOAuthRefresh';
import { logError } from '@/utils/logError';
import {
  FEATURE_DEFAULTS,
  WIDGET_DEFAULT_MIN_TIER,
} from '@/config/featureDefaults';
import { stripTransientKeys } from '@/utils/widgetConfigPersistence';
import { parseAssignmentModesConfig } from '@/utils/assignmentModesConfig';
import {
  canWriteLastActive,
  stampLastActive,
} from '@/utils/lastActiveThrottle';
import { deriveUserTier, meetsMinTier } from '@/utils/userTier';

// The operator's own organization. Two narrow uses remain after dynamic
// org resolution shipped:
//   1. Auth-bypass / mock mode seeds this so local dev has a working org.
//   2. Resilience fallback: if the `resolveOrgForUser` callable is
//      unavailable (e.g. mid-deploy, transient outage), we fall back to
//      looking up membership in the operator org so existing internal users
//      are never locked out. External users simply won't have a member doc
//      there and resolve to the free tier — the correct degraded behavior.
// Every signed-in user's actual org is resolved dynamically from their email
// domain via `resolveOrgForUser` (see the membership effect below).
const OPERATOR_ORG_ID = 'orono';

/** Session cache of a POSITIVE org resolution keyed by lowercased email, so
 * repeat loads within a session skip the `resolveOrgForUser` round-trip.
 * Deliberately only caches a resolved orgId — a "no org" result is never
 * cached so a user who gets invited mid-session picks up their org on the
 * next load without needing a new browser session. */
const RESOLVED_ORG_CACHE_PREFIX = 'spart_resolved_org:';

/**
 * Resolves which organization a signed-in user belongs to from their verified
 * email domain, via the `resolveOrgForUser` callable. Returns the orgId, or
 * null when the domain isn't registered to any org (free/no-org tier).
 *
 * Caches positive resolutions per-email in sessionStorage so we only pay the
 * callable round-trip once per session for org members. Throws on transport
 * failure so callers can apply their own resilience fallback (the operator-org
 * lookup).
 */
async function resolveOrgIdForUser(emailLower: string): Promise<string | null> {
  try {
    const cached = sessionStorage.getItem(
      RESOLVED_ORG_CACHE_PREFIX + emailLower
    );
    if (cached) return cached;
  } catch {
    // sessionStorage unavailable (private mode / SSR) — fall through to the call.
  }

  const callable = httpsCallable<unknown, { orgId: string | null }>(
    functions,
    'resolveOrgForUser'
  );
  const { data } = await callable({});
  const orgId = data?.orgId ?? null;

  if (orgId) {
    try {
      sessionStorage.setItem(RESOLVED_ORG_CACHE_PREFIX + emailLower, orgId);
    } catch {
      // Best-effort cache only.
    }
  }
  return orgId;
}

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

// Inactivity-based session timeout: force re-login after 7 days of no app usage
// so stale Google OAuth tokens (Drive, Calendar, Sheets) get fully refreshed.
const LAST_ACTIVITY_KEY = 'spart_last_activity';
const INACTIVITY_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const ACTIVITY_UPDATE_INTERVAL_MS = 5 * 60 * 1000; // Update activity timestamp every 5 minutes

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

/**
 * Wraps a real anonymous Firebase User so it presents mock email/displayName
 * to the UI while preserving the real uid and auth methods. The real uid is
 * critical: Firestore security rules enforce `request.auth.uid == userId`,
 * so data paths like `/users/{uid}/...` must match the anonymous user's uid.
 */
const makeHybridBypassUser = (anonUser: User): User =>
  new Proxy(anonUser, {
    get(target, prop, receiver) {
      if (prop === 'email') return MOCK_USER.email;
      if (prop === 'displayName') return MOCK_USER.displayName;
      const value: unknown = Reflect.get(target, prop, receiver);
      return typeof value === 'function'
        ? (value as (...args: unknown[]) => unknown).bind(target)
        : value;
    },
  });

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  // In bypass mode, start with no user until anonymous Firebase auth completes.
  // This keeps `user.uid` consistent with `request.auth.uid` for Firestore rules.
  const [user, setUser] = useState<User | null>(null);
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
  // Even in bypass mode, start loading=true until anonymous Firebase auth
  // resolves so `user.uid` is ready before any Firestore reads fire.
  const [loading, setLoading] = useState(true);
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
  const [disableCloseConfirmation, setDisableCloseConfirmationState] =
    useState(false);
  const [remoteControlEnabled, setRemoteControlEnabledState] = useState(true);
  const [dockPosition, setDockPositionState] = useState<DockPosition>('bottom');
  // Default colors-on so existing teachers see the same tinted rows they're
  // used to. When the field is absent from a profile doc (older accounts)
  // we still treat them as opted-in.
  const [quizMonitorColorsEnabled, setQuizMonitorColorsEnabledState] =
    useState(true);
  const [quizMonitorScoreDisplay, setQuizMonitorScoreDisplayState] = useState<
    'percent' | 'count' | 'hidden'
  >('percent');
  const [lastActiveCollectionId, setLastActiveCollectionIdState] = useState<
    string | null | undefined
  >(undefined);
  const [lastBoardIdByCollection, setLastBoardIdByCollectionState] = useState<
    Record<string, string> | undefined
  >(undefined);
  const [orgId, setOrgId] = useState<string | null>(
    isAuthBypass ? OPERATOR_ORG_ID : null
  );
  const [roleId, setRoleId] = useState<string | null>(
    isAuthBypass ? 'super_admin' : null
  );
  // Sticky, session-scoped "this account has been deactivated" flag (M1 full
  // sign-in lockout). Set true the moment the org-member snapshot reports
  // `status === 'inactive'`; once true it STAYS true for the rest of the JS
  // session even after we sign the user out. That stickiness is deliberate:
  // signOut() nulls `user`, which would otherwise drop the app back to the
  // LoginScreen and lose the "your access was deactivated" message. The
  // consumer (AuthenticatedApp) renders a dedicated DeactivatedScreen on this
  // flag REGARDLESS of `user`, so the deactivated teacher gets a clear reason
  // rather than a silent bounce. A fresh sign-in attempt clears it (see
  // signInWithGoogle).
  const [accessDeactivated, setAccessDeactivated] = useState<boolean>(false);
  const [isStudentRole, setIsStudentRole] = useState<boolean>(false);
  // Two-part "have we figured out who this user is" gate. Both flags must be
  // true for `roleResolved` to flip true. They're reset synchronously when
  // `user` changes (see the adjusting-state block below) so a transition
  // between users doesn't briefly carry the previous user's resolved state.
  const [studentRoleResolved, setStudentRoleResolved] =
    useState<boolean>(isAuthBypass);
  const [membershipResolved, setMembershipResolved] =
    useState<boolean>(isAuthBypass);
  // Tracks whether the membership listener has EVER resolved a non-null orgId
  // for the current session. Used by the onSnapshot error handler to decide
  // whether there is any "last-known" org state worth preserving across a
  // transient error: on first load (never resolved) there is nothing real to
  // keep, so a transient error clears rather than preserving stale state.
  const everResolvedOrgIdRef = useRef<boolean>(false);
  const [resolvedForUser, setResolvedForUser] = useState<User | null>(null);
  const [buildingIds, setBuildingIds] = useState<string[]>([]);
  const [orgBuildings, setOrgBuildings] = useState<BuildingRecord[]>([]);
  const [orgBuildingsLoaded, setOrgBuildingsLoaded] =
    useState<boolean>(isAuthBypass);
  const [favoriteBackgrounds, setFavoriteBackgrounds] = useState<string[]>([]);
  const [recentBackgrounds, setRecentBackgrounds] = useState<string[]>([]);
  // Refs that always hold the latest list values so rapid callbacks don't close over stale state
  const favoritesRef = useRef<string[]>([]);
  const recentsRef = useRef<string[]>([]);
  favoritesRef.current = favoriteBackgrounds;
  recentsRef.current = recentBackgrounds;
  // Tracks the latest setSelectedBuildings / setLanguage call to detect and suppress stale writes
  const writeTokenRef = useRef(0);
  const widgetConfigTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Prevents concurrent proactive token refresh calls from the checkToken interval
  const isRefreshingRef = useRef(false);
  // Prevents duplicate root-doc syncs within the same session
  const rootDocSyncedRef = useRef(false);
  // Prevents duplicate member-doc `lastActive` stamps within the same session
  // Scopes the in-flight guard per (uid, orgId) so switching orgs in the
  // same JS context (or signing out and back in as a different user)
  // re-arms the write. A plain boolean would latch the first target
  // forever within a session.
  const memberLastActiveSyncedKeyRef = useRef<string | null>(null);
  // Tracks the uid we've already run the returning-user Drive probe for, so
  // a token refresh later in the session doesn't re-probe and re-write the
  // profile doc. Cleared on sign-out.
  const driveProbedForUidRef = useRef<string | null>(null);
  const firestoreProbedForUidRef = useRef<string | null>(null);

  // Reset role-resolution flags synchronously when `user` changes. Without
  // this, a re-render between users would briefly carry the previous user's
  // resolved=true state, causing AppContent's student guard or
  // DashboardContext's auto-create gate to act on stale data. Setting state
  // during render (a supported React pattern: react.dev/learn/you-might-not-
  // need-an-effect#adjusting-some-state-when-a-prop-changes) avoids the
  // extra render that an effect would introduce.
  if (resolvedForUser !== user) {
    setResolvedForUser(user);
    setStudentRoleResolved(isAuthBypass);
    setMembershipResolved(isAuthBypass);
    setIsStudentRole(false);
  }
  const roleResolved = studentRoleResolved && membershipResolved;

  // Shared gate for the "needs a real, non-bypass signed-in user" effects.
  // De-duplicates the `if (isAuthBypass) return; if (!user) return;` pair that
  // several listeners open with. Only applied to effects whose no-user branch
  // is a plain no-op return — effects that must RESET state when `user` is
  // null (profile load, membership, admin check, etc.) keep their own
  // explicit guards so their reset semantics and timing stay untouched.
  const hasLiveUser = !isAuthBypass && !!user;

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

  // In-flight silent refresh shared across concurrent callers. Multiple
  // widgets and hooks (sidebar, Firestore listeners, quiz export) can call
  // `refreshGoogleToken()` simultaneously when the token expires; without
  // dedup each one independently enters the GIS → backend → popup chain,
  // potentially firing multiple concurrent backend requests. Only the
  // silent path dedups — explicit user-triggered reconnects (silent=false)
  // always run their own chain so a click on "Reconnect" never gets
  // suppressed by a background refresh that bailed early.
  const inFlightSilentRefreshRef = useRef<Promise<string | null> | null>(null);

  // Sensitive scopes acquired on demand THIS SESSION via `ensureGoogleScope`
  // (Path B), stored as fully-qualified scope URLs. GIS access tokens are
  // scoped to the REQUEST, not the full grant — a token minted for ONLY
  // `spreadsheets` does NOT carry `drive.file`. Since every mint here persists
  // into the single shared `googleAccessToken`, EVERY re-mint path (this ref's
  // consumers below) must request the UNION of `GOOGLE_OAUTH_SCOPES` + these,
  // or a Sheets/Calendar acquisition would silently STRIP `drive.file` from the
  // active token (breaking the Picker/Drive) and the ~10-min proactive refresh
  // loop would then strip the on-demand scope right back off. In-memory only:
  // empty after reload is fine, because the first feature use re-calls
  // `ensureGoogleScope`, which re-adds the scope and re-mints the union BEFORE
  // the feature reads the token. Already-granted users (all current Orono
  // users) re-mint the union silently with NO popup.
  const onDemandScopesRef = useRef<Set<string>>(new Set());

  // Build the scope string for any token mint that persists into the shared
  // `googleAccessToken`: the login scope(s) plus every on-demand scope acquired
  // this session, de-duplicated. Using this everywhere keeps the single shared
  // token a strict SUPERSET so no refresh path ever strips a previously-acquired
  // scope.
  const buildPersistScope = useCallback(
    (): string =>
      Array.from(
        new Set([...GOOGLE_OAUTH_SCOPES, ...onDemandScopesRef.current])
      ).join(' '),
    []
  );

  // Distinguish the two failure modes the GIS token client surfaces, both of
  // which previously collapsed to a bare `null` in the refresh chain:
  //   - `denied`     — GIS fired `error_callback` (re-consent genuinely
  //                    needed, or the user dismissed the popup). Actionable:
  //                    the teacher must reconnect Drive from a real click.
  //   - `unavailable`— GIS was non-functional (null tokenClient because the
  //                    script partially loaded / the oauth2 namespace was
  //                    absent, an empty token response, or a thrown handler).
  //                    Actionable in a different way: a transient/environment
  //                    problem, not a consent decision.
  // Keeping them apart lets the refresh handler log a distinct, triageable
  // signal instead of swallowing both as a generic null. The control flow is
  // unchanged: anything other than `token` still falls through to the backend
  // refresh below.
  type GisTokenResult =
    | { kind: 'token'; token: string }
    | { kind: 'denied' }
    | { kind: 'unavailable'; reason: string };

  const refreshGoogleToken = useCallback(
    async (silent: boolean = true): Promise<string | null> => {
      if (isAuthBypass) return MOCK_ACCESS_TOKEN;
      if (silent && inFlightSilentRefreshRef.current) {
        return inFlightSilentRefreshRef.current;
      }

      // Treat `expires_in` as untrusted: Google's spec says positive
      // seconds, but a buggy/clock-skewed response of 0 or negative would
      // store an immediately-stale expiry and trigger an infinite refresh
      // loop. Fall back to 1 hour for anything we can't treat as positive.
      const computeExpiryMs = (raw: unknown): number => {
        const seconds =
          typeof raw === 'number' && Number.isFinite(raw) && raw > 0
            ? raw
            : 3600;
        return Date.now() + seconds * 1000;
      };

      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as
        | string
        | undefined;
      const email = user?.email;

      const runRefreshChain = async (): Promise<string | null> => {
        // Try the GIS token client first — it silently re-mints the
        // Drive/Sheets access token from the user's live Google session, which
        // is the ONLY zero-touch renewal path for the majority of teachers (a
        // plain signInWithGoogle() popup yields a 1h token but no server-side
        // refresh_token, so the backend path below can't renew theirs). The
        // catch: `requestAccessToken({ prompt: '' })` is only silent when a
        // grant can be reissued; otherwise it opens a popup, and a popup fired
        // from our background timers/startup effect (silent=true) has no user
        // gesture and gets BLOCKED — stalling every Drive read. So pass
        // `prompt: 'none'` for silent calls (see requestAccessToken below): GIS
        // then fails via error_callback with no popup when re-consent is truly
        // needed, the chain returns null, and `DriveDisconnectBanner` lets the
        // teacher reconnect from a real click (which runs the code flow and
        // finally captures a refresh_token).
        if (clientId && email && typeof window.google !== 'undefined') {
          let gisResult: GisTokenResult = {
            kind: 'unavailable',
            reason: 'gis-init-threw',
          };
          try {
            gisResult = await new Promise<GisTokenResult>((resolve) => {
              // Use optional chaining as a belt-and-suspenders guard: the outer
              // typeof check confirms window.google exists, but accounts/oauth2
              // sub-properties could still be absent if the GIS script partially
              // loaded or a future API change removes them.
              const tokenClient =
                window.google?.accounts?.oauth2?.initTokenClient({
                  client_id: clientId,
                  // Request the UNION (login + on-demand scopes acquired this
                  // session) so this re-mint MAINTAINS any Sheets/Calendar scope
                  // instead of stripping it back off the shared token.
                  scope: buildPersistScope(),
                  hint: email,
                  callback: (
                    response: google.accounts.oauth2.TokenResponse
                  ) => {
                    try {
                      if (response.access_token) {
                        const expiryMs = computeExpiryMs(
                          parseInt(response.expires_in ?? '3600', 10)
                        );
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
                        resolve({
                          kind: 'token',
                          token: response.access_token,
                        });
                      } else {
                        // A 200 with no access_token is a malformed GIS
                        // response, not a consent decision — treat as
                        // unavailable so the chain falls through to backend.
                        resolve({
                          kind: 'unavailable',
                          reason: 'empty-token-response',
                        });
                      }
                    } catch (err) {
                      console.error('Failed to handle GIS token response', err);
                      resolve({
                        kind: 'unavailable',
                        reason: 'token-callback-threw',
                      });
                    }
                  },
                  // error_callback fires when GIS declines to silently reissue
                  // (re-consent needed) or the user dismissed the popup. This
                  // is a consent signal, distinct from the unavailable cases.
                  error_callback: () => resolve({ kind: 'denied' }),
                });
              if (!tokenClient) {
                // GIS not initialized — script partially loaded or the
                // accounts/oauth2 namespace is missing.
                resolve({ kind: 'unavailable', reason: 'null-token-client' });
                return;
              }
              // Background/timer calls (silent) use `prompt: 'none'` so GIS
              // never opens a gesture-less popup the browser would block — it
              // fails via error_callback instead. User-gesture reconnects
              // (silent=false) use `''`, which may surface the consent/account
              // popup (allowed, since a click backs it).
              tokenClient.requestAccessToken({ prompt: silent ? 'none' : '' });
            });
          } catch {
            // initTokenClient or requestAccessToken threw synchronously.
            // Treat as a GIS failure so the silent/Firebase fallback logic below runs.
            gisResult = { kind: 'unavailable', reason: 'gis-init-threw' };
          }

          // GIS succeeded — return immediately.
          if (gisResult.kind === 'token') return gisResult.token;

          // GIS failed. Log the differentiated reason so ops can tell a
          // consent re-prompt (`denied`) apart from a broken/absent GIS
          // environment (`unavailable`) instead of seeing a generic null.
          // Either way we fall through to the backend refresh below — the
          // control flow is identical to before, only the logging is new.
          if (gisResult.kind === 'denied') {
            logError(
              'AuthContext.refreshGoogleToken.gisDenied',
              new Error(
                `GIS declined to silently reissue (silent=${silent}); ` +
                  're-consent required.'
              )
            );
          } else {
            logError(
              'AuthContext.refreshGoogleToken.gisUnavailable',
              new Error(`GIS unavailable: ${gisResult.reason}`)
            );
          }
        }

        // Backend refresh BEFORE the Firebase popup: ask the server for a
        // fresh access_token using the stored refresh_token. This is what
        // makes Drive auth survive Google-session expiry (closed browser,
        // signed out of Google in another tab, etc.) — the refresh_token
        // lives server-side and isn't tied to the browser's Google session
        // at all. Safe to attempt in silent mode because the callable runs
        // without any UI surface.
        const backendOutcome = await refreshAccessTokenViaBackend();
        if (backendOutcome.status === 'ok') {
          const expiryMs = computeExpiryMs(backendOutcome.expiresIn);
          localStorage.setItem(GOOGLE_ACCESS_TOKEN_KEY, backendOutcome.token);
          localStorage.setItem(GOOGLE_TOKEN_EXPIRY_KEY, expiryMs.toString());
          setGoogleAccessToken(backendOutcome.token);
          return backendOutcome.token;
        }

        // Backend reported the refresh_token is missing or revoked. For a
        // user-triggered (non-silent) call we can escalate to the auth-code
        // flow, which captures a fresh refresh_token via GIS popup. Silent
        // calls bail rather than popping unexpected consent dialogs.
        if (backendOutcome.status === 'needs-consent' && !silent) {
          // `VITE_GOOGLE_CLIENT_ID` unset is treated as "feature off, fall
          // through to Firebase popup" — common in dev/test where the
          // GIS code-flow client isn't configured.
          const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as
            | string
            | undefined;
          if (clientId) {
            const exchanged = await requestAndExchangeAuthCode(
              clientId,
              email ?? undefined,
              // Capture the refresh_token with the UNION so backend refreshes
              // keep reissuing Sheets/Calendar instead of a drive.file-only token.
              Array.from(onDemandScopesRef.current)
            );
            if (exchanged.kind === 'success') {
              const result = exchanged.result;
              const expiryMs = computeExpiryMs(result.expiresIn);
              localStorage.setItem(GOOGLE_ACCESS_TOKEN_KEY, result.accessToken);
              localStorage.setItem(
                GOOGLE_TOKEN_EXPIRY_KEY,
                expiryMs.toString()
              );
              setGoogleAccessToken(result.accessToken);
              return result.accessToken;
            }
            if (exchanged.kind === 'error') {
              // Real GIS/exchange failure — log so ops can see whether
              // org-policy blocks (`admin_policy_enforced`) or partial
              // consent are the dominant failure modes before we fall
              // through to the Firebase popup.
              logError(
                'AuthContext.requestAndExchangeAuthCode',
                exchanged.reason
              );
            } else if (exchanged.kind === 'needs-consent') {
              // Backend rejected the grant structurally (partial-consent,
              // etc.). Falling back to the Firebase popup will hit the
              // same rejection, but the user at least gets a fresh
              // access_token good for one hour.
              logError(
                'AuthContext.requestAndExchangeAuthCode.needsConsent',
                new Error(`needs-consent: ${exchanged.cause}`)
              );
            }
            // exchanged.kind === 'cancelled' → silent user dismissal, no log
          }
        }

        // For silent background refreshes, give up here to avoid unexpected popups.
        // For explicit user-triggered reconnects (silent=false), fall through to
        // the Firebase popup below, which uses the already-authorized Firebase
        // OAuth client and avoids redirect_uri_mismatch errors.
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
      };

      if (silent) {
        const promise = runRefreshChain().finally(() => {
          inFlightSilentRefreshRef.current = null;
        });
        inFlightSilentRefreshRef.current = promise;
        return promise;
      }
      return runRefreshChain();
    },
    [user?.email, buildPersistScope]
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

  /**
   * Ensure the shared Google access token carries an on-demand sensitive scope
   * (`spreadsheets`, `calendar.readonly`) that Path B no longer requests at
   * login. See the JSDoc on `AuthContextType.ensureGoogleScope` for the full
   * contract; the short version:
   *   0. If the scope is already granted THIS session (`onDemandScopesRef`) and
   *      a live `googleAccessToken` exists, return it immediately — no GIS
   *      roundtrip, no popup. The live token already carries the scope.
   *   1. INTERACTIVE (user gesture) — go straight to `prompt:''` with NO silent
   *      pre-flight, so the user-gesture context is preserved for the consent
   *      popup (an intervening `await` gets the popup blocked on Safari/iOS).
   *      `prompt:''` returns granted-scope tokens WITHOUT forced consent, so
   *      already-granted users still see zero UI.
   *   2. NON-INTERACTIVE (background) — silent re-mint (`prompt:'none'`) only;
   *      never a popup. Zero-touch for already-granted users.
   *   3. On success, PERSIST into the same localStorage keys + `googleAccessToken`
   *      state the rest of the app reads, so every Sheets/Calendar consumer
   *      transparently picks up the (multi-scope) token.
   *   4. Return the token, or null on silent-miss/decline/error. Never throws.
   *
   * Deliberately reuses the GIS token-client + persistence machinery from
   * `refreshGoogleToken` rather than rewiring call sites: a single shared
   * multi-scope token means persisting here is sufficient.
   *
   * KNOWN MINOR FOLLOW-UP: this lacks in-flight dedup — concurrent silent
   * probes (e.g. CalendarWidget + AdminCalendarFetcher firing at once) issue
   * two parallel GIS requests. Non-catastrophic: add-on-success is idempotent
   * and the last persisted token wins; a shared in-flight promise would just
   * save one redundant request.
   */
  const ensureGoogleScope = useCallback(
    async (
      scope: string,
      opts?: { interactive?: boolean }
    ): Promise<string | null> => {
      if (isAuthBypass) return MOCK_ACCESS_TOKEN;

      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as
        | string
        | undefined;
      const email = user?.email;
      if (!clientId || !email || typeof window.google === 'undefined') {
        // No GIS client/identity available — cannot acquire on demand. The
        // caller degrades to its existing "Google access required" branch.
        return null;
      }

      // GIS requires fully-qualified scope URLs. Call sites pass short keys
      // (`spreadsheets`, `calendar.readonly`) for readability; map them to the
      // canonical `https://www.googleapis.com/auth/...` URL here so the SILENT
      // re-mint actually MATCHES an existing grant (a bare key would never
      // match, breaking the zero-prompt path for already-granted users). An
      // already-fully-qualified scope is passed through unchanged.
      const SCOPE_ALIASES: Record<string, string> = {
        'drive.file': GOOGLE_DRIVE_FILE_SCOPE,
        spreadsheets: GOOGLE_SHEETS_SCOPE,
        'calendar.readonly': GOOGLE_CALENDAR_READONLY_SCOPE,
      };
      const resolvedScope = scope.startsWith('https://')
        ? scope
        : (SCOPE_ALIASES[scope] ?? scope);

      // EARLY RETURN — the live `googleAccessToken` already carries
      // `resolvedScope`, so skip the GIS roundtrip entirely (avoids a redundant
      // silent re-mint AND, on interactive calls, re-opening a popup some
      // browsers block). True in two cases:
      //   - The scope was granted on demand THIS session — once in
      //     `onDemandScopesRef`, every re-mint path (`buildPersistScope`) keeps
      //     it in the union, so the live token carries it. The ref only holds a
      //     scope AFTER a confirmed grant, so this never returns a stale-scope
      //     token.
      //   - The scope is a LOGIN scope (`GOOGLE_OAUTH_SCOPES`, i.e.
      //     `drive.file`) that every minted token already includes. This is the
      //     fast path for the create-new Sheets/Picker flows, which request
      //     `drive.file` and must NOT trigger a fresh consent.
      if (
        (onDemandScopesRef.current.has(resolvedScope) ||
          GOOGLE_OAUTH_SCOPES.includes(resolvedScope)) &&
        googleAccessToken
      ) {
        return googleAccessToken;
      }

      // ADD-ON-SUCCESS-ONLY. We do NOT add `resolvedScope` to
      // `onDemandScopesRef` before minting. The ref is the single source of
      // truth for every OTHER re-mint path (the startup silent refresh, the
      // ~10-min proactive refresh, `refreshGoogleToken`'s GIS path, the
      // code-flow) via `buildPersistScope()`. Adding a not-yet-granted scope
      // there before we know it can be granted creates a race: a concurrent
      // background refresh (`prompt:'none'`) could read the ref mid-flight and
      // request a scope the user never consented to — which GIS REJECTS for
      // silent requests, transiently failing the refresh and, on stricter
      // responses, stripping `drive.file` from the shared token. So instead:
      //   - For THIS mint only, request the UNION ad-hoc (login scopes + every
      //     already-granted on-demand scope + `resolvedScope`) so the mint still
      //     actually asks for the new scope WITH `drive.file` (a scope-only
      //     token would strip `drive.file` once persisted as the shared token).
      //   - Only AFTER a SUCCESSFUL mint do we add `resolvedScope` to the ref so
      //     future refreshes maintain it.
      //   - On any failure the ref is left UNCHANGED — it never transiently
      //     holds a never-granted scope, so concurrent background refreshes stay
      //     safe and the "no poison" property is deterministic.
      const requestScope = Array.from(
        new Set([
          ...GOOGLE_OAUTH_SCOPES,
          ...onDemandScopesRef.current,
          resolvedScope,
        ])
      ).join(' ');

      // Untrusted `expires_in` guard, mirroring refreshGoogleToken.
      const computeExpiryMs = (raw: unknown): number => {
        const seconds =
          typeof raw === 'number' && Number.isFinite(raw) && raw > 0
            ? raw
            : 3600;
        return Date.now() + seconds * 1000;
      };

      const persist = (token: string, expiresInRaw: string | undefined) => {
        const expiryMs = computeExpiryMs(parseInt(expiresInRaw ?? '3600', 10));
        // Write token before expiry so a fast reload never finds an expiry key
        // without its token (same ordering rationale as refreshGoogleToken).
        localStorage.setItem(GOOGLE_ACCESS_TOKEN_KEY, token);
        localStorage.setItem(GOOGLE_TOKEN_EXPIRY_KEY, expiryMs.toString());
        setGoogleAccessToken(token);
      };

      // Run one GIS token request at the given prompt mode. Resolves with the
      // token on success or null on any failure (declined, popup blocked,
      // GIS unavailable, malformed response, thrown handler) — never rejects,
      // so the caller's null-degradation path is the only failure surface.
      const runGis = (prompt: '' | 'none'): Promise<string | null> =>
        new Promise<string | null>((resolve) => {
          try {
            const tokenClient =
              window.google?.accounts?.oauth2?.initTokenClient({
                client_id: clientId,
                // Request the ad-hoc UNION for THIS mint: login scopes + every
                // already-granted on-demand scope + `resolvedScope`. NOT just
                // `resolvedScope` (a scope-only token would strip `drive.file`
                // from the shared token and break the Picker), and NOT
                // `buildPersistScope()` (which excludes `resolvedScope` until we
                // succeed — see ADD-ON-SUCCESS-ONLY above).
                scope: requestScope,
                hint: email,
                callback: (response: google.accounts.oauth2.TokenResponse) => {
                  try {
                    if (response.access_token) {
                      persist(response.access_token, response.expires_in);
                      resolve(response.access_token);
                    } else {
                      resolve(null);
                    }
                  } catch (err) {
                    console.error(
                      'Failed to handle GIS ensureGoogleScope response',
                      err
                    );
                    resolve(null);
                  }
                },
                // Silent: re-consent needed → no popup, error_callback fires.
                // Interactive: user dismissed/blocked the popup.
                error_callback: () => resolve(null),
              });
            if (!tokenClient) {
              resolve(null);
              return;
            }
            tokenClient.requestAccessToken({ prompt });
          } catch {
            resolve(null);
          }
        });

      // Add to the session set ONLY after a confirmed grant, so future re-mints
      // (`buildPersistScope`) maintain the scope. Failure leaves the ref
      // unchanged — it never transiently holds a never-granted scope.
      const markGranted = () => onDemandScopesRef.current.add(resolvedScope);

      // INTERACTIVE — go STRAIGHT to the popup-capable `prompt:''`, with NO
      // silent `prompt:'none'` first. Rationale: an `await` before opening the
      // consent popup loses the synchronous user-gesture context (Safari/iOS
      // pop-up blockers reject a popup not opened in the same task as the
      // click). GIS `prompt:''` does NOT force the consent screen for
      // already-granted scopes — it silently returns the token — so this branch
      // still issues zero extra UI for granted users, while preserving the
      // gesture for the never-granted case where the consent popup must appear.
      if (opts?.interactive) {
        const interactive = await runGis('');
        if (interactive) {
          markGranted();
          return interactive;
        }
        // Declined/blocked — scope never granted; ref untouched.
        return null;
      }

      // NON-INTERACTIVE (background effect) — silent only, NEVER a popup. A
      // missed silent re-mint degrades cleanly to null; the ref is left
      // unmutated so subsequent drive.file-only refreshes stay clean.
      const silent = await runGis('none');
      if (silent) {
        markGranted();
        return silent;
      }
      return null;
    },
    [user?.email, googleAccessToken]
  );

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

  /**
   * Clear the Google Drive token without touching Firebase auth.
   *
   * Awaits the server-side revoke so the caller (sidebar Disconnect button)
   * sees a truthful success/failure signal. Without awaiting, a backend
   * revoke failure would silently leave the refresh_token live and the
   * next refresh interval would re-arm Drive access — a privacy/trust
   * regression for a user who clicked "Disconnect" intentionally.
   *
   * Throws on backend revoke failure; callers should catch and surface a
   * toast directing the user to revoke at myaccount.google.com manually.
   */
  const disconnectGoogleDrive = useCallback(async (): Promise<void> => {
    localStorage.removeItem(GOOGLE_ACCESS_TOKEN_KEY);
    localStorage.removeItem(GOOGLE_TOKEN_EXPIRY_KEY);
    setGoogleAccessToken(null);
    try {
      await revokeBackendRefreshToken();
    } catch (err) {
      logError('AuthContext.disconnectGoogleDrive.revoke', err);
      throw err;
    }
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

  // Broadcast token rotations to any subscriber that needs to refetch.
  //
  // Lives in AuthContext (the source of truth for `googleAccessToken`)
  // rather than relying on `useGoogleDrive` to fan it out — that hook is
  // only mounted inside DashboardProvider, so widgets/hooks that read the
  // token directly from AuthContext would otherwise miss the signal.
  // `onDriveTokenChange` deduplicates on `lastSeenToken`, so the parallel
  // call from `useGoogleDrive` is a harmless no-op once we fire first.
  useEffect(() => {
    onDriveTokenChange(googleAccessToken);
  }, [googleAccessToken]);

  // Listen to user roles + app settings.
  //
  // Both docs live under `/admin_settings/*`, which Firestore rules restrict
  // to admins (firestore.rules: `match /admin_settings/{document=**}` requires
  // isAdmin()). Subscribing for non-admins fired permission-denied errors on
  // every page load. Gate on `isAdmin === true` so the listeners only attach
  // once admin status has resolved positively; for `null` (loading) and
  // `false` (non-admin) we clear any stale config and stay quiet.
  useEffect(() => {
    if (isAuthBypass) return;
    if (!user || isAdmin !== true) {
      setUserRoles(null);
      setAppSettings(null);
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
  }, [user, isAdmin]);

  // Check if user is admin
  useEffect(() => {
    if (isAuthBypass) return;

    // Reset to the loading state immediately when the user changes so the
    // settings listener effect (gated on isAdmin === true) doesn't act on
    // stale admin status from a previous user during a sign-out → sign-in
    // transition while AuthContext stays mounted.
    setIsAdmin(null);

    const checkAdminStatus = async () => {
      if (!user?.email) return;

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

  // Resolve the `studentRole` custom claim on the signed-in Firebase user.
  // Real SSO students minted by `studentLoginV1` have `email: null`, so the
  // org-members snapshot below never fires for them — meaning `roleId`
  // stays null and a `roleId === 'student'` guard alone misses them.
  // The claim is the only reliable client-side signal for an SSO student;
  // App.tsx and DashboardContext.tsx both consume `isStudentRole` to keep
  // them out of the teacher app.
  useEffect(() => {
    if (isAuthBypass) return;
    if (!user) {
      setIsStudentRole(false);
      // No user means there's nothing to resolve — keep `roleResolved`
      // accurate for the signed-out state so the LoginScreen/redirect
      // pipeline can still depend on it without stalling.
      setStudentRoleResolved(true);
      return;
    }
    // Capture the uid this effect run is resolving for, so a fast
    // sign-out/in transition can't let the previous user's claim
    // promise overwrite the new user's state. The effect-cleanup
    // `cancelled` flag covers the common case via React's lifecycle,
    // but a uid check is a cheap belt-and-suspenders against any
    // microtask-ordering edge case.
    const startUid = user.uid;
    let cancelled = false;
    user
      .getIdTokenResult()
      .then((result) => {
        if (cancelled || auth.currentUser?.uid !== startUid) return;
        setIsStudentRole(result.claims.studentRole === true);
        setStudentRoleResolved(true);
      })
      .catch((err) => {
        if (cancelled || auth.currentUser?.uid !== startUid) return;
        console.error('[AuthContext] Failed to read studentRole claim:', err);
        setIsStudentRole(false);
        setStudentRoleResolved(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Subscribe to organization membership. The user's org is resolved
  // dynamically from their verified email domain via the `resolveOrgForUser`
  // callable (any registered district works, not just the operator org), then
  // we subscribe to that org's member doc. Rules allow a signed-in user to
  // read their own member doc (`request.auth.token.email.lower() ==
  // resource.id`) in ANY org, so this listener works for non-admins too.
  useEffect(() => {
    if (isAuthBypass) return;
    // New subscription (user changed / first mount): no org has resolved yet
    // for this run, so a transient error before the first snapshot clears
    // rather than preserving stale state from a previous session.
    everResolvedOrgIdRef.current = false;
    if (!user?.email) {
      setOrgId(null);
      setRoleId(null);
      setBuildingIds([]);
      // No email means there's no member doc to look up — including the
      // signed-out state and real SSO students whose custom token carries
      // no email claim. Mark membership resolved immediately so consumers
      // don't stall waiting for a snapshot that will never fire.
      setMembershipResolved(true);
      return;
    }

    // Capture the uid + email at subscription time so a late onSnapshot
    // delivery (after `user` has changed but before unsubscribe is wired
    // up) cannot overwrite the new user's state. React's effect cleanup
    // covers the typical case, but defending in depth against snapshot
    // -callback ordering is cheap and explicit.
    const startUid = user.uid;
    const emailLower = user.email.toLowerCase();
    let cancelled = false;
    let unsub: (() => void) | null = null;

    const subscribeToMembership = (candidateOrgId: string) => {
      if (cancelled || auth.currentUser?.uid !== startUid) return;
      unsub = onSnapshot(
        doc(db, 'organizations', candidateOrgId, 'members', emailLower),
        (snap) => {
          if (auth.currentUser?.uid !== startUid) return;
          if (snap.exists()) {
            const member = snap.data() as MemberRecord;
            const resolvedOrgId = member.orgId ?? candidateOrgId;
            setOrgId(resolvedOrgId);
            setRoleId(member.roleId ?? null);
            setBuildingIds(member.buildingIds ?? []);
            // M1 full sign-in lockout: a member explicitly marked 'inactive'
            // is locked out of the app entirely (not just stripped of admin).
            // Latch the sticky flag — AuthenticatedApp signs them out and
            // shows the DeactivatedScreen. We never UN-set it here: if an
            // admin reactivates the member mid-session the next snapshot would
            // clear it, but by then we've already signed the user out and the
            // listener is torn down, so reactivation simply takes effect on
            // their next sign-in. Setting (not clearing) here keeps the lockout
            // strictly one-way within a session, which is the safe direction.
            if (member.status === 'inactive') {
              setAccessDeactivated(true);
            }
            // Record that this session has resolved a real org at least once,
            // so a later transient snapshot error can safely preserve the
            // last-known state (vs. clearing on a never-resolved first load).
            if (resolvedOrgId) everResolvedOrgIdRef.current = true;
          } else {
            // Domain resolved to an org but no member doc exists yet (e.g.
            // a registered-domain user who was never invited): no org access,
            // free tier. Also the no-org / unregistered-domain case.
            setOrgId(null);
            setRoleId(null);
            setBuildingIds([]);
          }
          setMembershipResolved(true);
        },
        (error) => {
          if (auth.currentUser?.uid !== startUid) return;
          console.error('[AuthContext] Error loading org membership:', error);
          // Error-type-aware recovery. Orono is unaffected either way (tier
          // derives 'internal' from the email domain regardless of orgId);
          // this protects paying second/third orgs.
          const code = (error as { code?: string }).code;
          if (code === 'permission-denied') {
            // The member doc read was DENIED — membership was revoked (the user
            // was removed from the org) or rules now forbid the read. Do NOT
            // preserve access for a removed user: clear org/role/building so the
            // session drops to the free/external tier immediately.
            setOrgId(null);
            setRoleId(null);
            setBuildingIds([]);
          } else if (everResolvedOrgIdRef.current) {
            // Transient error (network blip, a permission race mid rules-deploy)
            // AFTER we've already resolved a real org this session: PRESERVE the
            // last-known orgId/roleId/buildingIds so a paying org user isn't
            // briefly demoted by a blip. The listener restores correct state on
            // recovery, and Firestore rules enforce real access server-side.
          } else {
            // Transient error on FIRST load, before any org ever resolved: there
            // is no real last-known state to keep, so clear rather than leave
            // whatever defaults were in place. Avoids presenting stale/empty org
            // state as if it were authoritative.
            setOrgId(null);
            setRoleId(null);
            setBuildingIds([]);
          }
          // Always mark resolved so consumers don't stall indefinitely.
          setMembershipResolved(true);
        }
      );
    };

    resolveOrgIdForUser(emailLower)
      .then((resolvedOrgId) => {
        if (cancelled || auth.currentUser?.uid !== startUid) return;
        if (resolvedOrgId) {
          subscribeToMembership(resolvedOrgId);
        } else {
          // Domain isn't registered to any org — free/no-org tier. Nothing to
          // subscribe to; resolve membership immediately so the app doesn't
          // stall on a snapshot that will never fire.
          setOrgId(null);
          setRoleId(null);
          setBuildingIds([]);
          setMembershipResolved(true);
        }
      })
      .catch((error) => {
        if (cancelled || auth.currentUser?.uid !== startUid) return;
        // Resolver unavailable (mid-deploy / transient outage). Fall back to
        // the operator org so existing internal members keep working; external
        // users simply find no member doc there and resolve to the free tier.
        console.error(
          '[AuthContext] resolveOrgForUser failed; falling back to operator org:',
          error
        );
        subscribeToMembership(OPERATOR_ORG_ID);
      });

    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, [user]);

  // Listen to feature permissions (only when authenticated)
  useEffect(() => {
    // No-op in bypass mode or when signed out. The signed-out branch
    // deliberately doesn't clear state synchronously here — it lets the
    // sign-out path settle naturally. `hasLiveUser` folds both guards
    // together; `user` stays in the dep array so the listener still
    // re-subscribes on a user-identity change.
    if (!hasLiveUser) return;

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
        // Log unconditionally via `logError` so production monitoring
        // sees snapshot failures (the old `console.error` was guarded on
        // `auth.currentUser` and only landed in the dev console). The
        // `code` is what we typically need to triage — permission-denied
        // vs unavailable vs internal — so capture it as structured ctx.
        if (auth.currentUser) {
          logError('AuthContext.globalPermissions.onSnapshot', error, {
            code: error.code,
          });
        }
        // Surface a toast ONCE per session so a teacher whose snapshot
        // is broken doesn't silently see stale feature availability.
        // The latch in `reportGlobalPermissionsError` keeps a retry
        // storm from fanning out a queue of identical toasts.
        reportGlobalPermissionsError();
      }
    );

    return () => {
      unsubscribe();
      globalUnsubscribe();
    };
    // `user` keeps the listener re-subscribing on a user-identity change;
    // `hasLiveUser` is the guard expression. `hasLiveUser` only flips when
    // `user`'s truthiness flips, so listing both adds no extra re-runs.
  }, [user, hasLiveUser]);

  // Subscribe to the active org's buildings so grade-level resolution stays
  // in sync with whatever admins configure in Admin Settings > Organization.
  useEffect(() => {
    if (isAuthBypass) return;
    if (!user || !orgId) {
      setOrgBuildings([]);
      setOrgBuildingsLoaded(true);
      return;
    }

    // Reset to loading=false BEFORE attaching the snapshot so consumers gating
    // on `useAdminBuildingsState().isLoading` (e.g. PermissionBuildingMultiSelect's
    // orphan-chip suppression) re-enter the loading window on sign-out→sign-in
    // or org switch. Without this, the previous user's "loaded" state leaks
    // into the new user's initial snapshot gap and destructive actions can
    // fire against a stale building list.
    setOrgBuildingsLoaded(false);

    const unsub = onSnapshot(
      collection(db, 'organizations', orgId, 'buildings'),
      (snapshot) => {
        const items: BuildingRecord[] = snapshot.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as BuildingRecord
        );
        setOrgBuildings(items);
        setOrgBuildingsLoaded(true);
      },
      (err) => {
        console.error(
          `[AuthContext] org buildings snapshot error (${orgId}):`,
          err
        );
        setOrgBuildingsLoaded(true);
      }
    );
    return unsub;
  }, [user, orgId]);

  // Load user profile (selectedBuildings) from Firestore when user signs in
  useEffect(() => {
    if (isAuthBypass) return;

    let isCancelled = false;

    const loadProfile = async () => {
      // Reset stale state from the previous user before loading new profile
      setProfileLoaded(false);
      setSetupCompletedState(false);
      setSavedWidgetConfigs({});
      setDisableCloseConfirmationState(false);
      setRemoteControlEnabledState(true);
      setDockPositionState('bottom');
      setLastActiveCollectionIdState(undefined);
      setLastBoardIdByCollectionState(undefined);
      setFavoriteBackgrounds([]);
      setRecentBackgrounds([]);

      if (!user) {
        driveProbedForUidRef.current = null;
        firestoreProbedForUidRef.current = null;
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
              // Normalize legacy long-form IDs (e.g. `orono-high-school`) to
              // their canonical short forms (`high`) so all downstream
              // comparisons and lookups against org-defined Firestore
              // buildings line up. The on-disk value is rewritten to
              // canonical form by `setSelectedBuildings` on the next save,
              // and by `scripts/backfill-user-building-ids.js` for batch
              // migration.
              setSelectedBuildingsState(
                canonicalizeBuildingIds(selectedBuildings)
              );
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

          // Decide setupCompleted. The wizard writes `setupCompleted: true` on
          // finish, so any of the following counts as "already set up":
          //   1. The field is explicitly true.
          //   2. The field is missing — user pre-dates the wizard.
          //   3. The user has a non-empty selectedBuildings array. This catches
          //      legacy users who selected a building via the old Sidebar
          //      picker (which never wrote setupCompleted) and would otherwise
          //      see the wizard on every new device.
          // Require at least one non-empty string element so garbage like
          // [null, ''] doesn't count a user as already-set-up.
          const rawSelected: unknown =
            'selectedBuildings' in data
              ? (data as { selectedBuildings: unknown }).selectedBuildings
              : null;
          const hasSelectedBuildings =
            Array.isArray(rawSelected) &&
            rawSelected.some(
              (id) => typeof id === 'string' && id.trim().length > 0
            );
          setSetupCompletedState(
            !('setupCompleted' in data) ||
              data.setupCompleted === true ||
              hasSelectedBuildings
          );

          // Load account-level preferences
          if (
            'disableCloseConfirmation' in data &&
            typeof data.disableCloseConfirmation === 'boolean'
          ) {
            setDisableCloseConfirmationState(data.disableCloseConfirmation);
          } else {
            setDisableCloseConfirmationState(false);
          }
          if (
            'remoteControlEnabled' in data &&
            typeof data.remoteControlEnabled === 'boolean'
          ) {
            setRemoteControlEnabledState(data.remoteControlEnabled);
          } else {
            // Default to true if not explicitly set
            setRemoteControlEnabledState(true);
          }
          if (
            'dockPosition' in data &&
            (data.dockPosition === 'bottom' ||
              data.dockPosition === 'left' ||
              data.dockPosition === 'right')
          ) {
            setDockPositionState(data.dockPosition);
          } else {
            setDockPositionState('bottom');
          }
          if (
            'quizMonitorColorsEnabled' in data &&
            typeof data.quizMonitorColorsEnabled === 'boolean'
          ) {
            setQuizMonitorColorsEnabledState(data.quizMonitorColorsEnabled);
          } else {
            setQuizMonitorColorsEnabledState(true);
          }
          if (
            'quizMonitorScoreDisplay' in data &&
            (data.quizMonitorScoreDisplay === 'percent' ||
              data.quizMonitorScoreDisplay === 'count' ||
              data.quizMonitorScoreDisplay === 'hidden')
          ) {
            setQuizMonitorScoreDisplayState(data.quizMonitorScoreDisplay);
          } else {
            setQuizMonitorScoreDisplayState('percent');
          }

          // Load Collections navigation memory
          if ('lastActiveCollectionId' in data) {
            const val = data.lastActiveCollectionId;
            setLastActiveCollectionIdState(
              typeof val === 'string' || val === null ? val : null
            );
          } else {
            setLastActiveCollectionIdState(null);
          }
          if (
            'lastBoardIdByCollection' in data &&
            typeof data.lastBoardIdByCollection === 'object' &&
            data.lastBoardIdByCollection !== null &&
            !Array.isArray(data.lastBoardIdByCollection)
          ) {
            setLastBoardIdByCollectionState(
              data.lastBoardIdByCollection as Record<string, string>
            );
          } else {
            setLastBoardIdByCollectionState({});
          }

          // Load background favorites and recents
          if (
            'favoriteBackgrounds' in data &&
            Array.isArray(data.favoriteBackgrounds) &&
            (data.favoriteBackgrounds as unknown[]).every(
              (x) => typeof x === 'string'
            )
          ) {
            setFavoriteBackgrounds(data.favoriteBackgrounds as string[]);
          } else {
            setFavoriteBackgrounds([]);
          }
          if (
            'recentBackgrounds' in data &&
            Array.isArray(data.recentBackgrounds) &&
            (data.recentBackgrounds as unknown[]).every(
              (x) => typeof x === 'string'
            )
          ) {
            setRecentBackgrounds(data.recentBackgrounds as string[]);
          } else {
            setRecentBackgrounds([]);
          }

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

  // Returning-user Firestore probe.
  //
  // Runs whenever a user signs in with `setupCompleted=false` but the
  // profile doc itself was missing or empty (the only path that reaches
  // here after the in-profile heuristic broadens). Checks two other
  // signals that the user has used SpartBoard before:
  //   1. `/users/{uid}` root doc carries a non-empty `buildings` array
  //      (the legacy analytics mirror written by `setSelectedBuildings`).
  //   2. `/users/{uid}/dashboards` has at least one document — they
  //      already created and saved a dashboard previously.
  // Either signal is enough to skip the setup wizard. Runs before the
  // Drive probe so users without Google Drive sync are still recognized.
  useEffect(() => {
    if (isAuthBypass) return;
    if (!user || !profileLoaded || setupCompleted) return;
    if (firestoreProbedForUidRef.current === user.uid) return;

    firestoreProbedForUidRef.current = user.uid;
    const probeUid = user.uid;

    void (async () => {
      try {
        const rootRef = doc(db, 'users', probeUid);
        const [rootSnap, dashboardsSnap] = await Promise.all([
          getDoc(rootRef),
          getDocs(
            query(collection(db, 'users', probeUid, 'dashboards'), limit(1))
          ),
        ]);
        // If the user has switched since we started, drop the result rather
        // than scribble on someone else's profile. The ref above is the
        // authoritative "current probe target".
        if (firestoreProbedForUidRef.current !== probeUid) return;

        const rootData = rootSnap.exists()
          ? (rootSnap.data() as Record<string, unknown>)
          : null;
        const rootBuildingsRaw =
          rootData && Array.isArray(rootData.buildings)
            ? (rootData.buildings as unknown[]).filter(
                (b): b is string => typeof b === 'string'
              )
            : [];
        const hasRootBuildings = rootBuildingsRaw.length > 0;
        const hasDashboards = !dashboardsSnap.empty;

        if (!hasRootBuildings && !hasDashboards) return;

        const canonical = hasRootBuildings
          ? canonicalizeBuildingIds(rootBuildingsRaw)
          : null;

        const profileUpdate: Record<string, unknown> = {
          setupCompleted: true,
        };
        if (canonical && canonical.length > 0) {
          profileUpdate.selectedBuildings = canonical;
        }

        await setDoc(
          doc(db, 'users', probeUid, 'userProfile', 'profile'),
          profileUpdate,
          { merge: true }
        );
        if (firestoreProbedForUidRef.current !== probeUid) return;
        setSetupCompletedState(true);
        if (canonical && canonical.length > 0) {
          setSelectedBuildingsState(canonical);
        }
      } catch (e) {
        // Promote from `console.warn` to structured logError so probe
        // failures surface in production monitoring. The probe runs once
        // per session and is the gate between "show setup wizard" and
        // "land on dashboard" for users without a profile doc — a silent
        // failure here is a regressed first-run UX we want to triage.
        // Guard on `auth.currentUser` to avoid logging post-signout race
        // failures where the probe was already in flight when the user
        // signed out.
        if (auth.currentUser) {
          logError('AuthContext.returningUserProbe', e, {
            uid: probeUid,
          });
        }
      }
    })();
  }, [user, profileLoaded, setupCompleted]);

  // Returning-user Drive probe.
  //
  // When a user with no Firestore profile doc signs in (their `loadProfile`
  // above set `setupCompleted=false`), check whether they already have a
  // SpartBoard folder in Google Drive. If so, this is a returning user on
  // a new device — write a profile doc with `setupCompleted=true` so the
  // setup wizard is skipped and they land straight on their dashboard.
  //
  // Runs as a separate effect (not inside `loadProfile`) so it can fire
  // when `googleAccessToken` arrives independently of the user-changed
  // event. The ref guard means a later token refresh during the session
  // does not re-probe or re-write the profile doc.
  useEffect(() => {
    if (isAuthBypass) return;
    if (!user || !profileLoaded || setupCompleted) return;
    if (!googleAccessToken) return;
    if (driveProbedForUidRef.current === user.uid) return;

    driveProbedForUidRef.current = user.uid;
    let cancelled = false;

    void (async () => {
      try {
        const driveService = new GoogleDriveService(
          googleAccessToken,
          refreshGoogleToken
        );
        const isReturning = await driveService.hasExistingAppFolder();
        if (cancelled || !isReturning) return;

        await setDoc(
          doc(db, 'users', user.uid, 'userProfile', 'profile'),
          { setupCompleted: true },
          { merge: true }
        );
        if (cancelled) return;
        setSetupCompletedState(true);
      } catch (e) {
        console.warn('[AuthContext] Returning-user Drive probe failed:', e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    user,
    googleAccessToken,
    profileLoaded,
    setupCompleted,
    refreshGoogleToken,
  ]);

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

  // Stamp /organizations/{orgId}/members/{emailLower}.lastActive on sign-in so
  // the Organization admin panel's "Last active" column reflects real sign-ins
  // (and not just invitation-claim time, which is the only other write path).
  // Gated by a self-write branch in firestore.rules that only permits writing
  // the `lastActive` field to one's own member doc. Throttled to at most once
  // per hour per browser via localStorage to avoid blasting the member doc on
  // every reload (see utils/lastActiveThrottle.ts).
  useEffect(() => {
    if (!user || isAuthBypass) return;
    if (!orgId || !user.email) return;
    const syncKey = `${user.uid}:${orgId}`;
    // Already attempted (or succeeded) for this (uid, orgId) in this JS
    // context — don't re-fire on unrelated renders. A different org will
    // produce a different key and re-arm naturally.
    if (memberLastActiveSyncedKeyRef.current === syncKey) return;
    if (!canWriteLastActive(user.uid, orgId)) {
      // Throttle window hasn't elapsed — still claim the key so we don't
      // re-check on every render until the window expires.
      memberLastActiveSyncedKeyRef.current = syncKey;
      return;
    }
    memberLastActiveSyncedKeyRef.current = syncKey;

    const emailLower = user.email.toLowerCase();
    void setDoc(
      doc(db, 'organizations', orgId, 'members', emailLower),
      { lastActive: new Date().toISOString() },
      { merge: true }
    )
      .then(() => {
        // Only stamp localStorage on success. A failed write (transient
        // network, rules deny) would otherwise consume the 1h throttle
        // window silently and delay the next attempt by up to an hour.
        stampLastActive(user.uid, orgId);
      })
      .catch((err: unknown) => {
        console.error('Error stamping member lastActive:', err);
        // Release the in-flight guard so the next render re-attempts.
        if (memberLastActiveSyncedKeyRef.current === syncKey) {
          memberLastActiveSyncedKeyRef.current = null;
        }
      });
  }, [user, orgId]);

  const setSelectedBuildings = useCallback(
    async (buildings: string[]) => {
      // Canonicalize before persisting so legacy IDs that callers may have
      // passed through (e.g. from old in-memory state) are normalized on the
      // way to disk. This makes every save self-healing.
      const canonical = canonicalizeBuildingIds(buildings);
      setSelectedBuildingsState(canonical);
      if (!user || isAuthBypass) return;
      // Assign a token so we can detect if a newer call supersedes this one
      const myToken = ++writeTokenRef.current;
      try {
        await setDoc(
          doc(db, 'users', user.uid, 'userProfile', 'profile'),
          { selectedBuildings: canonical },
          { merge: true }
        );
        // Keep root doc buildings in sync for admin analytics. Use the
        // canonicalized array so the analytics Cloud Function (which reads
        // `users/{uid}.buildings` as a fallback) sees aligned IDs.
        void setDoc(
          doc(db, 'users', user.uid),
          { buildings: canonical },
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

  const updateAccountPreferences = useCallback(
    async (updates: {
      disableCloseConfirmation?: boolean;
      remoteControlEnabled?: boolean;
      dockPosition?: DockPosition;
      quizMonitorColorsEnabled?: boolean;
      quizMonitorScoreDisplay?: 'percent' | 'count' | 'hidden';
    }) => {
      if (updates.disableCloseConfirmation !== undefined) {
        setDisableCloseConfirmationState(updates.disableCloseConfirmation);
      }
      if (updates.remoteControlEnabled !== undefined) {
        setRemoteControlEnabledState(updates.remoteControlEnabled);
      }
      if (updates.dockPosition !== undefined) {
        setDockPositionState(updates.dockPosition);
      }
      if (updates.quizMonitorColorsEnabled !== undefined) {
        setQuizMonitorColorsEnabledState(updates.quizMonitorColorsEnabled);
      }
      if (updates.quizMonitorScoreDisplay !== undefined) {
        setQuizMonitorScoreDisplayState(updates.quizMonitorScoreDisplay);
      }

      // Build a sanitized payload — Firestore rejects `undefined` field values
      const sanitizedUpdates: {
        disableCloseConfirmation?: boolean;
        remoteControlEnabled?: boolean;
        dockPosition?: DockPosition;
        quizMonitorColorsEnabled?: boolean;
        quizMonitorScoreDisplay?: 'percent' | 'count' | 'hidden';
      } = {};
      if (typeof updates.disableCloseConfirmation === 'boolean') {
        sanitizedUpdates.disableCloseConfirmation =
          updates.disableCloseConfirmation;
      }
      if (typeof updates.remoteControlEnabled === 'boolean') {
        sanitizedUpdates.remoteControlEnabled = updates.remoteControlEnabled;
      }
      if (
        updates.dockPosition === 'bottom' ||
        updates.dockPosition === 'left' ||
        updates.dockPosition === 'right'
      ) {
        sanitizedUpdates.dockPosition = updates.dockPosition;
      }
      if (typeof updates.quizMonitorColorsEnabled === 'boolean') {
        sanitizedUpdates.quizMonitorColorsEnabled =
          updates.quizMonitorColorsEnabled;
      }
      if (
        updates.quizMonitorScoreDisplay === 'percent' ||
        updates.quizMonitorScoreDisplay === 'count' ||
        updates.quizMonitorScoreDisplay === 'hidden'
      ) {
        sanitizedUpdates.quizMonitorScoreDisplay =
          updates.quizMonitorScoreDisplay;
      }

      if (!user || isAuthBypass || Object.keys(sanitizedUpdates).length === 0) {
        return;
      }
      const myToken = ++writeTokenRef.current;
      try {
        // `merge: true` is mandatory: DashboardContext also writes this doc
        // (see the UserProfile ownership contract in types.ts). A non-merge
        // write here would clobber Dashboard-owned fields like `dockItems`.
        await setDoc(
          doc(db, 'users', user.uid, 'userProfile', 'profile'),
          sanitizedUpdates,
          { merge: true }
        );
      } catch (error) {
        if (myToken === writeTokenRef.current) {
          console.error('Error saving account preferences:', error);
        }
        // Rethrow so callers that DO care about the failure (e.g. the
        // QuizLiveMonitor toggles, which catch this and toast) can react.
        // Pre-existing fire-and-forget callers are unaffected — an unhandled
        // rejection on those is fine because the inner console.error has
        // already logged the failure.
        throw error;
      }
    },
    [user]
  );

  const saveWidgetConfig = useCallback(
    (type: WidgetType, config: Partial<WidgetConfig>) => {
      // Strip transient/runtime keys so they never reach Firestore
      const filtered = stripTransientKeys(config);
      if (Object.keys(filtered).length === 0) return;

      setSavedWidgetConfigs((prev) => {
        const newConfigs = {
          ...prev,
          [type]: stripTransientKeys({
            ...(prev[type] ?? {}),
            ...filtered,
          }),
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

  const RECENT_CAP = 12;

  const toggleFavoriteBackground = useCallback(
    async (backgroundId: string) => {
      if (!user?.uid) return;
      const current = favoritesRef.current;
      const next = current.includes(backgroundId)
        ? current.filter((id) => id !== backgroundId)
        : [...current, backgroundId];
      // Optimistic update
      favoritesRef.current = next;
      setFavoriteBackgrounds(next);
      try {
        await setDoc(
          doc(db, 'users', user.uid, 'userProfile', 'profile'),
          { favoriteBackgrounds: next },
          { merge: true }
        );
      } catch (err) {
        // Revert optimistic update so the UI doesn't show a stale state
        favoritesRef.current = current;
        setFavoriteBackgrounds(current);
        logError('AuthContext.toggleFavoriteBackground', err);
        throw err; // Let caller surface a toast
      }
    },
    [user?.uid]
  );

  const recordRecentBackground = useCallback(
    async (backgroundId: string) => {
      if (!user?.uid) return;
      const current = recentsRef.current;
      const filtered = current.filter((id) => id !== backgroundId);
      const next = [backgroundId, ...filtered].slice(0, RECENT_CAP);
      // Skip the write if nothing actually changed
      if (
        next.length === current.length &&
        next.every((v, i) => v === current[i])
      )
        return;
      recentsRef.current = next;
      setRecentBackgrounds(next);
      try {
        await setDoc(
          doc(db, 'users', user.uid, 'userProfile', 'profile'),
          { recentBackgrounds: next },
          { merge: true }
        );
      } catch (err) {
        logError('AuthContext.recordRecentBackground', err);
        // Non-fatal: recents will repopulate from Firestore listener on next change
      }
    },
    [user?.uid]
  );

  const userGradeLevels = useMemo<GradeLevel[]>(() => {
    const source =
      orgBuildings.length > 0
        ? orgBuildings.map(buildingRecordToBuilding)
        : undefined;
    return getBuildingGradeLevels(selectedBuildings, source);
  }, [selectedBuildings, orgBuildings]);

  // Auth state listener
  useEffect(() => {
    if (isAuthBypass) return;

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        // Check for inactivity timeout — if the user hasn't used the app in
        // over 7 days, force a full re-login so Google OAuth tokens (Drive,
        // Calendar, Sheets) are freshly issued. This prevents the common issue
        // of stale tokens silently failing to load rosters and Drive data.
        const lastActivity = localStorage.getItem(LAST_ACTIVITY_KEY);
        if (lastActivity) {
          const lastActivityTime = parseInt(lastActivity, 10);
          // Treat corrupted/unparseable values as stale — safer to force
          // re-login than to silently skip the inactivity check.
          const elapsed = Number.isFinite(lastActivityTime)
            ? Date.now() - lastActivityTime
            : INACTIVITY_TIMEOUT_MS + 1;
          if (elapsed > INACTIVITY_TIMEOUT_MS) {
            localStorage.removeItem(LAST_ACTIVITY_KEY);
            localStorage.removeItem(GOOGLE_ACCESS_TOKEN_KEY);
            localStorage.removeItem(GOOGLE_TOKEN_EXPIRY_KEY);
            // Transition UI to signed-out immediately so the login screen
            // shows without waiting for the async firebaseSignOut round-trip.
            setUser(null);
            setGoogleAccessToken(null);
            rootDocSyncedRef.current = false;
            memberLastActiveSyncedKeyRef.current = null;
            setLoading(false);
            void firebaseSignOut(auth).catch((err: unknown) => {
              console.error(
                '[AuthContext] Error signing out stale session:',
                err
              );
            });
            return;
          }
        }
        // Session is fresh (or first visit) — record activity
        localStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
      }

      setUser(firebaseUser);
      if (!firebaseUser) {
        setGoogleAccessToken(null);
        rootDocSyncedRef.current = false;
        memberLastActiveSyncedKeyRef.current = null;
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Track user activity so we can detect stale sessions on next load.
  // Updates a localStorage timestamp every 5 minutes while the app is in use,
  // and whenever the tab regains visibility.
  useEffect(() => {
    if (!hasLiveUser) return;

    const updateActivity = () => {
      localStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
    };

    // User is active right now
    updateActivity();

    // Update periodically while the tab is visible
    const interval = setInterval(() => {
      if (!document.hidden) {
        updateActivity();
      }
    }, ACTIVITY_UPDATE_INTERVAL_MS);

    // Also update when the tab regains focus
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        updateActivity();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
    // `user` re-arms the activity stamp on a user-identity change; `hasLiveUser`
    // is the guard and only flips with `user`'s truthiness, so no extra re-runs.
  }, [user, hasLiveUser]);

  // Bypass mode: sign in anonymously so `request.auth.uid` is a real Firebase
  // uid that satisfies Firestore security rules. Wrap the resulting user in a
  // proxy that still presents mock email/displayName for UI continuity.
  // Reuse an existing anonymous session if one is already active — avoids
  // churning the anonymous uid on hot reloads and StrictMode double-mounts.
  useEffect(() => {
    if (!isAuthBypass) return;
    let cancelled = false;
    void (async () => {
      try {
        const existing = auth.currentUser;
        const anonUser = existing?.isAnonymous
          ? existing
          : (await signInAnonymously(auth)).user;
        if (cancelled) return;
        setUser(makeHybridBypassUser(anonUser));
      } catch (err) {
        console.error(
          '[AuthContext] Anonymous sign-in failed in bypass mode. ' +
            'Enable Anonymous provider in Firebase Console > Authentication.',
          err
        );
        if (!cancelled) setUser(MOCK_USER);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Helper for checking if a user has beta access
  const isBetaUser = useCallback(
    (betaUsers: string[], email: string | null | undefined) => {
      const lowerEmail = email?.toLowerCase() ?? '';
      return (
        betaUsers.some((e) => e.toLowerCase() === lowerEmail) ||
        (userRoles?.betaTeachers?.some((e) => e.toLowerCase() === lowerEmail) ??
          false) ||
        // LO2 harmonization: super admins get beta access from EITHER source —
        // the legacy admin_settings/user_roles.superAdmins[] list OR a member
        // doc with roleId 'super_admin'. The legacy list is KEPT as an
        // additional accepted source (a Paul-gated migration retires it later);
        // this mirrors OrganizationPanel.resolveActorRole, which reads both.
        (userRoles?.superAdmins?.some((e) => e.toLowerCase() === lowerEmail) ??
          false) ||
        roleId === 'super_admin'
      );
    },
    [userRoles, roleId]
  );

  // Distribution tier (docs/wide-distro-plan.md Phase 3). Org membership
  // reuses the existing member-doc subscription above: a resolved `orgId`
  // means `/organizations/{orgId}/members/{email}` exists for this user.
  // Until that snapshot resolves, a non-internal member briefly derives
  // `free` — acceptable because minTier-gated UI simply appears once the
  // membership lands, same as every other snapshot-driven gate here.
  const userTier = useMemo<UserTier>(
    () => deriveUserTier(user?.email, orgId !== null),
    [user, orgId]
  );

  // Does this user belong to an org? `orgId` is null until the membership
  // snapshot resolves AND for genuine no-org (free-tier) users, so a bare
  // `orgId !== null` is NOT a safe "external" signal on its own (it's false
  // during the loading window for Orono members too). `hasOrg` is the simple
  // positive form; `isExternalUser` below adds the resolution + student guards.
  const hasOrg = orgId !== null;

  // True ONLY for a fully-resolved, no-org, FREE-tier, non-student user — i.e.
  // the free/external tier that the wide-distribution rollout gates org surfaces
  // away from (docs/wide-distro-plan.md Phase 3). Four conditions, all required,
  // so org/internal members (and the in-flight loading window) never flicker
  // their org surfaces away:
  //   1. `membershipResolved` — the org-membership effect has settled. While
  //      it's still resolving this is false, so an Orono member's "My PLCs" /
  //      "My Building(s)" never blink off during load. Bypass mode seeds
  //      `membershipResolved = true` with a non-null `orgId`, so bypass is
  //      never external either.
  //   2. `orgId === null` — no org membership doc resolved for this user.
  //   3. `userTier === 'free'` — the decisive guard. `userTier` derives from
  //      the email DOMAIN (orono.k12.mn.us → 'internal') INDEPENDENT of orgId,
  //      so a brand-new / not-yet-backfilled Orono teacher who has no
  //      `members/{email}` doc yet (orgId === null) is still 'internal' and is
  //      NEVER classified external. Only genuine non-org, non-internal users
  //      derive 'free'. This is what makes the gate zero-change for Orono even
  //      before org member docs exist.
  //   4. `!isStudentRole` — SSO students have no email/member doc and could
  //      otherwise derive 'free' with orgId null; they are not "external
  //      teachers" and must not be treated as such by the org-surface gates.
  const isExternalUser =
    membershipResolved &&
    orgId === null &&
    userTier === 'free' &&
    !isStudentRole;

  // Check if user can access a specific widget
  // Wrapped in useCallback to prevent unnecessary re-renders since this function
  // is passed through context and used in component dependencies
  const canAccessWidget = useCallback(
    (widgetType: WidgetType, customBuildings?: string[]): boolean => {
      // In bypass mode, always allow everything
      if (isAuthBypass) return true;

      if (!user) return false;

      const permission = featurePermissions.find(
        (p: FeaturePermission) => p.widgetType === widgetType
      );

      // Default behavior: If no permission record exists, allow public access
      // This means new widgets are accessible to all authenticated users until
      // an admin explicitly configures permissions.
      //
      // Exception: an in-code default tier floor for Google-API-backed widgets
      // (docs/wide-distro-plan.md Phase 3). `WIDGET_DEFAULT_MIN_TIER[calendar]
      // = 'org'` denies external/free-tier users the Calendar (Events) widget
      // while org + internal pass — without an admin needing to author a
      // permission doc. Admins bypass the floor (consistent with the
      // accessLevel bypass below). Widgets with no entry have no floor, so the
      // historical public-by-default behavior is unchanged. `meetsMinTier`
      // treats an undefined floor as "allow".
      if (!permission) {
        if (isAdmin) return true;
        return meetsMinTier(userTier, WIDGET_DEFAULT_MIN_TIER[widgetType]);
      }

      // If the feature is disabled, no one can access it (including admins)
      if (!permission.enabled) return false;

      // Admins can access everything (except disabled features)
      if (isAdmin) return true;

      // Check access level for non-admin users
      switch (permission.accessLevel) {
        case 'admin':
          return false; // Only admins can access
        case 'beta':
          if (!isBetaUser(permission.betaUsers, user.email)) return false;
          break;
        case 'public':
          break;
        default:
          return false;
      }

      // Tier gate (docs/wide-distro-plan.md Phase 3): an unset `minTier`
      // imposes no restriction, so pre-tier docs behave exactly as before.
      if (!meetsMinTier(userTier, permission.minTier)) return false;

      // Per-building gate: when an admin has explicitly turned a widget off
      // for every one of the user's buildings via `config.dockDefaults`, deny
      // access. `dockDefaults` was originally just an initial-dock seed, but
      // admins reasonably read the toggle as "this widget is off for this
      // building" — and without this gate the widget library still showed
      // restricted widgets. Semantics:
      //  - missing dockDefaults → no opinion, allow
      //  - user has no selected buildings → no opinion, allow
      //  - building entry missing or true → allow
      //  - only deny when *every* selected building is explicitly `false`
      // canonicalize() so legacy IDs from pre-canonicalization admin writes
      // still match the selection (which is always canonicalized post-load).
      //
      // `customBuildings` lets callers that hold a building selection
      // outside AuthContext state (the new-user wizard, where picks live
      // in local component state until handleFinish persists them)
      // evaluate against the in-flight selection. Without this override
      // the wizard's StepDock would always see AuthContext's empty array
      // and skip the gate, letting users pick widgets they'd then lose
      // access to the moment setup completed.
      const rawDockDefaults = permission.config?.dockDefaults as
        | Record<string, boolean>
        | undefined;
      const checkBuildings = customBuildings ?? selectedBuildings;
      if (rawDockDefaults && checkBuildings.length > 0) {
        const dockDefaults = canonicalizeBuildingKeyedRecord(rawDockDefaults);
        // A missing entry (`undefined`) is treated as "no opinion → allow",
        // NOT as "off" — so a building that the admin hasn't configured for
        // this widget keeps the public-by-default behavior. Only an entry
        // that is *present and explicitly* `false` counts as "off"; we deny
        // solely when every selected building is off by that definition.
        const allExplicitlyOff = checkBuildings.every((bid) => {
          const setting = dockDefaults[bid];
          return setting === false;
        });
        if (allExplicitlyOff) return false;
      }

      return true;
    },
    [user, featurePermissions, isAdmin, isBetaUser, selectedBuildings, userTier]
  );

  /**
   * Resolves an existing permission record + auth state to a boolean access
   * decision. Callers handle the missing-permission case themselves before
   * delegating here, since that's where the two global-permission checks
   * deliberately diverge — `canAccessFeature` defaults to public, while
   * `canSeeShareTracking` defaults to admin-only. Once a record exists, the
   * enabled-flag → admin-bypass → access-level decision tree is identical,
   * so keep it in one place to avoid future drift.
   */
  const resolvePermissionAccess = useCallback(
    (
      permission: GlobalFeaturePermission,
      userEmail: string | null
    ): boolean => {
      if (!permission.enabled) return false;
      if (isAdmin) return true;
      switch (permission.accessLevel) {
        case 'admin':
          return false;
        case 'beta':
          if (!isBetaUser(permission.betaUsers, userEmail)) return false;
          break;
        case 'public':
          break;
        default:
          return false;
      }
      // Tier gate (docs/wide-distro-plan.md Phase 3): an unset `minTier`
      // imposes no restriction, so pre-tier docs behave exactly as before.
      if (!meetsMinTier(userTier, permission.minTier)) return false;
      // Building check applies only when explicitly restricted. An empty
      // array or `undefined` means "no building restriction" — the feature
      // applies to anyone who passed the access-level check above. When set,
      // the user must have at least one of these buildings in their
      // `selectedBuildings` (self-managed in General Settings).
      if (permission.buildings && permission.buildings.length > 0) {
        const allowed = new Set(permission.buildings);
        const hasMatch = selectedBuildings.some((b) => allowed.has(b));
        if (!hasMatch) return false;
      }
      return true;
    },
    [isAdmin, isBetaUser, selectedBuildings, userTier]
  );

  const canAccessFeature = useCallback(
    (featureId: GlobalFeature): boolean => {
      if (isAuthBypass) return true;
      if (!user) return false;

      const permission = globalPermissions.find(
        (p) => p.featureId === featureId
      );

      // Per-feature default from the single FEATURE_DEFAULTS table.
      // `missingDocPublic: true` (the historical baseline) returns true
      // when no doc exists; `false` keeps the feature off until an
      // admin explicitly persists settings — used for features that
      // depend on external config (OAuth, API keys) the code can't
      // verify on its own.
      if (!permission) {
        const def = FEATURE_DEFAULTS[featureId];
        if (!def.missingDocPublic) return false;
        // Admins bypass the tier floor (same as the accessLevel bypass in
        // resolvePermissionAccess). For everyone else, apply the in-code
        // default tier floor (docs/wide-distro-plan.md Phase 3): a
        // Google-API-backed feature with `defaultMinTier: 'org'` denies
        // external/free-tier users while org + internal pass. An undefined
        // `defaultMinTier` imposes no floor, so pre-tier features are
        // unchanged. `meetsMinTier` treats an undefined floor as "allow".
        if (isAdmin) return true;
        return meetsMinTier(userTier, def.defaultMinTier);
      }
      return resolvePermissionAccess(permission, user.email);
    },
    [user, globalPermissions, resolvePermissionAccess, isAdmin, userTier]
  );

  const getAssignmentMode = useCallback(
    (widget: AssignmentWidgetKey): AssignmentMode => {
      const permission = globalPermissions.find(
        (p) => p.featureId === 'assignment-modes'
      );
      // parseAssignmentModesConfig is the trust boundary: it drops unknown
      // widget keys and warns + drops unrecognized mode values, returning a
      // clean AssignmentModesConfig. The cast is gone; defaulting to
      // 'submissions' here keeps the legacy-fallthrough behavior.
      const config = parseAssignmentModesConfig(permission?.config);
      return config[widget] ?? 'submissions';
    },
    [globalPermissions]
  );

  const canSeeShareTracking = useCallback((): boolean => {
    if (isAuthBypass) return true;
    if (!user) return false;

    const permission = globalPermissions.find(
      (p) => p.featureId === 'share-link-tracking'
    );

    // Admin-only default when no record exists. This is the OPPOSITE of
    // canAccessFeature's default — view-count display fires one Firestore
    // aggregation per visible card on every dashboard tab-focus, so we'd
    // rather not surface it without explicit admin opt-in. The missing-
    // doc default protects unseed deployments from accidental read bloat.
    if (!permission) return isAdmin === true;
    return resolvePermissionAccess(permission, user.email);
  }, [user, globalPermissions, isAdmin, resolvePermissionAccess]);

  const signInWithGoogle = async () => {
    // A fresh sign-in attempt clears any sticky deactivation from a prior
    // session on this device (e.g. a different, deactivated account signed in
    // earlier, or the same account that has since been reactivated). The
    // membership snapshot re-evaluates status after sign-in and re-latches the
    // flag if they're still inactive.
    setAccessDeactivated(false);
    if (isAuthBypass) {
      console.warn('Bypassing Google Sign In');
      try {
        const { user: anonUser } = await signInAnonymously(auth);
        setUser(makeHybridBypassUser(anonUser));
      } catch (err) {
        console.error('[AuthContext] Anonymous sign-in failed:', err);
        setUser(MOCK_USER);
      }
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
      localStorage.removeItem(LAST_ACTIVITY_KEY);
      localStorage.removeItem(GOOGLE_ACCESS_TOKEN_KEY);
      localStorage.removeItem(GOOGLE_TOKEN_EXPIRY_KEY);
      await firebaseSignOut(auth);
      setGoogleAccessToken(null);
      // Clear on-demand scope grants so a shared device doesn't carry the prior
      // user's Sheets/Calendar scopes into the NEXT user's union refresh — GIS
      // rejects a silent ('none') refresh that requests a scope the new user
      // never granted, which would silently break their token refresh.
      onDemandScopesRef.current.clear();
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
        userTier,
        hasOrg,
        isExternalUser,
        getAssignmentMode,
        canSeeShareTracking,
        signInWithGoogle,
        signOut,
        selectedBuildings,
        userGradeLevels,
        setSelectedBuildings,
        language,
        setLanguage,
        refreshGoogleToken,
        connectGoogleDrive,
        ensureGoogleScope,
        disconnectGoogleDrive,
        savedWidgetConfigs,
        saveWidgetConfig,
        profileLoaded,
        setupCompleted,
        completeSetup,
        disableCloseConfirmation,
        remoteControlEnabled,
        dockPosition,
        quizMonitorColorsEnabled,
        quizMonitorScoreDisplay,
        updateAccountPreferences,
        lastActiveCollectionId,
        lastBoardIdByCollection,
        orgId,
        roleId,
        isStudentRole,
        accessDeactivated,
        roleResolved,
        buildingIds,
        orgBuildings,
        orgBuildingsLoaded,
        favoriteBackgrounds,
        recentBackgrounds,
        toggleFavoriteBackground,
        recordRecentBackground,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
