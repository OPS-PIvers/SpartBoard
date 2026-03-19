import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { QRWidget } from './Widget';
import { QRSettings } from './Settings';
import { WidgetData, QRConfig, TextConfig } from '../../../types';
import { useDashboard } from '../../../context/useDashboard';
import { useFeaturePermissions } from '@/hooks/useFeaturePermissions';
import { useAuth } from '@/context/useAuth';

// Mock the context using the standard pattern
vi.mock('../../../context/useDashboard', () => ({
  useDashboard: vi.fn(),
}));

vi.mock('@/hooks/useFeaturePermissions', () => ({
  useFeaturePermissions: vi.fn(),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: vi.fn(),
}));

const mockUpdateWidget = vi.fn();
const mockActiveDashboard = {
  widgets: [] as WidgetData[],
};

const createMockWidget = (config: Partial<QRConfig> = {}): WidgetData => ({
  id: 'test-widget-id',
  type: 'qr',
  x: 0,
  y: 0,
  w: 2,
  h: 2,
  z: 1,
  flipped: false,
  config: {
    // Default URL in QRWidget.tsx is 'https://google.com', but we can override it here.
    // We will test the fallback explicitly in a separate test.
    url: 'https://example.com',
    ...config,
  },
});

describe('QRWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActiveDashboard.widgets = [];
    (useDashboard as Mock).mockReturnValue({
      activeDashboard: mockActiveDashboard,
      updateWidget: mockUpdateWidget,
    });
    (useFeaturePermissions as Mock).mockReturnValue({
      subscribeToPermission: vi.fn(
        (_type: string, callback: (p: unknown) => void) => {
          // Mock default permission empty
          callback(null);
          return vi.fn();
        }
      ),
    });
    (useAuth as Mock).mockReturnValue({
      selectedBuildings: ['building-1'],
    });
  });

  it('renders with default URL provided in config', () => {
    const widget = createMockWidget();
    render(<QRWidget widget={widget} />);

    const img = screen.getByAltText('QR Code');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute(
      'src',
      expect.stringContaining(encodeURIComponent('https://example.com'))
    );
    expect(screen.getByText('https://example.com')).toBeInTheDocument();
  });

  it('renders with fallback URL when config.url is missing', () => {
    // Create widget with explicit undefined url to trigger fallback
    const widget = createMockWidget({ url: undefined });
    render(<QRWidget widget={widget} />);

    // Default fallback in QRWidget.tsx is 'https://google.com'
    const fallbackUrl = 'https://google.com';
    const img = screen.getByAltText('QR Code');
    expect(img).toHaveAttribute(
      'src',
      expect.stringContaining(encodeURIComponent(fallbackUrl))
    );
    expect(screen.getByText(fallbackUrl)).toBeInTheDocument();
  });

  it('renders with custom URL', () => {
    const url = 'https://vitest.dev';
    const widget = createMockWidget({ url });
    render(<QRWidget widget={widget} />);

    const img = screen.getByAltText('QR Code');
    expect(img).toHaveAttribute(
      'src',
      expect.stringContaining(encodeURIComponent(url))
    );
    expect(screen.getByText(url)).toBeInTheDocument();
  });

  it('applies global building defaults (url, color, bgcolor) when widget config lacks them', () => {
    // Mock the permission hook to return global QR defaults
    (useFeaturePermissions as Mock).mockReturnValue({
      subscribeToPermission: vi.fn(
        (_type: string, callback: (p: unknown) => void) => {
          callback({
            config: {
              buildingDefaults: {
                'building-1': {
                  defaultUrl: 'https://school.edu',
                  qrColor: '#123456',
                  qrBgColor: '#abcdef',
                },
              },
            },
          });
          return vi.fn();
        }
      ),
    });

    const widget = createMockWidget({ url: undefined }); // simulate empty url
    render(<QRWidget widget={widget} />);

    const img = screen.getByAltText('QR Code');
    // Check fallback URL, color, and bgcolor
    expect(img).toHaveAttribute(
      'src',
      expect.stringContaining(encodeURIComponent('https://school.edu'))
    );
    expect(img).toHaveAttribute('src', expect.stringContaining('color=123456'));
    expect(img).toHaveAttribute(
      'src',
      expect.stringContaining('bgcolor=abcdef')
    );
    expect(screen.getByText('https://school.edu')).toBeInTheDocument();
  });

  it('falls back to default colors for invalid hex codes in admin config', () => {
    // Mock the permission hook to return global QR defaults with invalid colors
    (useFeaturePermissions as Mock).mockReturnValue({
      subscribeToPermission: vi.fn(
        (_type: string, callback: (p: unknown) => void) => {
          callback({
            config: {
              buildingDefaults: {
                'building-1': {
                  qrColor: 'red', // Invalid hex
                  qrBgColor: '#123', // Invalid hex (3 digits)
                },
              },
            },
          });
          return vi.fn();
        }
      ),
    });

    const widget = createMockWidget();
    render(<QRWidget widget={widget} />);

    const img = screen.getByAltText('QR Code');
    // Should fallback to 000000 and ffffff
    expect(img).toHaveAttribute('src', expect.stringContaining('color=000000'));
    expect(img).toHaveAttribute(
      'src',
      expect.stringContaining('bgcolor=ffffff')
    );
  });

  it('shows linked badge when synced', () => {
    const widget = createMockWidget({ syncWithTextWidget: true });
    render(<QRWidget widget={widget} />);

    expect(screen.getByText('Linked')).toBeInTheDocument();
  });

  it('does not show linked badge when not synced', () => {
    const widget = createMockWidget({ syncWithTextWidget: false });
    render(<QRWidget widget={widget} />);

    expect(screen.queryByText('Linked')).not.toBeInTheDocument();
  });

  it('syncs URL from Text Widget via Nexus Connection', async () => {
    const targetText = 'Synced Text Content';
    // Mock a text widget in the dashboard
    mockActiveDashboard.widgets = [
      {
        id: 'text-widget-1',
        type: 'text',
        config: { content: targetText } as TextConfig,
      } as WidgetData,
    ];

    // QR Widget configured to sync
    const widget = createMockWidget({
      syncWithTextWidget: true,
      url: 'Old URL',
    });

    render(<QRWidget widget={widget} />);

    // Expect updateWidget to be called to sync the URL
    await waitFor(() => {
      expect(mockUpdateWidget).toHaveBeenCalledWith(
        'test-widget-id',
        expect.objectContaining({
          config: expect.objectContaining({
            url: targetText,
            syncWithTextWidget: true,
          }) as unknown,
        })
      );
    });
  });
});

describe('QRSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActiveDashboard.widgets = [];
    (useDashboard as Mock).mockReturnValue({
      activeDashboard: mockActiveDashboard,
      updateWidget: mockUpdateWidget,
    });
  });

  // Note: Using fireEvent instead of userEvent here because the component is fully controlled
  // via the useDashboard hook. In a unit test with mocks, the prop doesn't update
  // after the event, causing userEvent.type to "snap back" the value on each keystroke,
  // making it impossible to type a full string. fireEvent.change simulates the final state.

  it('updates URL when input changes', () => {
    const widget = createMockWidget();
    render(<QRSettings widget={widget} />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'https://new-url.com' } });

    expect(mockUpdateWidget).toHaveBeenCalledWith('test-widget-id', {
      config: expect.objectContaining({
        url: 'https://new-url.com',
      }) as unknown,
    });
  });

  it('disables input when synced', () => {
    const widget = createMockWidget({ syncWithTextWidget: true });
    render(<QRSettings widget={widget} />);

    const input = screen.getByRole('textbox');
    expect(input).toBeDisabled();
  });

  it('toggles sync setting', () => {
    const widget = createMockWidget({ syncWithTextWidget: false });
    render(<QRSettings widget={widget} />);

    const toggle = screen.getByRole('switch');
    fireEvent.click(toggle);

    expect(mockUpdateWidget).toHaveBeenCalledWith('test-widget-id', {
      config: expect.objectContaining({ syncWithTextWidget: true }) as unknown,
    });
  });

  it('shows warning when synced but no text widget exists', () => {
    mockActiveDashboard.widgets = []; // Ensure no widgets
    const widget = createMockWidget({ syncWithTextWidget: true });
    render(<QRSettings widget={widget} />);

    expect(screen.getByText(/No Text Widget found/i)).toBeInTheDocument();
  });
});
