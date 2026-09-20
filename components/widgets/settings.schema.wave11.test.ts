import { describe, expect, it } from 'vitest';
import { validateSchema } from '@/components/settings/schema/validateSchema';
import type {
  Field,
  WidgetSettingsSchema,
} from '@/components/settings/schema/types';
import type { WidgetType } from '@/types';
import breathingSchema from './Breathing/settings.schema';
import mathToolSchema from './MathToolInstance/settings.schema';
import mathToolsSchema from './MathTools/settings.schema';
import nextUpSchema from './NextUp/settings.schema';
import quizSchema from './QuizWidget/settings.schema';
import {
  WIDGET_APPEARANCE_COMPONENTS,
  WIDGET_SETTINGS_COMPONENTS,
  WIDGET_SETTINGS_SCHEMAS,
} from './WidgetRegistry';

const migratedSchemas = {
  quiz: quizSchema,
  breathing: breathingSchema,
  mathTools: mathToolsSchema,
  mathTool: mathToolSchema,
  nextUp: nextUpSchema,
} satisfies Partial<Record<WidgetType, WidgetSettingsSchema>>;

describe('wave 11 settings-drawer widget migrations', () => {
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

  it('keeps custom fields limited to contextual actions and nested styling', () => {
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
      quiz: ['view'],
      breathing: [],
      mathTools: [],
      mathTool: [],
      nextUp: ['activeDriveFileId', 'styling'],
    });
  });

  it('uses one-tap partner wiring for Next Up to Timer', () => {
    const partnerFields = nextUpSchema.groups.flatMap((group) =>
      (group.fields as ReadonlyArray<Field>).filter(
        (field) => field.type === 'partnerWidget'
      )
    );

    expect(partnerFields).toHaveLength(1);
    expect(partnerFields[0]).toMatchObject({
      key: 'autoStartTimer',
      partner: 'time-tool',
      section: 'connections',
      missingHelp: 'addTimerHelp',
    });
  });
});
