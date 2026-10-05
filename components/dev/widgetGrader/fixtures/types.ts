import type { AuthContextType } from '@/context/AuthContextValue';
import type { ClassRoster, ConfigForWidget, WidgetType } from '@/types';

export const HARNESS_UID = 'mock-user-id';
// Firestore path under the harness teacher's user doc.
export const userPath = (rest: string): string =>
  `users/${HARNESS_UID}/${rest}`;

export const FIXTURE_NAMES = ['empty', 'typical', 'stress'] as const;
export type FixtureName = (typeof FIXTURE_NAMES)[number];

export type HarnessAuthOverrides = Partial<
  Pick<
    AuthContextType,
    'featurePermissions' | 'selectedBuildings' | 'userGradeLevels'
  >
>;

export interface WidgetFixture<T extends WidgetType = WidgetType> {
  // Merged over the widget's WIDGET_DEFAULTS config.
  config: Partial<ConfigForWidget<T>>;
  customTitle?: string;
  rosters?: ClassRoster[];
  // Account state the widget reads through useAuth(), such as admin config in featurePermissions.
  auth?: HarnessAuthOverrides;
  // Firestore docs (path to data) written to the offline cache before mount, for library listeners.
  firestoreDocs?: Record<string, Record<string, unknown>>;
}

export type WidgetFixtureSet<T extends WidgetType = WidgetType> = Record<
  FixtureName,
  WidgetFixture<T>
>;

export const defineFixtures = <T extends WidgetType>(
  set: WidgetFixtureSet<T>
): WidgetFixtureSet<T> => set;
