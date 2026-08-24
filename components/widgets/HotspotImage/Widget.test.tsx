import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useDashboardActions } from '@/context/dashboardCanvasStore';
import { WidgetData, HotspotImageConfig } from '@/types';
import { HotspotImageWidget } from './Widget';

vi.mock('@/context/dashboardCanvasStore');

const mockUpdateWidget = vi.fn();

const createWidget = (
  config: Partial<HotspotImageConfig> = {}
): WidgetData => ({
  id: 'hotspot-1',
  type: 'hotspot-image',
  x: 0,
  y: 0,
  w: 400,
  h: 300,
  z: 1,
  flipped: false,
  config: {
    baseImageUrl: 'data:image/png;base64,AAAA',
    hotspots: [
      {
        id: 'h1',
        xPct: 50,
        yPct: 50,
        title: 'Pin One',
        detailText: 'Detail body text',
        icon: 'info',
        isViewed: false,
      },
    ],
    ...config,
  } as HotspotImageConfig,
});

describe('HotspotImageWidget', () => {
  beforeEach(() => {
    mockUpdateWidget.mockReset();
    vi.mocked(useDashboardActions).mockReturnValue({
      updateWidget: mockUpdateWidget,
    } as unknown as ReturnType<typeof useDashboardActions>);
  });

  afterEach(() => {
    cleanup();
  });

  it('closes the open popover when Escape is pressed', () => {
    render(<HotspotImageWidget widget={createWidget()} />);

    fireEvent.click(
      screen.getByRole('button', { name: /Open hotspot: Pin One/ })
    );
    expect(screen.getByText('Detail body text')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByText('Detail body text')).not.toBeInTheDocument();
  });

  it('stops the Escape from reaching the window-level handler while open', () => {
    const windowHandler = vi.fn();
    window.addEventListener('keydown', windowHandler);

    render(<HotspotImageWidget widget={createWidget()} />);
    fireEvent.click(
      screen.getByRole('button', { name: /Open hotspot: Pin One/ })
    );

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(windowHandler).not.toHaveBeenCalled();
    window.removeEventListener('keydown', windowHandler);
  });

  it('ignores Escape originating from a text input in another widget', () => {
    const windowHandler = vi.fn();
    window.addEventListener('keydown', windowHandler);

    render(<HotspotImageWidget widget={createWidget()} />);
    fireEvent.click(
      screen.getByRole('button', { name: /Open hotspot: Pin One/ })
    );
    expect(screen.getByText('Detail body text')).toBeInTheDocument();

    const otherWidget = document.createElement('div');
    otherWidget.setAttribute('data-draggable-window', '');
    const input = document.createElement('input');
    otherWidget.appendChild(input);
    document.body.appendChild(otherWidget);

    fireEvent.keyDown(input, { key: 'Escape' });

    expect(screen.getByText('Detail body text')).toBeInTheDocument();
    expect(windowHandler).toHaveBeenCalled();

    document.body.removeChild(otherWidget);
    window.removeEventListener('keydown', windowHandler);
  });
});
