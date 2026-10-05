import type { ClassRoster, ConfigForWidget, WidgetType } from '@/types';

export const FIXTURE_NAMES = ['empty', 'typical', 'stress'] as const;
export type FixtureName = (typeof FIXTURE_NAMES)[number];

export interface WidgetFixture<T extends WidgetType = WidgetType> {
  // Merged over the widget's WIDGET_DEFAULTS config.
  config: Partial<ConfigForWidget<T>>;
  customTitle?: string;
  rosters?: ClassRoster[];
}

export type WidgetFixtureSet<T extends WidgetType = WidgetType> = Record<
  FixtureName,
  WidgetFixture<T>
>;

export const defineFixtures = <T extends WidgetType>(
  set: WidgetFixtureSet<T>
): WidgetFixtureSet<T> => set;
