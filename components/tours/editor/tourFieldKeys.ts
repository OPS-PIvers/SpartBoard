import type { WidgetType } from '@/types';
import { WIDGET_SETTINGS_SCHEMAS } from '@/components/widgets/WidgetRegistry';

/** Whether a widget type has a settings schema to source field keys from. */
export const hasFieldSchema = (widgetType: WidgetType): boolean =>
  !!WIDGET_SETTINGS_SCHEMAS[widgetType];

/** Field keys a widget type's settings schema declares, for the perField tour anchor picker. */
export async function fieldKeysForWidgetType(
  widgetType: WidgetType
): Promise<string[]> {
  const load = WIDGET_SETTINGS_SCHEMAS[widgetType];
  if (!load) return [];
  const schema = await load();
  const keys = schema.groups.flatMap((group) =>
    group.fields.map((field) => field.key)
  );
  return Array.from(new Set(keys));
}
