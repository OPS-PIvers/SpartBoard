import { describe, it, expect } from 'vitest';
import { WIDGET_DEFAULTS } from '@/config/widgetDefaults';
import { WidgetType } from '@/types';

// Item 1a.6: backfill WIDGET_DEFAULTS with the front-face inline fallback for
// every settings-inventory row marked in-defaults? = no. Table mirrors
// docs/plans/shipped/widget-settings-inventory.md; keep the pairs in sync with it.
const BACKFILLED: Array<{
  type: WidgetType;
  key: string;
  value: unknown;
}> = [
  { type: 'clock', key: 'fontFamily', value: 'global' },
  { type: 'clock', key: 'clockStyle', value: 'modern' },
  { type: 'clock', key: 'themeColor', value: '#1e293b' },
  { type: 'clock', key: 'glow', value: false },
  { type: 'time-tool', key: 'themeColor', value: '#1e293b' },
  { type: 'time-tool', key: 'glow', value: false },
  { type: 'time-tool', key: 'fontFamily', value: 'global' },
  { type: 'time-tool', key: 'clockStyle', value: 'modern' },
  { type: 'text', key: 'fontFamily', value: 'global' },
  { type: 'text', key: 'fontColor', value: '#334155' },
  { type: 'checklist', key: 'rosterMode', value: 'class' },
  { type: 'checklist', key: 'fontFamily', value: 'global' },
  { type: 'checklist', key: 'fontColor', value: '#334155' },
  { type: 'checklist', key: 'cardColor', value: '#ffffff' },
  { type: 'checklist', key: 'cardOpacity', value: 1 },
  { type: 'random', key: 'soundEnabled', value: true },
  { type: 'random', key: 'autoStartTimer', value: false },
  { type: 'random', key: 'visualStyle', value: 'flash' },
  { type: 'embed', key: 'mode', value: 'url' },
  { type: 'embed', key: 'html', value: '' },
  { type: 'embed', key: 'refreshInterval', value: 0 },
  { type: 'weather', key: 'fontFamily', value: 'global' },
  { type: 'weather', key: 'fontColor', value: '#334155' },
  { type: 'weather', key: 'cardColor', value: '#ffffff' },
  { type: 'weather', key: 'cardOpacity', value: 1 },
  { type: 'lunchCount', key: 'lunchTimeHour', value: '' },
  { type: 'lunchCount', key: 'lunchTimeMinute', value: '' },
  { type: 'lunchCount', key: 'gradeLevel', value: '' },
];

describe('WIDGET_DEFAULTS backfill (item 1a.6)', () => {
  it.each(BACKFILLED)(
    '$type.config.$key equals the recorded front-face fallback',
    ({ type, key, value }) => {
      const config = WIDGET_DEFAULTS[type].config as Record<string, unknown>;
      expect(config[key]).toEqual(value);
    }
  );
});
