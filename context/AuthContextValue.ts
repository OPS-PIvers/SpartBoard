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
} from '../types';

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
  canAccessWidget: (widgetType: WidgetType) => boolean;
  canAccessFeature: (featureId: GlobalFeature) => boolean;
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
  /** Disconnect Google Drive without signing the user out of the app. */
  disconnectGoogleDrive: () => void;
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
  /** Update account-level preferences (disableCloseConfirmation, remoteControlEnabled) */
  updateAccountPreferences: (updates: {
    disableCloseConfirmation?: boolean;
    remoteControlEnabled?: boolean;
  }) => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(
  undefined
);
