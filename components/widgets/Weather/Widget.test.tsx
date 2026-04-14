import { render, screen, waitFor } from '@testing-library/react';
import { WeatherWidget } from './Widget';
import { WidgetData, WeatherGlobalConfig, WeatherConfig } from '@/types';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import '@testing-library/jest-dom';

// Mock dependencies
const { mockSetBackground, mockUpdateWidget, mockActiveDashboard } = vi.hoisted(
  () => ({
    mockSetBackground: vi.fn(),
    mockUpdateWidget: vi.fn(),
    mockActiveDashboard: { background: 'bg-existing', globalStyle: {} },
  })
);

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    updateWidget: mockUpdateWidget,
    addToast: vi.fn(),
    setBackground: mockSetBackground,
    activeDashboard: mockActiveDashboard,
  }),
}));

const mockFeaturePermissions = [
  {
    widgetType: 'weather',
    config: {
      fetchingStrategy: 'client',
      temperatureRanges: [
        {
          id: '1',
          min: 0,
          max: 32,
          message: 'It is freezing!',
          imageUrl: 'ice.png',
        },
        {
          id: '2',
          min: 80,
          max: 100,
          message: 'It is hot!',
        },
      ],
    } as WeatherGlobalConfig,
  },
];

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    featurePermissions: mockFeaturePermissions,
  }),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  onSnapshot: vi.fn(() => vi.fn()),
  getFirestore: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({
  db: {},
}));

describe('WeatherWidget', () => {
  const baseWidget: WidgetData = {
    id: '1',
    type: 'weather',
    x: 0,
    y: 0,
    w: 2,
    h: 2,
    z: 0,
    flipped: false,
    config: {
      temp: 72,
      condition: 'sunny',
      isAuto: false,
      locationName: 'Test Loc',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('displays default clothing message when no range matches', () => {
    const widget: WidgetData = {
      ...baseWidget,
      config: { ...baseWidget.config, temp: 72 } as WeatherConfig,
    };
    render(<WeatherWidget widget={widget} />);
    expect(screen.getByText(/Long Sleeves/i)).toBeInTheDocument();
  });

  it('displays custom message and image when range matches (Freezing)', () => {
    const widget: WidgetData = {
      ...baseWidget,
      config: { ...baseWidget.config, temp: 20 } as WeatherConfig,
    };
    render(<WeatherWidget widget={widget} />);
    expect(screen.getByText('It is freezing!')).toBeInTheDocument();
    const img = screen.getByAltText('Weather');
    expect(img).toHaveAttribute('src', 'ice.png');
  });

  it('displays custom message without image when range matches (Hot)', () => {
    const widget: WidgetData = {
      ...baseWidget,
      config: { ...baseWidget.config, temp: 90 } as WeatherConfig,
    };
    render(<WeatherWidget widget={widget} />);
    expect(screen.getByText('It is hot!')).toBeInTheDocument();
  });

  it('hides clothing container when hideClothing is true', () => {
    const widget: WidgetData = {
      ...baseWidget,
      config: {
        ...baseWidget.config,
        temp: 72,
        hideClothing: true,
      } as WeatherConfig,
    };
    render(<WeatherWidget widget={widget} />);
    expect(screen.queryByText(/Long Sleeves/i)).not.toBeInTheDocument();
  });

  it('syncs background when enabled', async () => {
    const widget: WidgetData = {
      ...baseWidget,
      config: {
        ...baseWidget.config,
        condition: 'sunny',
        syncBackground: true,
      } as WeatherConfig,
    };
    render(<WeatherWidget widget={widget} />);

    // Expected sunny gradient
    const expectedBg =
      'bg-gradient-to-br from-blue-400 via-sky-300 to-blue-200';
    await waitFor(() => {
      expect(mockSetBackground).toHaveBeenCalledWith(expectedBg);
    });
  });

  it('does not override an HTTP image/video background when syncBackground is enabled', () => {
    const originalBg = mockActiveDashboard.background;
    mockActiveDashboard.background = 'https://example.com/bg.jpg';

    const widget: WidgetData = {
      ...baseWidget,
      config: {
        ...baseWidget.config,
        condition: 'sunny',
        syncBackground: true,
      } as WeatherConfig,
    };
    render(<WeatherWidget widget={widget} />);

    expect(mockSetBackground).not.toHaveBeenCalled();

    mockActiveDashboard.background = originalBg;
  });
});
