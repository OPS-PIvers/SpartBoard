import { createContext } from 'react';
import { User } from 'firebase/auth';
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
import type { BuildingRecord } from '@/types/organization';

export interface AuthContextType {
  user: User | null;
  googleAccessToken: string | null;
  loading: boolean;
  isAdmin: boolean | null; // null = admin status not yet determined
  userRoles: UserRolesConfig | null;
  appSettings: AppSettings | null;
  featurePermissions: FeaturePermission[];
  globalPermissions: GlobalFeaturePermission[];
  updateAppSettings: (updates: Partial<AppSettings>) => Promise<void>;
  /**
   * `customBuildings` overrides the AuthContext `selectedBuildings` for
   * the per-building gate. Used by callers that hold a building
   * selection outside AuthContext state — e.g. the new-user wizard,
   * where picks live in local component state until `handleFinish`
   * persists them. Omit everywhere else.
   */
  canAccessWidget: (
    widgetType: WidgetType,
    customBuildings?: string[]
  ) => boolean;
  canAccessFeature: (featureId: GlobalFeature) => boolean;
  /**
   * Distribution tier derived from email domain + org membership
   * (docs/wide-distro-plan.md Phase 3). Drives the `minTier` checks inside
   * `canAccessWidget`/`canAccessFeature`; exposed for UI that wants to
   * explain a denial rather than just hide.
   */
  userTier: UserTier;
  /**
   * True when the user belongs to an organization (`orgId !== null`). This is
   * `false` both for genuine no-org users AND during the membership-loading
   * window, so prefer `isExternalUser` (which adds the resolution + student
   * guards) when deciding whether to HIDE org-only surfaces — using `!hasOrg`
   * alone would flicker org surfaces off for org members while membership
   * resolves.
   */
  hasOrg: boolean;
  /**
   * True ONLY for a fully-resolved, no-org, non-student (free/external-tier)
   * user (docs/wide-distro-plan.md Phase 3). Gates org-only surfaces (My
   * PLCs / My Building(s) / My Classes + ClassLink / announcements) away from
   * external users. NEVER true while org membership is still resolving, so
   * org/internal members (incl. Orono) never see their org surfaces flicker
   * off during load. Auth-bypass and SSO students are never external.
   */
  isExternalUser: boolean;
  /**
   * The org-wide assignment mode for a student-facing widget. Reads from the
   * `assignment-modes` GlobalFeaturePermission doc; defaults to `'submissions'`
   * when no record exists or the widget key is missing from `config`.
   */
  getAssignmentMode: (widget: AssignmentWidgetKey) => AssignmentMode;
  /**
   * Whether the current user may see view-count metadata on view-only Share
   * cards. Gated separately from the underlying view-only feature itself
   * because the display fires one Firestore aggregation query per visible
   * card on every dashboard tab-focus — fine for an admin who's tracking
   * engagement, wasteful when surfaced to teachers who never asked for it.
   *
   * Distinct from `canAccessFeature('share-link-tracking')` in one place:
   * the missing-permission-doc default is **admin-only**, not public — so
   * deploying this code without seeding the `global_permissions` doc
   * leaves teachers unaffected (and unbilled).
   */
  canSeeShareTracking: () => boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Building IDs the user has selected in General Settings */
  selectedBuildings: string[];
  /**
   * The union of grade levels for the user's selected buildings.
   * Empty array means no buildings selected — widgets should show all content.
   */
  userGradeLevels: GradeLevel[];
  /** Persist the user's building selection to Firestore */
  setSelectedBuildings: (buildings: string[]) => Promise<void>;
  /** The active UI language code (e.g. 'en', 'es', 'de', 'fr') */
  language: string;
  /** Persist the user's language preference to Firestore and update i18n */
  setLanguage: (lang: string) => Promise<void>;
  /**
   * Refresh the Google Access Token for Drive/Sheets APIs.
   * @param silent When true (default), skips the Firebase popup fallback so the call
   *   is safe from background timers. Pass false only from direct user gestures.
   */
  refreshGoogleToken: (silent?: boolean) => Promise<string | null>;
  /**
   * Reconnect Google Drive without affecting Firebase auth state.
   * Tries a silent GIS refresh first; falls back to a popup on failure.
   * Safe to call from user-triggered UI (e.g. the disconnect banner).
   */
  connectGoogleDrive: () => Promise<void>;
  /**
   * Ensure the shared Google access token carries an on-demand sensitive
   * scope (`spreadsheets`, `calendar.readonly`) that is NOT requested at login
   * under Path B (docs/wide-distro-plan.md).
   *
   * Behavior:
   *   - Tries a SILENT GIS re-mint first (`prompt:'none'`). For any user who
   *     already granted the scope — every existing Orono user — this returns a
   *     token that includes the scope with NO popup, and persists it into the
   *     same `googleAccessToken` state + localStorage the rest of the app reads.
   *   - If the silent path fails (scope never granted) AND `opts.interactive`
   *     is true (caller is in a user gesture), retries with a consent popup
   *     (`prompt:''`).
   *   - Returns the access token on success, or `null` on silent-miss without
   *     `interactive`, user decline, or any error. NEVER throws — callers
   *     degrade to their existing "Google access required" branch.
   *
   * Because OAuth tokens minted from one grant carry ALL granted scopes,
   * persisting the returned token means every existing Sheets/Calendar consumer
   * (and the 1-hour refresh loop) transparently uses it afterward.
   */
  ensureGoogleScope: (
    scope: string,
    opts?: { interactive?: boolean }
  ) => Promise<string | null>;
  /**
   * Disconnect Google Drive without signing the user out of the app.
   * Awaits the server-side revoke; throws on backend failure so callers
   * can surface a toast directing the user to revoke at
   * myaccount.google.com manually.
   */
  disconnectGoogleDrive: () => Promise<void>;
  /** Global saved configs for complex widgets */
  savedWidgetConfigs: Partial<Record<WidgetType, Partial<WidgetConfig>>>;
  /** Save a widget's config globally (debounced Firestore write) */
  saveWidgetConfig: (type: WidgetType, config: Partial<WidgetConfig>) => void;
  /** True once the profile Firestore fetch has resolved (success or error) */
  profileLoaded: boolean;
  /** True after the user completes the first-time setup wizard */
  setupCompleted: boolean;
  /** Mark setup as done — writes setupCompleted:true to Firestore */
  completeSetup: () => Promise<void>;
  /** Whether to skip the close-widget confirmation dialog (account-level preference) */
  disableCloseConfirmation: boolean;
  /** Whether remote control is enabled (account-level preference) */
  remoteControlEnabled: boolean;
  /** Where the dock is anchored on screen (account-level preference) */
  dockPosition: DockPosition;
  /**
   * Whether the quiz live-monitor tints completed-student rows by score
   * band (≥80% green, 60-79% amber, <60% rose). When false the roster
   * renders monochrome white.
   */
  quizMonitorColorsEnabled: boolean;
  /** What the quiz live-monitor shows in the right-side score pill. */
  quizMonitorScoreDisplay: 'percent' | 'count' | 'hidden';
  /**
   * The Collection the teacher was most recently in. Restored from the
   * userProfile doc on sign-in so the app can re-open the correct Collection
   * after a page refresh. `null` means root level. `undefined` means the
   * profile has not yet been loaded.
   */
  lastActiveCollectionId: string | null | undefined;
  /**
   * Per-Collection last-visited Board memory, keyed by Collection id
   * (or {@link ROOT_COLLECTION_KEY} for root-level Boards). Restored from the
   * userProfile doc on sign-in. `undefined` until the profile loads.
   */
  lastBoardIdByCollection: Record<string, string> | undefined;
  /** Update account-level preferences */
  updateAccountPreferences: (updates: {
    disableCloseConfirmation?: boolean;
    remoteControlEnabled?: boolean;
    dockPosition?: DockPosition;
    quizMonitorColorsEnabled?: boolean;
    quizMonitorScoreDisplay?: 'percent' | 'count' | 'hidden';
  }) => Promise<void>;
  /**
   * The organization this user belongs to, derived from their membership doc.
   * `null` until the membership snapshot resolves; stays `null` for
   * non-members. Phase 2 hard-codes this to the single seeded `orono` org;
   * Phase 3+ resolves it dynamically via `admin_settings/user_roles` or a
   * dedicated org-index collection.
   */
  orgId: string | null;
  /** The user's role id within `orgId` (from the members doc). Null until resolved. */
  roleId: string | null;
  /**
   * True when the signed-in Firebase user holds a `studentRole: true` custom
   * claim — i.e. the token was minted by `studentLoginV1`. Real SSO students
   * have no email and therefore no member doc, so `roleId` stays null for
   * them; this flag is the only reliable client-side signal that a student
   * is at the controls. False for teachers, admins, and unauthenticated.
   */
  isStudentRole: boolean;
  /**
   * True once both `isStudentRole` (from the token claim) AND `roleId` (from
   * the org-members snapshot, or short-circuited when the user has no email)
   * have settled to their final values for the current user. Consumers that
   * need to make a "student vs teacher" decision should gate on this to avoid
   * acting on stale or partially-resolved state during the window between
   * sign-in and the async claim/Firestore resolution.
   */
  roleResolved: boolean;
  /**
   * Building ids the user has scoped admin access to (from the members doc).
   * Distinct from `selectedBuildings`, which is a UI filter the user picks
   * themselves. Empty array when the user is not a member or has org-wide scope.
   */
  buildingIds: string[];
  /**
   * Live snapshot of `/organizations/{orgId}/buildings` for the active org.
   * Maintained by a single AuthProvider-level `onSnapshot` so consumers
   * (grade-level resolution, admin UIs via `useAdminBuildings`) share one
   * Firestore listener instead of each opening its own.
   */
  orgBuildings: BuildingRecord[];
  /**
   * True once the first `orgBuildings` snapshot (or the explicit "no org"
   * reset) has resolved. Consumers that need to distinguish a genuine empty
   * result from an in-flight load (e.g. suppressing orphan building chips
   * until the list is confirmed) should gate on this flag instead of checking
   * `orgBuildings.length === 0`.
   */
  orgBuildingsLoaded: boolean;
  /** Background IDs the user has starred as favorites. */
  favoriteBackgrounds: string[];
  /** Background IDs recently applied, newest first, capped at 12. */
  recentBackgrounds: string[];
  /** Toggle a background's favorite status (add if absent, remove if present). */
  toggleFavoriteBackground: (backgroundId: string) => Promise<void>;
  /** Record a background as recently used (deduped, newest first, capped at 12). */
  recordRecentBackground: (backgroundId: string) => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(
  undefined
);
