import { describe, expect, it } from 'vitest';
import { validateSchema } from '@/components/settings/schema/validateSchema';
import type {
  Field,
  WidgetSettingsSchema,
} from '@/components/settings/schema/types';
import type { WidgetType } from '@/types';
import conceptWebSchema from './ConceptWeb/settings.schema';
import guidedLearningSchema from './GuidedLearning/settings.schema';
import hotspotImageSchema from './HotspotImage/settings.schema';
import starterPackSchema from './StarterPack/settings.schema';
import videoActivitySchema from './VideoActivityWidget/settings.schema';
import {
  WIDGET_APPEARANCE_COMPONENTS,
  WIDGET_SETTINGS_COMPONENTS,
  WIDGET_SETTINGS_SCHEMAS,
} from './WidgetRegistry';

const migratedSchemas = {
  'hotspot-image': hotspotImageSchema,
  'concept-web': conceptWebSchema,
  'starter-pack': starterPackSchema,
  'video-activity': videoActivitySchema,
  'guided-learning': guidedLearningSchema,
} satisfies Partial<Record<WidgetType, WidgetSettingsSchema>>;

describe('wave 8 settings-drawer widget migrations', () => {
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
      'hotspot-image': ['baseImageUrl', 'hotspots'],
      'concept-web': ['nodes'],
      'starter-pack': ['packName'],
      'video-activity': [],
      'guided-learning': ['view'],
    });
    expect(
      Object.values(customKeys)
        .flat()
        .some((key) => /^(settings|settingsPanel|compositeControl)$/i.test(key))
    ).toBe(false);
  });

  it('does not add partner cards for these widgets without active Nexus links', () => {
    const partnerFields = Object.values(migratedSchemas).flatMap((schema) =>
      schema.groups.flatMap((group) =>
        (group.fields as ReadonlyArray<Field>).filter(
          (field) => field.type === 'partnerWidget'
        )
      )
    );
    expect(partnerFields).toHaveLength(0);
  });
});
