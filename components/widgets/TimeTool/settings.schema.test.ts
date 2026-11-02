import { describe, expect, it } from 'vitest';
import type { TimeToolConfig, WidgetData } from '@/types';
import { STANDARD_COLORS } from '@/config/colors';
import { WIDGET_DEFAULTS } from '@/config/widgetDefaults';
import type { FieldCtx } from '@/components/settings/schema/types';
import { validateSchema } from '@/components/settings/schema/validateSchema';
import { migrateWidget, targetConfigVersion } from '@/utils/migration';
import { mergeWidgetConfig } from '@/utils/widgetConfigPersistence';
import schema from './settings.schema';

// Captured from the legacy Settings.tsx (inventory §time-tool).
const PRE_MIGRATION_FIXTURE: TimeToolConfig = {
  mode: 'timer',
  visualType: 'digital',
  duration: 600,
  elapsedTime: 600,
  isRunning: false,
  startTime: null,
  selectedSound: 'Gong',
  adjustStepSeconds: 60,
  timerEndVoiceLevel: 2,
  timerEndTrafficColor: 'yellow',
  timerEndTriggerRandom: true,
  timerEndTriggerNextUp: false,
  timerEndTriggerStationsRotate: false,
  themeColor: '#64748b',
  glow: true,
  fontFamily: 'global',
  clockStyle: 'modern',
};

// Every config key TimeToolWidget.tsx / useTimeTool.ts reads.
const FRONT_FACE_KEYS: ReadonlyArray<keyof TimeToolConfig> = [
  'mode',
  'visualType',
  'duration',
  'elapsedTime',
  'isRunning',
  'startTime',
  'selectedSound',
  'adjustStepSeconds',
  'timerEndVoiceLevel',
  'timerEndTrafficColor',
  'timerEndTriggerRandom',
  'timerEndTriggerNextUp',
  'timerEndTriggerStationsRotate',
  'themeColor',
  'glow',
  'fontFamily',
  'clockStyle',
];

const makeWidget = (config: TimeToolConfig): WidgetData => ({
  id: 'tt-1',
  type: 'time-tool',
  x: 0,
  y: 0,
  w: 420,
  h: 400,
  z: 1,
  flipped: false,
  config,
});

describe('time-tool settings schema', () => {
  it('validates with no errors', () => {
    expect(validateSchema('time-tool', schema).errors).toEqual([]);
  });

  it('warns only for the timer-end toggles, which have no literal front-face fallback', () => {
    expect(validateSchema('time-tool', schema).warnings).toEqual([
      'time-tool: WIDGET_DEFAULTS.config has no default for "timerEndTriggerRandom"',
      'time-tool: WIDGET_DEFAULTS.config has no default for "timerEndTriggerStationsRotate"',
      'time-tool: WIDGET_DEFAULTS.config has no default for "timerEndTriggerNextUp"',
    ]);
  });

  it('wraps every timer-end setting in a partner card under one section, hidden in stopwatch mode', () => {
    const ctx = (mode: string) => ({ config: { mode } }) as unknown as FieldCtx;
    const behavior = schema.groups.find((g) => g.id === 'behavior');
    const cards = (behavior?.fields ?? []).filter(
      (f) => f.type === 'partnerWidget'
    );
    expect(cards.map((f) => f.type === 'partnerWidget' && f.partner)).toEqual([
      'expectations',
      'traffic',
      'random',
      'stations',
      'nextUp',
    ]);
    for (const card of cards) {
      expect(card.section).toBe('timerEndSection');
      expect(card.visibleWhen?.(ctx('timer'))).toBe(true);
      expect(card.visibleWhen?.(ctx('stopwatch'))).toBe(false);
    }
  });

  it('keeps defaults equal to the front-face fallbacks (TimeToolWidget.tsx ~400-404)', () => {
    const defaults = WIDGET_DEFAULTS['time-tool'].config as TimeToolConfig;
    expect(defaults.themeColor).toBe(STANDARD_COLORS.slate);
    expect(defaults.glow).toBe(false);
    expect(defaults.fontFamily).toBe('global');
    expect(defaults.clockStyle).toBe('modern');
    expect(defaults.adjustStepSeconds).toBe(60);
  });

  it('lists groups in D8 order with the expected keys', () => {
    expect(schema.groups.map((g) => g.id)).toEqual([
      'content',
      'behavior',
      'display',
    ]);
    expect(schema.groups.map((g) => g.fields.map((f) => f.key))).toEqual([
      ['mode', 'selectedSound'],
      [
        'adjustStepSeconds',
        'duration',
        'timerEndVoiceLevel',
        'timerEndTrafficColor',
        'timerEndTriggerRandom',
        'timerEndTriggerStationsRotate',
        'timerEndTriggerNextUp',
      ],
      ['visualType', 'clockStyle', 'themeColor', 'glow'],
    ]);
    expect(schema.styleKeys).toEqual(['fontFamily']);
  });

  it('clamps adjustStepSeconds to the legacy 5-60 range', () => {
    const field = schema.groups[1].fields[0];
    expect(field).toMatchObject({
      type: 'number',
      key: 'adjustStepSeconds',
      min: 5,
      max: 60,
      step: 5,
    });
  });

  it('hides the adjust step outside timer mode', () => {
    const field = schema.groups[1].fields[0];
    const ctx = (mode: string) => ({ config: { mode } }) as unknown as FieldCtx;
    expect(field.visibleWhen?.(ctx('timer'))).toBe(true);
    expect(field.visibleWhen?.(ctx('stopwatch'))).toBe(false);
  });

  it('has no migration steps, so configVersion is unset', () => {
    expect(schema.configVersion ?? 0).toBe(targetConfigVersion('time-tool'));
    expect(targetConfigVersion('time-tool')).toBe(0);
  });
});

describe('time-tool config migration', () => {
  it('passes the pre-migration fixture through unchanged (plus configVersion)', () => {
    const once = migrateWidget(makeWidget(PRE_MIGRATION_FIXTURE));
    expect(once.config).toEqual(PRE_MIGRATION_FIXTURE);
    expect(once.configVersion).toBe(0);
  });

  it('is idempotent', () => {
    const once = migrateWidget(makeWidget(PRE_MIGRATION_FIXTURE));
    const twice = migrateWidget(once);
    expect(twice).toEqual(once);
  });

  it('round-trips through mergeWidgetConfig without losing a front-face key', () => {
    const merged = mergeWidgetConfig(
      WIDGET_DEFAULTS['time-tool'].config,
      undefined,
      { fontFamily: 'font-mono', themeColor: '#ad2122' },
      PRE_MIGRATION_FIXTURE
    );
    const migrated = migrateWidget(makeWidget(merged as TimeToolConfig));
    for (const key of FRONT_FACE_KEYS) {
      expect(migrated.config, key).toHaveProperty(key);
    }
    expect(migrated.config).toEqual(PRE_MIGRATION_FIXTURE);
  });
});
