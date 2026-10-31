import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { WeatherWidget } from './Widget';
import { WidgetData, WeatherGlobalConfig } from '@/types';
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
      detailsBuildingIds: ['intermediate'],
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

const mockAuth = {
  detailsFlag: false,
  selectedBuildings: ['intermediate'],
};

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    featurePermissions: mockFeaturePermissions,
    canAccessFeature: (id: string) =>
      id === 'weather-details' ? mockAuth.detailsFlag : true,
    selectedBuildings: mockAuth.selectedBuildings,
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

vi.mock('./WeatherDetailsPanel', () => ({
  WeatherDetailsLayout: ({
    rows,
    children,
  }: {
    rows: { field: string; value: string }[];
    children: ReactNode;
  }) => (
    <div data-testid="weather-details">
      {rows.map((r) => (
        <span key={r.field}>{`${r.field}:${r.value}`}</span>
      ))}
      {children}
    </div>
  ),
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
    mockAuth.detailsFlag = false;
    mockAuth.selectedBuildings = ['intermediate'];
  });

  it('displays default clothing message when no range matches', () => {
    const widget: WidgetData = {
      ...baseWidget,
      config: { ...baseWidget.config, temp: 72 },
    };
    render(<WeatherWidget widget={widget} />);
    expect(screen.getByText(/Long Sleeves/i)).toBeInTheDocument();
  });

  it('displays custom message and image when range matches (Freezing)', () => {
    const widget: WidgetData = {
      ...baseWidget,
      config: { ...baseWidget.config, temp: 20 },
    };
    render(<WeatherWidget widget={widget} />);
    expect(screen.getByText('It is freezing!')).toBeInTheDocument();
    const img = screen.getByAltText('Weather');
    expect(img).toHaveAttribute('src', 'ice.png');
  });

  it('displays custom message without image when range matches (Hot)', () => {
    const widget: WidgetData = {
      ...baseWidget,
      config: { ...baseWidget.config, temp: 90 },
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
      },
    };
    render(<WeatherWidget widget={widget} />);
    expect(screen.queryByText(/Long Sleeves/i)).not.toBeInTheDocument();
  });

  it.each([
    [72, 1.74],
    [100, 2.4],
    [-41, 2.24],
  ])('caps the %s° temperature by its estimated width', (temp, widthEm) => {
    const widget: WidgetData = {
      ...baseWidget,
      config: { ...baseWidget.config, temp },
    };
    render(<WeatherWidget widget={widget} />);
    // jsdom rewrites calc(x / n) as (1/n) * x.
    const factor = /min\(35cqmin, ([\d.]+) \* \(100cqw - 34cqmin\)\)/.exec(
      screen.getByText(`${temp}°`).style.fontSize
    )?.[1];
    expect(Number(factor)).toBeCloseTo(1 / widthEm, 6);
  });

  it('syncs background when enabled', async () => {
    const widget: WidgetData = {
      ...baseWidget,
      config: {
        ...baseWidget.config,
        condition: 'sunny',
        syncBackground: true,
      },
    };
    render(<WeatherWidget widget={widget} />);

    // Expected sunny gradient
    const expectedBg = 'bg-linear-to-br from-blue-400 via-sky-300 to-blue-200';
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
      },
    };
    render(<WeatherWidget widget={widget} />);

    expect(mockSetBackground).not.toHaveBeenCalled();

    mockActiveDashboard.background = originalBg;
  });
  describe('weather details', () => {
    const detailWidget: WidgetData = {
      ...baseWidget,
      config: {
        ...baseWidget.config,
        detailFields: ['dewPoint', 'humidity'],
        details: { dewPoint: 40, humidity: 92 },
      },
    };

    it('stays off without the release flag', () => {
      render(<WeatherWidget widget={detailWidget} />);
      expect(screen.queryByTestId('weather-details')).not.toBeInTheDocument();
    });

    it('stays off in a building the admin has not allowed', () => {
      mockAuth.detailsFlag = true;
      mockAuth.selectedBuildings = ['high'];
      render(<WeatherWidget widget={detailWidget} />);
      expect(screen.queryByTestId('weather-details')).not.toBeInTheDocument();
    });

    it('shows with the flag on in an allowed building', () => {
      mockAuth.detailsFlag = true;
      render(<WeatherWidget widget={detailWidget} />);
      expect(screen.getByTestId('weather-details')).toBeInTheDocument();
    });

    it('hides saved station readings in manual mode', () => {
      mockAuth.detailsFlag = true;
      render(
        <WeatherWidget
          widget={{
            ...detailWidget,
            config: { ...detailWidget.config, feelsLike: 31 },
          }}
        />
      );
      expect(screen.queryByText(/31°/)).not.toBeInTheDocument();
      expect(screen.getByText('dewPoint:--')).toBeInTheDocument();
      expect(screen.getByText('humidity:--')).toBeInTheDocument();
    });

    it('shows station readings in automatic mode', () => {
      mockAuth.detailsFlag = true;
      render(
        <WeatherWidget
          widget={{
            ...detailWidget,
            config: { ...detailWidget.config, isAuto: true },
          }}
        />
      );
      expect(screen.getByText('dewPoint:40°')).toBeInTheDocument();
      expect(screen.getByText('humidity:92')).toBeInTheDocument();
    });
  });
});
