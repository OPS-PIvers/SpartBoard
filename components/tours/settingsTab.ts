import {
  TAB_GROUPS,
  type SettingsTab,
  type WidgetSettingsSchema,
} from '@/components/settings/schema/types';
import { WIDGET_SETTINGS_SCHEMAS } from '@/components/widgets/WidgetRegistry';
import type { WidgetType } from '@/types';

const TABS: readonly SettingsTab[] = ['settings', 'style'];

/** The drawer tab that renders a schema field or group; a list row (`list.2.key`) resolves by its list. */
export function settingsTabOf(
  schema: WidgetSettingsSchema,
  fieldKey: string
): SettingsTab | null {
  const key = fieldKey.split('.')[0];
  for (const tab of TABS) {
    const inTab = TAB_GROUPS[tab].some((groupId) =>
      schema.groups
        .find((group) => group.id === groupId)
        ?.fields.some((field) => field.key === key)
    );
    if (inTab) return tab;
  }
  const styleKeys: readonly string[] = schema.styleKeys ?? [];
  if (styleKeys.includes(key)) return 'style';
  const groupTab = TABS.find(
    (tab) =>
      (TAB_GROUPS[tab] as readonly string[]).includes(key) &&
      schema.groups.some((group) => group.id === key)
  );
  return groupTab ?? null;
}

const loaded = new Map<string, WidgetSettingsSchema | null>();
const loading = new Set<string>();

/** Sync once the widget's schema module has loaded; undefined while it loads, null if unknown. */
export function fieldSettingsTab(
  widgetType: string,
  fieldKey: string
): SettingsTab | null | undefined {
  if (loaded.has(widgetType)) {
    const schema = loaded.get(widgetType);
    return schema ? settingsTabOf(schema, fieldKey) : null;
  }
  const load = WIDGET_SETTINGS_SCHEMAS[widgetType as WidgetType];
  if (!load) return null;
  if (!loading.has(widgetType)) {
    loading.add(widgetType);
    load()
      .then(
        (schema) => loaded.set(widgetType, schema),
        () => loaded.set(widgetType, null)
      )
      .finally(() => loading.delete(widgetType));
  }
  return undefined;
}
