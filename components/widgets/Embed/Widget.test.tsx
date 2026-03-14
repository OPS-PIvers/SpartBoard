/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { render, screen, fireEvent, act } from '@testing-library/react';
import { EmbedWidget, EmbedSettings } from './index';
import { WidgetData, EmbedConfig } from '../../../types';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom';

// Mock dependencies
const mockUpdateWidget = vi.fn();
vi.mock('../../../context/useDashboard', () => ({
  useDashboard: () => ({
    updateWidget: mockUpdateWidget,
  }),
}));

describe('EmbedWidget', () => {
  const baseWidget: WidgetData = {
    id: '1',
    type: 'embed',
    x: 0,
    y: 0,
    w: 4,
    h: 4,
    z: 0,
    flipped: false,
    config: {
      url: 'https://example.com',
      mode: 'url',
    } as EmbedConfig,
  };

  beforeEach(() => {
    vi.useFakeTimers();
    mockUpdateWidget.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders an iframe with the correct src in url mode', () => {
    render(<EmbedWidget widget={baseWidget} />);
    const iframe = screen.getByTitle('Embed Content');
    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute('src', 'https://example.com');
  });

  it('does not include allow-same-origin in sandbox for generic URLs', () => {
    render(<EmbedWidget widget={baseWidget} />);
    const iframe = screen.getByTitle('Embed Content');
    expect(iframe.getAttribute('sandbox')).not.toContain('allow-same-origin');
  });

  it('adds allow-same-origin in sandbox for Google Drive URLs', () => {
    const driveWidget: WidgetData = {
      ...baseWidget,
      config: {
        ...baseWidget.config,
        url: 'https://drive.google.com/file/d/abc456/view',
      } as EmbedConfig,
    };
    render(<EmbedWidget widget={driveWidget} />);
    const iframe = screen.getByTitle('Embed Content');
    expect(iframe.getAttribute('sandbox')).toContain('allow-same-origin');
  });

  it('adds allow-same-origin in sandbox for Google Vids URLs', () => {
    const vidsWidget: WidgetData = {
      ...baseWidget,
      config: {
        ...baseWidget.config,
        url: 'https://vids.google.com/vids/some_vids_id-123',
      } as EmbedConfig,
    };
    render(<EmbedWidget widget={vidsWidget} />);
    const iframe = screen.getByTitle('Embed Content');
    expect(iframe.getAttribute('sandbox')).toContain('allow-same-origin');
  });

  it('renders an iframe with srcDoc in code mode', () => {
    const codeWidget: WidgetData = {
      ...baseWidget,
      config: {
        mode: 'code',
        html: '<h1>Hello World</h1>',
      } as EmbedConfig,
    };
    render(<EmbedWidget widget={codeWidget} />);
    const iframe = screen.getByTitle('Embed Content');
    expect(iframe).toHaveAttribute('srcDoc', '<h1>Hello World</h1>');
  });

  it('increments refreshKey and re-renders iframe periodically', () => {
    const refreshWidget: WidgetData = {
      ...baseWidget,
      config: {
        ...baseWidget.config,
        refreshInterval: 1, // 1 minute
      } as EmbedConfig,
    };

    const { container } = render(<EmbedWidget widget={refreshWidget} />);
    const iframeBefore = container.querySelector('iframe');
    expect(iframeBefore).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(60 * 1000);
    });

    const iframeAfter = container.querySelector('iframe');
    expect(iframeAfter).toBeInTheDocument();
    // Changing the 'key' prop forces React to create a new DOM element
    expect(iframeAfter).not.toBe(iframeBefore);
  });

  describe('EmbedSettings', () => {
    it('updates refreshInterval when selection changes', () => {
      render(<EmbedSettings widget={baseWidget} />);
      const select = screen.getByLabelText(/Auto-Refresh/i);

      fireEvent.change(select, { target: { value: '5' } });

      expect(mockUpdateWidget).toHaveBeenCalledWith('1', {
        config: expect.objectContaining({
          refreshInterval: 5,
        }),
      });
    });
  });
});
