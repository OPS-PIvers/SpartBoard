import { describe, expect, it } from 'vitest';
import { validateSchema } from '@/components/settings/schema/validateSchema';
import type {
  Field,
  WidgetSettingsSchema,
} from '@/components/settings/schema/types';
import type { WidgetType } from '@/types';
import calendarSchema from './Calendar/settings.schema';
import instructionalRoutinesSchema from './InstructionalRoutines/settings.schema';
import pollSchema from './PollWidget/settings.schema';
import qrSchema from './QRWidget/settings.schema';
import scoreboardSchema from './Scoreboard/settings.schema';
import {
  WIDGET_APPEARANCE_COMPONENTS,
  WIDGET_SETTINGS_COMPONENTS,
  WIDGET_SETTINGS_SCHEMAS,
} from './WidgetRegistry';

const migratedSchemas = {
  qr: qrSchema,
  scoreboard: scoreboardSchema,
  calendar: calendarSchema,
  poll: pollSchema,
  instructionalRoutines: instructionalRoutinesSchema,
} satisfies Partial<Record<WidgetType, WidgetSettingsSchema>>;

describe('settings-drawer migration batch after the first 15 widgets', () => {
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

  it('keeps custom fields granular and documents only contextual gaps', () => {
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
      qr: ['url', 'syncWithTextWidget'],
      scoreboard: ['teams'],
      calendar: ['personalCalendarIds', 'isBuildingSyncEnabled'],
      poll: ['questions', 'activePollSessionId'],
      instructionalRoutines: ['selectedRoutineId'],
    });
  });
});
