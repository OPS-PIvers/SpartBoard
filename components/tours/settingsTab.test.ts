import { describe, expect, it } from 'vitest';
import type { WidgetSettingsSchema } from '@/components/settings/schema/types';
import { fieldSettingsTab, settingsTabOf } from './settingsTab';

const schema = {
  groups: [
    { id: 'content', fields: [{ key: 'items', type: 'list' }] },
    { id: 'behavior', fields: [{ key: 'autoStart', type: 'toggle' }] },
    { id: 'display', fields: [{ key: 'glow', type: 'toggle' }] },
  ],
  styleKeys: ['fontFamily'],
} as unknown as WidgetSettingsSchema;

describe('settingsTabOf', () => {
  it('puts content and behavior fields on Settings, display and style keys on Style', () => {
    expect(settingsTabOf(schema, 'autoStart')).toBe('settings');
    expect(settingsTabOf(schema, 'items.2.task')).toBe('settings');
    expect(settingsTabOf(schema, 'glow')).toBe('style');
    expect(settingsTabOf(schema, 'fontFamily')).toBe('style');
    expect(settingsTabOf(schema, 'nowhere')).toBeNull();
  });

  it('resolves a group id to the tab that renders the group', () => {
    expect(settingsTabOf(schema, 'behavior')).toBe('settings');
    expect(settingsTabOf(schema, 'display')).toBe('style');
  });
});

describe('fieldSettingsTab', () => {
  it("loads the widget's schema, then answers synchronously", async () => {
    expect(fieldSettingsTab('clock', 'glow')).toBeUndefined();
    await expect
      .poll(() => fieldSettingsTab('clock', 'glow'), { timeout: 5000 })
      .toBe('style');
    expect(fieldSettingsTab('clock', 'showSeconds')).toBe('settings');
  });

  it('knows nothing about a widget without a schema', () => {
    expect(fieldSettingsTab('no-such-widget', 'x')).toBeNull();
  });
});
