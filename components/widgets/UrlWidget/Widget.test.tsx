import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, Mock } from 'vitest';
import { UrlWidget } from './Widget';
import { WidgetData, UrlWidgetConfig } from '@/types';
import { useDashboard } from '@/context/useDashboard';

// Mock the context
vi.mock('@/context/useDashboard', () => ({
  useDashboard: vi.fn(),
}));

const mockAddWidget = vi.fn();
const mockOpen = vi.fn();

const createMockWidget = (
  config: Partial<UrlWidgetConfig> = {}
): WidgetData => ({
  id: 'test-widget-id',
  type: 'url',
  x: 0,
  y: 0,
  w: 2,
  h: 2,
  z: 1,
  flipped: false,
  config: {
    urls: [
      {
        id: 'url-1',
        url: 'https://example.com',
        title: 'Example',
        color: '#123456',
      },
    ],
    ...config,
  },
});

describe('UrlWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useDashboard as Mock).mockReturnValue({
      addWidget: mockAddWidget,
    });
    // Mock window.open
    global.window.open = mockOpen;
  });

  it('renders correctly with URLs', () => {
    const widget = createMockWidget();
    render(<UrlWidget widget={widget} />);
    expect(screen.getByText('Example')).toBeInTheDocument();
  });

  it('opens URL in a new tab when ExternalLink button is clicked', () => {
    const widget = createMockWidget();
    render(<UrlWidget widget={widget} />);

    // Find the open in new tab button
    const externalLinkButton = screen.getByTitle('Open in new tab');
    fireEvent.click(externalLinkButton);

    expect(mockOpen).toHaveBeenCalledWith(
      'https://example.com',
      '_blank',
      'noopener,noreferrer'
    );
  });

  it('spawns a QR widget when QrCode button is clicked', () => {
    const widget = createMockWidget();
    render(<UrlWidget widget={widget} />);

    // Find the create QR code button
    const qrCodeButton = screen.getByTitle('Create QR Code');
    fireEvent.click(qrCodeButton);

    expect(mockAddWidget).toHaveBeenCalledWith('qr', {
      config: { url: 'https://example.com' },
    });
  });
});
