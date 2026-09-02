import type {
  MaterialsConfig,
  MaterialsPreferences,
  WidgetConfig,
} from '@/types';

/** Config keys a new Materials widget inherits from the teacher's account-wide preferences. */
export function seedMaterialsConfig(
  preferences: MaterialsPreferences | undefined
): Partial<WidgetConfig> {
  if (!preferences) return {};
  const seed: Partial<MaterialsConfig> = {};
  if (preferences.selectedItems && preferences.selectedItems.length > 0) {
    seed.selectedItems = [...preferences.selectedItems];
    seed.customMaterialSnapshots = [
      ...(preferences.customMaterialSnapshots ?? []),
    ];
  }
  if (typeof preferences.title === 'string') seed.title = preferences.title;
  if (typeof preferences.titleFont === 'string')
    seed.titleFont = preferences.titleFont;
  return seed as Partial<WidgetConfig>;
}

/** Captures the parts of a widget config that should seed future Materials widgets. */
export function preferencesFromConfig(
  previous: MaterialsPreferences,
  config: MaterialsConfig
): MaterialsPreferences {
  const next: MaterialsPreferences = {
    ...previous,
    selectedItems: [...(config.selectedItems ?? [])],
    customMaterialSnapshots: (config.customMaterialSnapshots ?? []).filter(
      (snapshot) => (config.selectedItems ?? []).includes(snapshot.id)
    ),
  };
  if (typeof config.title === 'string') next.title = config.title;
  if (typeof config.titleFont === 'string') next.titleFont = config.titleFont;
  return next;
}

/** Drops every reference to a material (deleted or otherwise gone) from the preferences. */
export function forgetMaterial(
  preferences: MaterialsPreferences,
  materialId: string
): MaterialsPreferences {
  return {
    ...preferences,
    selectedItems: (preferences.selectedItems ?? []).filter(
      (id) => id !== materialId
    ),
    customMaterialSnapshots: (preferences.customMaterialSnapshots ?? []).filter(
      (snapshot) => snapshot.id !== materialId
    ),
    hiddenMaterialIds: (preferences.hiddenMaterialIds ?? []).filter(
      (id) => id !== materialId
    ),
  };
}
