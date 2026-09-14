import { describe, expect, it } from 'vitest';
import { validateSchema } from '@/components/settings/schema/validateSchema';
import type { WidgetType } from '@/types';
import diceSchema from './DiceWidget/settings.schema';
import drawingSchema from './DrawingWidget/settings.schema';
import soundSchema from './SoundWidget/settings.schema';
import soundboardSchema from './SoundboardWidget/settings.schema';
import webcamSchema from './Webcam/settings.schema';
import {
  WIDGET_APPEARANCE_COMPONENTS,
  WIDGET_SETTINGS_COMPONENTS,
  WIDGET_SETTINGS_SCHEMAS,
} from './WidgetRegistry';

const migratedSchemas = {
  dice: diceSchema,
  drawing: drawingSchema,
  sound: soundSchema,
  soundboard: soundboardSchema,
  webcam: webcamSchema,
} satisfies Partial<Record<WidgetType, unknown>>;

describe('next-batch settings-drawer widget migrations', () => {
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
