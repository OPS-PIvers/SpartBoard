import type { WidgetData } from '@/types';
import type { FieldCtx } from '@/components/settings/schema/types';

export const CATALOG: Record<string, string> = {
  'widgetSettings.common.label': 'Label',
  'widgetSettings.common.rosterStudentCount': '{{count}} students',
};

export const t = (key: string, options?: Record<string, unknown>): string => {
  if (key in CATALOG) {
    return CATALOG[key].replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
      const value = options?.[name];
      return typeof value === 'number' || typeof value === 'string'
        ? String(value)
        : '';
    });
  }
  return typeof options?.defaultValue === 'string' ? options.defaultValue : key;
};

export const widget = {
  id: 'w1',
  type: 'clock',
  x: 0,
  y: 0,
  w: 200,
  h: 200,
  z: 1,
} as WidgetData;

export function makeCtx(config: Record<string, unknown> = {}): FieldCtx {
  return {
    config,
    widget: { ...widget, config },
    isAdmin: false,
    canAccessFeature: () => true,
    t,
  };
}
