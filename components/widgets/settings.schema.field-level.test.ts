import { describe, expect, it } from 'vitest';
import type {
  Field,
  WidgetSettingsSchema,
} from '@/components/settings/schema/types';
import checklistSchema from './Checklist/settings.schema';
import diceSchema from './DiceWidget/settings.schema';
import drawingSchema from './DrawingWidget/settings.schema';
import expectationsSchema from './ExpectationsWidget/settings.schema';
import soundSchema from './SoundWidget/settings.schema';
import soundboardSchema from './SoundboardWidget/settings.schema';
import urlSchema from './UrlWidget/settings.schema';
import weatherSchema from './Weather/settings.schema';
import webcamSchema from './Webcam/settings.schema';
import randomSchema from './random/settings.schema';

const schemas = [
  checklistSchema,
  weatherSchema,
  expectationsSchema,
  randomSchema,
  urlSchema,
  diceSchema,
  drawingSchema,
  soundSchema,
  soundboardSchema,
  webcamSchema,
] as ReadonlyArray<WidgetSettingsSchema>;

const customFields = schemas.flatMap((schema) =>
  schema.groups.flatMap((group) =>
    (group.fields as ReadonlyArray<Field>).filter(
      (field) => field.type === 'custom'
    )
  )
);

describe('consolidated field-level widget settings migration', () => {
  it('uses standard fields for every setting except the documented schema gaps', () => {
    expect(customFields.map((field) => field.key).sort()).toEqual(
      [
        'completedNames',
        // Two actions keyed off the same result: send to Stations, and save
        // the drawn groups back to the class (roster-groups plan D3).
        'lastResult',
        'lastResult',
        'lastSync',
        'lockedRosterGroupIds',
        'numExpertGroups',
        'numHomeGroups',
        'remainingStudents',
        'selectedSoundIds',
        'showFeelsLike',
        'syncSoundWidget',
      ].sort()
    );
  });

  it('does not hide a whole settings panel behind a generic Custom field', () => {
    expect(
      customFields.some((field) =>
        /^(settings|settingsPanel|compositeControl)$/i.test(field.key)
      )
    ).toBe(false);
  });
});
