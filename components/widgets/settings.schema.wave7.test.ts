import { describe, expect, it } from 'vitest';
import { validateSchema } from '@/components/settings/schema/validateSchema';
import type {
  Field,
  WidgetSettingsSchema,
} from '@/components/settings/schema/types';
import type { WidgetType } from '@/types';
import graphicOrganizerSchema from './GraphicOrganizer/settings.schema';
import numberLineSchema from './NumberLine/settings.schema';
import revealGridSchema from './RevealGrid/settings.schema';
import specialistScheduleSchema from './SpecialistSchedule/settings.schema';
import syntaxFramerSchema from './SyntaxFramer/settings.schema';
import {
  WIDGET_APPEARANCE_COMPONENTS,
  WIDGET_SETTINGS_COMPONENTS,
  WIDGET_SETTINGS_SCHEMAS,
} from './WidgetRegistry';

const migratedSchemas = {
  'specialist-schedule': specialistScheduleSchema,
  'graphic-organizer': graphicOrganizerSchema,
  'reveal-grid': revealGridSchema,
  numberLine: numberLineSchema,
  'syntax-framer': syntaxFramerSchema,
} satisfies Partial<Record<WidgetType, WidgetSettingsSchema>>;

describe('next settings-drawer widget migration batch', () => {
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

  it('keeps custom fields limited to contextual editors', () => {
    const customKeys = Object.fromEntries(
      Object.entries(migratedSchemas).map(([type, schema]) => [
        type,
        schema.groups.flatMap((group) =>
          (group.fields as ReadonlyArray<Field>)
            .filter((field) => field.type === 'custom')
            .map((field) => field.key)
        ),
      ])
    );

    expect(customKeys).toEqual({
      'specialist-schedule': ['cycleDays', 'recurringItems'],
      'graphic-organizer': ['templateType'],
      'reveal-grid': ['cards'],
      numberLine: [],
      'syntax-framer': ['tokens'],
    });
    expect(
      Object.values(customKeys)
        .flat()
        .some((key) => /^(settings|settingsPanel|compositeControl)$/i.test(key))
    ).toBe(false);
  });
});
