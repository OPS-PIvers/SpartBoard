import { createContext } from 'react';
import { User } from 'firebase/auth';
import {
  FeaturePermission,
  WidgetType,
  GlobalFeaturePermission,
  GlobalFeature,
  GradeLevel,
} from '../types';

export interface AuthContextType {
  user: User | null;
  googleAccessToken: string | null;
  loading: boolean;
  isAdmin: boolean | null; // null = admin status not yet determined
  featurePermissions: FeaturePermission[];
  globalPermissions: GlobalFeaturePermission[];
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
  /** Refresh the Google Access Token for Drive/Sheets APIs */
  refreshGoogleToken: () => Promise<string | null>;
}

export const AuthContext = createContext<AuthContextType | undefined>(
  undefined
);
