import { describe, expect, it } from 'vitest';
import { validateSchema } from '@/components/settings/schema/validateSchema';
import type {
  Field,
  WidgetSettingsSchema,
} from '@/components/settings/schema/types';
import type { WidgetType } from '@/types';
import materialsSchema from './MaterialsWidget/settings.schema';
import pdfSchema from './PdfWidget/settings.schema';
import recessGearSchema from './RecessGear/settings.schema';
import scheduleSchema from './Schedule/settings.schema';
import seatingChartSchema from './SeatingChart/settings.schema';
import {
  WIDGET_APPEARANCE_COMPONENTS,
  WIDGET_SETTINGS_COMPONENTS,
  WIDGET_SETTINGS_SCHEMAS,
} from './WidgetRegistry';

const migratedSchemas = {
  materials: materialsSchema,
  'seating-chart': seatingChartSchema,
  schedule: scheduleSchema,
  recessGear: recessGearSchema,
  pdf: pdfSchema,
} satisfies Partial<Record<WidgetType, WidgetSettingsSchema>>;

describe('wave 10 settings-drawer widget migrations', () => {
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
      materials: ['title', 'selectedItems', 'titleFont'],
      'seating-chart': ['furniture'],
      schedule: ['schedules'],
      recessGear: [],
      pdf: ['activePdfId'],
    });
    expect(
      Object.values(customKeys)
        .flat()
        .some((key) => /^(settings|settingsPanel|compositeControl)$/i.test(key))
    ).toBe(false);
  });

  it('uses one-tap partner wiring for Schedule → Calendar and Recess Gear → Weather', () => {
    const partnerFields = Object.entries(migratedSchemas).flatMap(
      ([type, schema]) =>
        schema.groups.flatMap((group) =>
          (group.fields as ReadonlyArray<Field>)
            .filter((field) => field.type === 'partnerWidget')
            .map((field) => ({ type, field }))
        )
    );

    expect(partnerFields).toHaveLength(2);
    const schedulePartner = partnerFields.find(
      ({ type }) => type === 'schedule'
    );
    const recessGearPartner = partnerFields.find(
      ({ type }) => type === 'recessGear'
    );
    expect(schedulePartner?.field).toMatchObject({
      key: 'schedules',
      partner: 'calendar',
      section: 'connections',
      missingHelp: 'addCalendarTip',
    });
    expect(recessGearPartner?.field).toMatchObject({
      key: 'linkedWeatherWidgetId',
      partner: 'weather',
      section: 'connections',
      missingHelp: 'addWeatherTip',
    });
  });
});
