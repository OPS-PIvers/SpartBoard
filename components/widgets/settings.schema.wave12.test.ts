import { describe, expect, it } from 'vitest';
import { validateSchema } from '@/components/settings/schema/validateSchema';
import type {
  Field,
  WidgetSettingsSchema,
} from '@/components/settings/schema/types';
import type { WidgetType } from '@/types';
import blendingBoardSchema from './BlendingBoard/settings.schema';
import carRiderProSchema from './CarRiderPro/settings.schema';
import customWidgetSchema from './CustomWidget/settings.schema';
import first5Schema from './First5/settings.schema';
import musicSchema from './MusicWidget/settings.schema';
import {
  WIDGET_APPEARANCE_COMPONENTS,
  WIDGET_SETTINGS_COMPONENTS,
  WIDGET_SETTINGS_SCHEMAS,
} from './WidgetRegistry';

const migratedSchemas = {
  music: musicSchema,
  'car-rider-pro': carRiderProSchema,
  'blending-board': blendingBoardSchema,
  'first-5': first5Schema,
  'custom-widget': customWidgetSchema,
} satisfies Partial<Record<WidgetType, WidgetSettingsSchema>>;

describe('wave 12 settings-drawer widget migrations', () => {
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

  it('keeps custom fields limited to contextual content', () => {
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
      music: ['source', 'stationId', 'personalSpotifyUrl'],
      'car-rider-pro': ['iframeUrl'],
      'blending-board': ['managedNotice'],
      'first-5': ['__brand'],
      'custom-widget': ['adminSettings'],
    });
  });

  it('uses one-tap partner wiring for Music to Time Tool', () => {
    const partnerFields = musicSchema.groups.flatMap((group) =>
      (group.fields as ReadonlyArray<Field>).filter(
        (field) => field.type === 'partnerWidget'
      )
    );

    expect(partnerFields).toHaveLength(1);
    expect(partnerFields[0]).toMatchObject({
      key: 'syncWithTimeTool',
      partner: 'time-tool',
      section: 'connections',
      missingHelp: 'addTimeToolHelp',
    });
  });
});
