import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { WindowStyleTier } from '@/components/settings/schema/windowStyle';
import type { GlobalStyle, WidgetData } from '@/types';

const LABELS: Record<string, string> = {
  'widgetSettings.common.style.windowBackground': 'Window background',
  'widgetSettings.common.style.windowFont': 'Window font',
  'widgetSettings.common.style.windowTextSize': 'Window text size',
  'widgetSettings.common.style.windowTransparency': 'Window transparency',
  'widgetSettings.common.style.resetTransparency':
    'Reset transparency to board default',
  'widgetSettings.common.style.boardDefault': 'Board default',
  'widgetSettings.common.reset': 'Reset',
};
const t = (key: string) => LABELS[key] ?? key;

const baseWidget = {
  id: 'w1',
  type: 'text',
  x: 0,
  y: 0,
  w: 200,
  h: 200,
  z: 1,
  config: {},
} as WidgetData;

const globalStyle = { windowTransparency: 0.4 } as GlobalStyle;

type TierProps = React.ComponentProps<typeof WindowStyleTier>;

const renderTier = (
  widget: Partial<WidgetData> = {},
  styleKeys?: TierProps['styleKeys']
) => {
  const updateWidget = vi.fn();
  render(
    <WindowStyleTier
      widget={{ ...baseWidget, ...widget }}
      updateWidget={updateWidget}
      globalStyle={globalStyle}
      t={t}
      styleKeys={styleKeys}
    />
  );
  return updateWidget;
};

describe('WindowStyleTier', () => {
  it('shows window font and size for a widget without its own', () => {
    renderTier();
    expect(screen.getByText('Window font')).toBeInTheDocument();
    expect(screen.getByText('Window text size')).toBeInTheDocument();
  });

  it('hides window font and size when the Content tier owns them', () => {
    renderTier({}, ['fontFamily', 'fontColor', 'textSizePreset']);
    expect(screen.queryByText('Window font')).not.toBeInTheDocument();
    expect(screen.queryByText('Window text size')).not.toBeInTheDocument();
    expect(screen.getByText('Window background')).toBeInTheDocument();
  });

  it('labels inherited transparency as the board default, not global', () => {
    renderTier();
    expect(screen.queryByText(/global/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole('slider', { name: 'Window transparency' })
    ).toHaveAttribute('aria-valuetext', '40%');
  });

  it('offers Reset once transparency is overridden', () => {
    const updateWidget = renderTier({ transparency: 0.9 });
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Reset transparency to board default',
      })
    );
    expect(updateWidget).toHaveBeenCalledWith('w1', {
      transparency: undefined,
    });
  });

  it('maps the window font dropdown onto the bare GlobalFontFamily value', () => {
    const updateWidget = renderTier();
    fireEvent.click(screen.getByRole('button', { name: /Window font/ }));
    fireEvent.click(screen.getByRole('option', { name: 'Marker' }));
    expect(updateWidget).toHaveBeenCalledWith('w1', { fontFamily: 'marker' });
  });

  it('writes a base text size from the slider', () => {
    const updateWidget = renderTier();
    const slider = screen.getByRole('slider', { name: 'Window text size' });
    expect(slider).toHaveAttribute('aria-valuetext', 'Board default');
    fireEvent.change(slider, { target: { value: '3' } });
    expect(updateWidget).toHaveBeenCalledWith('w1', { baseTextSize: 'xl' });
  });
});
