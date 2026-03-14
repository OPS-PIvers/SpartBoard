import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import {
  WidgetData,
  CatalystConfig,
  CatalystCategory,
  FeaturePermission,
} from '@/types';
import { CatalystWidget } from './CatalystWidget';

// Mock useDashboard
vi.mock('@/context/useDashboard', () => ({
  useDashboard: vi.fn(),
}));

// Mock useAuth
vi.mock('@/context/useAuth', () => ({
  useAuth: vi.fn(),
}));

const mockUpdateWidget = vi.fn();
const mockAddWidget = vi.fn();

const mockDashboardContext = {
  updateWidget: mockUpdateWidget,
  addWidget: mockAddWidget,
};

describe('CatalystWidget', () => {
  beforeEach(() => {
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      mockDashboardContext
    );
    // Default auth mock with no specific catalyst permission
    (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      featurePermissions: [],
    });
    mockUpdateWidget.mockClear();
    mockAddWidget.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  const createWidget = (config: Partial<CatalystConfig> = {}): WidgetData => {
    return {
      id: 'catalyst-1',
      type: 'catalyst',
      x: 0,
      y: 0,
      w: 400,
      h: 400,
      z: 1,
      flipped: false,
      config: {
        activeCategory: null,
        activeStrategyId: null,
        ...config,
      },
    } as WidgetData;
  };

  it('renders default categories when no custom config provided', () => {
    render(<CatalystWidget widget={createWidget()} />);
    expect(screen.getByText('Attention')).toBeInTheDocument();
    expect(screen.getByText('Engage')).toBeInTheDocument();
    expect(screen.getByText('Set Up')).toBeInTheDocument();
    expect(screen.getByText('Support')).toBeInTheDocument();
  });

  it('renders custom categories when provided via global permissions', () => {
    const customCategories: CatalystCategory[] = [
      {
        id: 'cat1',
        label: 'Custom Cat 1',
        icon: 'Zap',
        color: 'bg-red-500',
        isCustom: true,
      },
      {
        id: 'cat2',
        label: 'Custom Cat 2',
        icon: 'Star',
        color: 'bg-blue-500',
        isCustom: true,
      },
    ];

    (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      featurePermissions: [
        {
          widgetType: 'catalyst',
          accessLevel: 'public',
          betaUsers: [],
          enabled: true,
          config: {
            customCategories,
          },
        } as FeaturePermission,
      ],
    });

    render(<CatalystWidget widget={createWidget()} />);

    // With merge behavior, both custom and default categories should be present
    expect(screen.getByText('Custom Cat 1')).toBeInTheDocument();
    expect(screen.getByText('Custom Cat 2')).toBeInTheDocument();
    expect(screen.getByText('Attention')).toBeInTheDocument(); // Default should still be there
  });

  it('overrides default category when custom has same ID', () => {
    const customCategories: CatalystCategory[] = [
      {
        id: 'Get Attention', // Same ID as default
        label: 'Modified Attention',
        icon: 'Zap',
        color: 'bg-red-500',
      },
    ];

    (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      featurePermissions: [
        {
          widgetType: 'catalyst',
          accessLevel: 'public',
          betaUsers: [],
          enabled: true,
          config: {
            customCategories,
          },
        } as FeaturePermission,
      ],
    });

    render(<CatalystWidget widget={createWidget()} />);

    // Should see modified version, not original
    expect(screen.getByText('Modified Attention')).toBeInTheDocument();
    expect(screen.queryByText('Attention')).not.toBeInTheDocument();
  });

  it('excludes removed category IDs from display', () => {
    (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      featurePermissions: [
        {
          widgetType: 'catalyst',
          accessLevel: 'public',
          betaUsers: [],
          enabled: true,
          config: {
            removedCategoryIds: ['Get Attention', 'Engage'],
          },
        } as FeaturePermission,
      ],
    });

    render(<CatalystWidget widget={createWidget()} />);

    // Should not see removed categories
    expect(screen.queryByText('Attention')).not.toBeInTheDocument();
    expect(screen.queryByText('Engage')).not.toBeInTheDocument();

    // Should still see remaining defaults
    expect(screen.getByText('Set Up')).toBeInTheDocument();
    expect(screen.getByText('Support')).toBeInTheDocument();
  });

  it('excludes removed routine IDs from display', () => {
    (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      featurePermissions: [
        {
          widgetType: 'catalyst',
          accessLevel: 'public',
          betaUsers: [],
          enabled: true,
          config: {
            removedRoutineIds: ['signal-silence'],
          },
        } as FeaturePermission,
      ],
    });

    // Active category 'Get Attention' contains 'Signal for Silence'
    render(
      <CatalystWidget
        widget={createWidget({
          activeCategory: 'Get Attention',
        })}
      />
    );

    // Should not see removed routine
    expect(screen.queryByText('Signal for Silence')).not.toBeInTheDocument();
  });

  it('renders category background image when imageUrl is a safe HTTPS URL', () => {
    const imageUrl = 'https://example.com/cat-bg.jpg';
    const categoriesWithImage: CatalystCategory[] = [
      {
        id: 'cat-img',
        label: 'Image Category',
        icon: 'Zap',
        color: 'bg-red-500',
        isCustom: true,
        imageUrl,
      },
    ];

    (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      featurePermissions: [
        {
          widgetType: 'catalyst',
          accessLevel: 'public',
          betaUsers: [],
          enabled: true,
          config: { customCategories: categoriesWithImage },
        } as FeaturePermission,
      ],
    });

    render(<CatalystWidget widget={createWidget()} />);

    // Label should be visible (rendered in the image overlay branch)
    expect(screen.getByText('Image Category')).toBeInTheDocument();

    // Background img should be present with the correct src
    const img = screen.getByAltText('Image Category');
    expect(img).toHaveAttribute('src', imageUrl);
  });

  it('falls back to icon/color when imageUrl is not a safe URL', () => {
    const categoriesWithBadImage: CatalystCategory[] = [
      {
        id: 'cat-bad',
        label: 'Bad Image Category',
        icon: 'Zap',
        color: 'bg-red-500',
        isCustom: true,
        imageUrl: 'http://insecure.example.com/cat.jpg', // HTTP, not HTTPS
      },
    ];

    (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      featurePermissions: [
        {
          widgetType: 'catalyst',
          accessLevel: 'public',
          betaUsers: [],
          enabled: true,
          config: { customCategories: categoriesWithBadImage },
        } as FeaturePermission,
      ],
    });

    render(<CatalystWidget widget={createWidget()} />);

    // Label should still be visible
    expect(screen.getByText('Bad Image Category')).toBeInTheDocument();

    // No background img should be rendered (falls back to icon branch)
    expect(screen.queryByAltText('Bad Image Category')).not.toBeInTheDocument();
  });

  it('combines removed IDs with custom overrides correctly', () => {
    const customCategories: CatalystCategory[] = [
      {
        id: 'cat1',
        label: 'Custom Cat 1',
        icon: 'Zap',
        color: 'bg-red-500',
        isCustom: true,
      },
    ];

    (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      featurePermissions: [
        {
          widgetType: 'catalyst',
          accessLevel: 'public',
          betaUsers: [],
          enabled: true,
          config: {
            customCategories,
            removedCategoryIds: ['Get Attention'],
          },
        } as FeaturePermission,
      ],
    });

    render(<CatalystWidget widget={createWidget()} />);

    // Should see custom category
    expect(screen.getByText('Custom Cat 1')).toBeInTheDocument();

    // Should not see removed default
    expect(screen.queryByText('Attention')).not.toBeInTheDocument();

    // Should see other defaults
    expect(screen.getByText('Engage')).toBeInTheDocument();
    expect(screen.getByText('Set Up')).toBeInTheDocument();
    expect(screen.getByText('Support')).toBeInTheDocument();
  });
});
