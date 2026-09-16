import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { SettingsDrawerHost } from '@/components/settings/SettingsDrawerHost';
import type {
  CustomRenderCtx,
  WidgetSettingsSchema,
} from '@/components/settings/schema/types';
import { makeBoard, makeWidget, renderWithCanvas } from './settingsHostHarness';

vi.mock('@/hooks/useHelpResources', () => ({
  useHelpItemsForWidget: () => [],
}));
vi.mock('@/components/common/WidgetBuildingToggle', () => ({
  WidgetBuildingToggle: () => null,
}));
vi.mock('@/components/settings/legacy/LegacySettingsSlot', () => ({
  LegacySettingsSlot: () => <div data-testid="legacy-slot" />,
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    canAccessFeature: () => true,
    featurePermissions: [],
    selectedBuildings: [],
    savedWidgetConfigs: {},
    saveWidgetDefault: vi.fn(),
    dockPosition: 'bottom',
    settingsDrawerWidth: 400,
    updateUserPreference: vi.fn(),
    isAdmin: false,
  }),
}));

// Mirrors Embed's async Verify: one handler writes two different keys in the same tick.
const renderTwoWrites = (ctx: CustomRenderCtx) => (
  <button
    type="button"
    onClick={() => {
      ctx.updateConfig({ isEmbeddable: true });
      ctx.updateConfig({ blockedReason: '' });
    }}
  >
    write both
  </button>
);

const schema: WidgetSettingsSchema = {
  groups: [
    {
      id: 'content',
      fields: [
        {
          type: 'custom',
          key: 'isEmbeddable',
          label: 'title',
          render: renderTwoWrites,
        },
      ],
    },
  ],
};

vi.mock('@/components/widgets/WidgetRegistry', async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import('@/components/widgets/WidgetRegistry')
    >();
  return {
    ...original,
    WIDGET_SETTINGS_SCHEMAS: { clock: () => Promise.resolve(schema) },
  };
});

afterEach(() => {
  cleanup();
});

describe('SettingsDrawerHost.updateConfig sends sparse patches', () => {
  it('lets two writes in one tick both survive instead of the second reverting the first', async () => {
    const w = makeWidget({
      flipped: true,
      config: { url: 'https://example.com', mode: 'url' },
    });
    const harness = renderWithCanvas(<SettingsDrawerHost />, makeBoard([w]));

    await act(async () => {
      await Promise.resolve();
    });
    const button = await screen.findByRole('button', { name: 'write both' });
    fireEvent.click(button);

    const calls = harness.updateWidget.mock.calls as Array<
      [string, { config?: Record<string, unknown> }]
    >;
    const configWrites = calls.filter(([, changes]) => 'config' in changes);
    expect(configWrites).toEqual([
      ['w1', { config: { isEmbeddable: true } }],
      ['w1', { config: { blockedReason: '' } }],
    ]);
    // A stale full-config snapshot would have carried `url`/`mode` and clobbered newer keys.
    for (const [, changes] of configWrites) {
      expect(changes.config).not.toHaveProperty('url');
    }
  });
});
