import { describe, expect, it } from 'vitest';
import { validateSchema } from '@/components/settings/schema/validateSchema';
import type { WidgetType } from '@/types';
import checklistSchema from './Checklist/settings.schema';
import expectationsSchema from './ExpectationsWidget/settings.schema';
import urlSchema from './UrlWidget/settings.schema';
import weatherSchema from './Weather/settings.schema';
import {
  WIDGET_APPEARANCE_COMPONENTS,
  WIDGET_SETTINGS_COMPONENTS,
  WIDGET_SETTINGS_SCHEMAS,
} from './WidgetRegistry';
import randomSchema from './random/settings.schema';

const migratedSchemas = {
  checklist: checklistSchema,
  expectations: expectationsSchema,
  random: randomSchema,
  url: urlSchema,
  weather: weatherSchema,
} satisfies Partial<Record<WidgetType, unknown>>;

describe('next settings-drawer widget migrations', () => {
  it.each(Object.entries(migratedSchemas))(
    '%s has a valid, warning-free schema',
    (type, schema) => {
      expect(validateSchema(type as WidgetType, schema)).toEqual({
        errors: [],
        warnings: [],
      });
    }
  );

  it.each(Object.keys(migratedSchemas))(
    '%s is drawer-owned rather than legacy-panel-owned',
    (type) => {
      const widgetType = type as WidgetType;

      expect(WIDGET_SETTINGS_SCHEMAS[widgetType]).toBeTypeOf('function');
      expect(WIDGET_SETTINGS_COMPONENTS[widgetType]).toBeUndefined();
      expect(WIDGET_APPEARANCE_COMPONENTS[widgetType]).toBeUndefined();
    }
  );
});
