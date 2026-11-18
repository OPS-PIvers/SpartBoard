import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SettingsDrawer } from '@/components/settings/SettingsDrawer';
import type { GlobalStyle, WidgetData } from '@/types';

const widget = {
  id: 'w1',
  type: 'music',
  x: 0,
  y: 0,
  w: 200,
  h: 200,
  z: 1,
  config: { stationId: 'lofi', syncWithTimeTool: true, textColor: '#fff' },
} as WidgetData;

type Props = React.ComponentProps<typeof SettingsDrawer>;

const schema = {
  groups: [
    {
      id: 'behavior' as const,
      fields: [
        { key: 'stationId', type: 'text' as const, label: 'station' },
        { key: 'syncWithTimeTool', type: 'toggle' as const, label: 'sync' },
      ],
    },
  ],
  styleKeys: ['textColor' as const],
};

function renderSettingsTab(overrides: Partial<Props> = {}) {
  const onSave = vi.fn();
  const updateConfig = vi.fn();
  render(
    <SettingsDrawer
      widget={widget}
      title="Music"
      placement="right"
      width={400}
      onWidthCommit={vi.fn()}
      onClose={vi.fn()}
      updateWidget={vi.fn()}
      updateConfig={updateConfig}
      globalStyle={{ windowTransparency: 0.5 } as GlobalStyle}
      schema={schema as unknown as Props['schema']}
      toolLabel={() => 'Music'}
      settingsDefaults={{
        widgetDefaults: { stationId: '', textColor: '#000' },
        saved: undefined,
        onSave,
      }}
      {...overrides}
    />
  );
  return { onSave, updateConfig };
}

afterEach(cleanup);

describe('Settings tab defaults footer', () => {
  it('saves the settings fields but not appearance', () => {
    const { onSave } = renderSettingsTab();
    const footer = screen.getByTestId('settings-defaults-footer');
    expect(footer).toHaveTextContent('Differs from your default');
    fireEvent.click(screen.getByRole('button', { name: 'Save as my default' }));
    expect(onSave).toHaveBeenCalledWith({
      stationId: 'lofi',
      syncWithTimeTool: true,
    });
  });

  it('resets the settings to my saved default', () => {
    const { updateConfig } = renderSettingsTab({
      settingsDefaults: {
        widgetDefaults: { stationId: '' },
        saved: { stationId: 'jazz' },
        onSave: vi.fn(),
      },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Reset to my default' })
    );
    expect(updateConfig).toHaveBeenCalledWith({
      stationId: 'jazz',
      syncWithTimeTool: undefined,
    });
  });

  it('matches once the saved default equals this widget', () => {
    renderSettingsTab({
      settingsDefaults: {
        saved: { stationId: 'lofi', syncWithTimeTool: true },
        onSave: vi.fn(),
      },
    });
    expect(screen.getByTestId('settings-defaults-footer')).toHaveTextContent(
      'Matches your default'
    );
    expect(
      screen.getByRole('button', { name: 'Save as my default' })
    ).toBeDisabled();
  });

  it('is absent when the flag is off', () => {
    renderSettingsTab({ settingsDefaults: undefined });
    expect(screen.queryByTestId('settings-defaults-footer')).toBeNull();
  });
});
