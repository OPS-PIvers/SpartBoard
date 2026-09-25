import { describe, expect, it } from 'vitest';
import { validateSchema } from '@/components/settings/schema/validateSchema';
import type {
  Field,
  WidgetSettingsSchema,
} from '@/components/settings/schema/types';
import type { WidgetType } from '@/types';
import bloomsTaxonomySchema from './BloomsTaxonomy/settings.schema';
import countdownSchema from './Countdown/settings.schema';
import needDoPutThenSchema from './NeedDoPutThen/settings.schema';
import stationsSchema from './Stations/settings.schema';
import workSymbolsSchema from './WorkSymbols/settings.schema';
import {
  WIDGET_APPEARANCE_COMPONENTS,
  WIDGET_SETTINGS_COMPONENTS,
  WIDGET_SETTINGS_SCHEMAS,
} from './WidgetRegistry';

const migratedSchemas = {
  countdown: countdownSchema,
  'work-symbols': workSymbolsSchema,
  'blooms-taxonomy': bloomsTaxonomySchema,
  'need-do-put-then': needDoPutThenSchema,
  stations: stationsSchema,
} satisfies Partial<Record<WidgetType, WidgetSettingsSchema>>;

describe('wave 9 settings-drawer widget migrations', () => {
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

  it('keeps custom fields limited to contextual editors and actions', () => {
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
      countdown: ['startDate', 'eventDate'],
      'work-symbols': [],
      'blooms-taxonomy': ['enabledCategories'],
      'need-do-put-then': ['needItems', 'doItems', 'putItems', 'thenItems'],
      stations: ['stations'],
    });
    expect(
      Object.values(customKeys)
        .flat()
        .some((key) => /^(settings|settingsPanel|compositeControl)$/i.test(key))
    ).toBe(false);
  });

  it('uses one-tap partner wiring for the Stations → Random Nexus', () => {
    const partnerFields = stationsSchema.groups
      .flatMap((group) => group.fields as ReadonlyArray<Field>)
      .filter((field) => field.type === 'partnerWidget');
    expect(partnerFields).toHaveLength(1);
    expect(partnerFields[0]).toMatchObject({
      key: 'stations',
      partner: 'random',
    });
  });
});
