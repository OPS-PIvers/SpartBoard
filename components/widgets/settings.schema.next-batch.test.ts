import { describe, expect, it } from 'vitest';
import { validateSchema } from '@/components/settings/schema/validateSchema';
import type { WidgetType } from '@/types';
import diceSchema from './DiceWidget/settings.schema';
import drawingSchema from './DrawingWidget/settings.schema';
import soundSchema from './SoundWidget/settings.schema';
import soundboardSchema from './SoundboardWidget/settings.schema';
import webcamSchema from './Webcam/settings.schema';
import { WIDGET_SETTINGS_SCHEMAS } from './WidgetRegistry';

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

  it.each(Object.keys(migratedSchemas))('%s is drawer-registered', (type) => {
    expect(WIDGET_SETTINGS_SCHEMAS[type as WidgetType]).toBeTypeOf('function');
  });
});
