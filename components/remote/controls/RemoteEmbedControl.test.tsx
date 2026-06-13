import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RemoteEmbedControl } from './RemoteEmbedControl';
import { WidgetData } from '@/types';

const baseWidget: WidgetData = {
  id: 'widget-1',
  type: 'embed',
  x: 0,
  y: 0,
  w: 4,
  h: 4,
  z: 1,
  flipped: false,
  maximized: false,
  config: {
    url: 'https://docs.google.com/presentation/d/abc123/preview',
    mode: 'url',
  },
} as WidgetData;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RemoteEmbedControl', () => {
  it('features the embed on the board using the real maximize mechanism', async () => {
    const updateWidget = vi.fn();
    render(
      <RemoteEmbedControl widget={baseWidget} updateWidget={updateWidget} />
    );

    const btn = screen.getByRole('button', { name: /feature on board/i });
    await userEvent.click(btn);

    // Must match the existing Maximize button mechanism exactly
    // (RemoteWidgetCard handleMaximize): { maximized, flipped: false }.
    expect(updateWidget).toHaveBeenCalledWith('widget-1', {
      maximized: true,
      flipped: false,
    });
  });

  it('exits full screen when already maximized', async () => {
    const updateWidget = vi.fn();
    const maximizedWidget = {
      ...baseWidget,
      maximized: true,
    } as WidgetData;
    render(
      <RemoteEmbedControl
        widget={maximizedWidget}
        updateWidget={updateWidget}
      />
    );

    const btn = screen.getByRole('button', { name: /exit full screen/i });
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(btn);

    expect(updateWidget).toHaveBeenCalledWith('widget-1', {
      maximized: false,
      flipped: false,
    });
  });
});
