import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SettingsDrawer } from '@/components/settings/SettingsDrawer';
import type { GlobalStyle, WidgetData } from '@/types';

const widget = {
  id: 'w1',
  type: 'text',
  x: 0,
  y: 0,
  w: 200,
  h: 200,
  z: 1,
  config: { content: 'Notes', fontColor: '#ffffff' },
} as WidgetData;

type Props = React.ComponentProps<typeof SettingsDrawer>;

function renderStyleTab(overrides: Partial<Props> = {}) {
  const onSave = vi.fn();
  const updateConfig = vi.fn();
  render(
    <SettingsDrawer
      widget={widget}
      title="Text"
      placement="right"
      width={400}
      onWidthCommit={vi.fn()}
      onClose={vi.fn()}
      updateWidget={vi.fn()}
      updateConfig={updateConfig}
      globalStyle={{ windowTransparency: 0.5 } as GlobalStyle}
      schema={{ groups: [], styleKeys: ['fontColor'] }}
      toolLabel={() => 'Note'}
      styleDefaults={{
        widgetDefaults: { content: '', fontColor: '#334155' },
        saved: undefined,
        onSave,
      }}
      {...overrides}
    />
  );
  fireEvent.click(screen.getByRole('tab', { name: 'Style' }));
  return { onSave, updateConfig };
}

afterEach(cleanup);

describe('Style tab defaults footer', () => {
  it('flags a widget that differs from my default and saves only appearance', () => {
    const { onSave } = renderStyleTab();
    expect(
      screen.getByText('Differs from your default for new Note widgets.')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save as my default' }));
    expect(onSave).toHaveBeenCalledWith({ fontColor: '#ffffff' });
  });

  it('resets the widget to my default', () => {
    const { updateConfig } = renderStyleTab();
    fireEvent.click(
      screen.getByRole('button', { name: 'Reset to my default' })
    );
    expect(updateConfig).toHaveBeenCalledWith({ fontColor: '#334155' });
  });

  it('disables both actions once the widget matches', () => {
    renderStyleTab({
      styleDefaults: {
        widgetDefaults: { fontColor: '#334155' },
        saved: { fontColor: '#ffffff' },
        onSave: vi.fn(),
      },
    });
    expect(
      screen.getByText('Matches your default for new Note widgets.')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Save as my default' })
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Reset to my default' })
    ).toBeDisabled();
  });

  it('disables both actions on a read-only board', () => {
    renderStyleTab({ readOnly: true });
    expect(
      screen.getByRole('button', { name: 'Save as my default' })
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Reset to my default' })
    ).toBeDisabled();
  });

  it('is absent without styleDefaults', () => {
    renderStyleTab({ styleDefaults: undefined });
    expect(screen.queryByTestId('style-defaults-footer')).toBeNull();
  });
});
