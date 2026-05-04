/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  render,
  screen,
  fireEvent,
  act,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmbedWidget, EmbedSettings } from './index';
import { WidgetData, EmbedConfig, EmbedGlobalConfig } from '@/types';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { User } from 'firebase/auth';
import '@testing-library/jest-dom';
import * as aiModule from '@/utils/ai';
import { useEmbedConfig } from './hooks/useEmbedConfig';
import { useAuth } from '@/context/useAuth';

vi.mock('@/context/useAuth', () => ({
  useAuth: vi.fn(() => ({
    user: {
      uid: 'test-uid',
      displayName: 'Test User',
      email: 'test@example.com',
      getIdToken: vi.fn(),
      getIdTokenResult: vi.fn(),
      reload: vi.fn(),
      toJSON: vi.fn(),
      delete: vi.fn(),
      emailVerified: true,
      isAnonymous: false,
      metadata: {},
      phoneNumber: null,
      photoURL: null,
      providerData: [],
      providerId: 'firebase',
      refreshToken: 'test-refresh-token',
      tenantId: null,
    } as unknown as User,
    googleAccessToken: 'test-token',
    loading: false,
    isAdmin: false,
    userRoles: null,
    appSettings: null,
    featurePermissions: [],
    globalPermissions: [],
    updateAppSettings: vi.fn(),
    canAccessWidget: vi.fn(() => true),
    canAccessFeature: vi.fn(() => true),
    getAssignmentMode: vi.fn(() => 'submissions' as const),
    canSeeShareTracking: vi.fn(() => false),
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
    selectedBuildings: ['schumann-elementary'],
    userGradeLevels: [],
    setSelectedBuildings: vi.fn(),
    language: 'en',
    setLanguage: vi.fn(),
    refreshGoogleToken: vi.fn(),
    connectGoogleDrive: vi.fn(),
    disconnectGoogleDrive: vi.fn(),
    savedWidgetConfigs: {},
    saveWidgetConfig: vi.fn(),
    profileLoaded: true,
    setupCompleted: true,
    completeSetup: vi.fn(),
    disableCloseConfirmation: false,
    remoteControlEnabled: true,
    dockPosition: 'bottom',
    quizMonitorColorsEnabled: true,
    quizMonitorScoreDisplay: 'percent',
    updateAccountPreferences: vi.fn(),
  })),
}));

const mockSubscribe = vi.fn(
  (
    _type: string,
    callback: (perm: { config: EmbedGlobalConfig } | null) => void
  ) => {
    callback({
      config: {
        buildingDefaults: {
          'schumann-elementary': {
            buildingId: 'schumann-elementary',
            hideUrlField: false,
            whitelistUrls: ['example.org'],
          },
        },
      },
    });
    return () => undefined;
  }
);

vi.mock('@/hooks/useFeaturePermissions', () => ({
  useFeaturePermissions: () => ({
    subscribeToPermission: mockSubscribe,
    loading: false,
  }),
}));

vi.mock('./hooks/useEmbedConfig', () => ({
  useEmbedConfig: vi.fn(() => ({
    config: {
      buildingId: 'schumann-elementary',
      hideUrlField: false,
      whitelistUrls: [],
    },
    isLoading: false,
  })),
}));

// Mock dependencies
const mockUpdateWidget = vi.fn();
const mockAddWidget = vi.fn();
const mockAddToast = vi.fn();

const mockDashboardContext = {
  updateWidget: mockUpdateWidget,
  addWidget: mockAddWidget,
  addToast: mockAddToast,
};

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => mockDashboardContext,
}));

vi.mock('@/utils/ai', () => ({
  generateMiniAppCode: vi.fn(),
}));

// The toolbar (zoom + mini-app + open-in-new-tab) now renders via createPortal,
// anchored to the nearest `[data-widget-id]` ancestor. Production provides this
// via DraggableWindow; tests must provide it explicitly. The toolbar only
// becomes interactive while the widget is hovered, so we fire a pointerEnter
// on the wrapper so the portaled buttons are clickable in tests.
const renderEmbedWidget = (widget: WidgetData) => {
  const utils = render(
    <div data-testid={`widget-wrapper-${widget.id}`} data-widget-id={widget.id}>
      <EmbedWidget widget={widget} />
    </div>
  );
  const wrapper = utils.getByTestId(`widget-wrapper-${widget.id}`);
  fireEvent.pointerEnter(wrapper);
  return utils;
};

describe('EmbedWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
      // Mock useEmbedConfig specifically for this test
      vi.mocked(useEmbedConfig).mockReturnValue({
        config: {
          buildingId: 'schumann-elementary',
          hideUrlField: false,
          whitelistUrls: [],
        },
        isLoading: false,
      });

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

  describe('Mini App Generation', () => {
    const validWidget: WidgetData = {
      ...baseWidget,
      config: {
        mode: 'url',
        url: 'https://example.com',
        isEmbeddable: true,
      },
    };

    it('renders the generate mini app button', () => {
      renderEmbedWidget(validWidget);
      const btn = screen.getByRole('button', {
        name: /generate interactive mini app/i,
      });
      expect(btn).toBeInTheDocument();
      expect(btn).not.toBeDisabled();
    });

    it('calls addWidget on successful generation', async () => {
      vi.useRealTimers();
      const user = userEvent.setup({ delay: null });
      const mockResult = {
        title: 'Generated App',
        html: '<div>App</div>',
      };
      vi.mocked(aiModule.generateMiniAppCode).mockResolvedValueOnce(mockResult);

      renderEmbedWidget(validWidget);
      const btn = screen.getByRole('button', {
        name: /generate interactive mini app/i,
      });

      await user.click(btn);

      // Verify loading toast
      expect(mockAddToast).toHaveBeenCalledWith(
        'Analyzing content and generating Mini App...',
        'info'
      );

      // Verify ai call
      expect(aiModule.generateMiniAppCode).toHaveBeenCalledWith(
        'Create an interactive educational mini app based on this content/resource: https://example.com'
      );

      // Wait for async operations to complete
      await waitFor(() => {
        expect(mockAddWidget).toHaveBeenCalledWith(
          'miniApp',
          expect.objectContaining({
            x: 24, // 0 (x) + 4 (w) + 20 (NEW_WIDGET_SPACING)
            y: 0,
            config: expect.objectContaining({
              activeAppUnsaved: true,
              activeApp: expect.objectContaining({
                title: 'Generated App',
                html: '<div>App</div>',
              }),
            }),
          })
        );
      });

      expect(mockAddToast).toHaveBeenCalledWith(
        'Mini App generated successfully!',
        'success'
      );
    });

    it('shows error toast on failed generation', async () => {
      vi.useRealTimers();
      const user = userEvent.setup({ delay: null });
      vi.mocked(aiModule.generateMiniAppCode).mockRejectedValueOnce(
        new Error('AI failed')
      );

      renderEmbedWidget(validWidget);
      const btn = screen.getByRole('button', {
        name: /generate interactive mini app/i,
      });

      await user.click(btn);

      await waitFor(() => {
        expect(mockAddToast).toHaveBeenCalledWith('AI failed', 'error');
      });

      expect(mockAddWidget).not.toHaveBeenCalled();
    });

    it('does not render the generate button if feature is inaccessible', () => {
      vi.mocked(useAuth).mockReturnValueOnce({
        user: {
          uid: 'test-uid',
          displayName: 'Test User',
          email: 'test@example.com',
          getIdToken: vi.fn(),
          getIdTokenResult: vi.fn(),
          reload: vi.fn(),
          toJSON: vi.fn(),
          delete: vi.fn(),
          emailVerified: true,
          isAnonymous: false,
          metadata: {},
          phoneNumber: null,
          photoURL: null,
          providerData: [],
          providerId: 'firebase',
          refreshToken: 'test-refresh-token',
          tenantId: null,
        } as unknown as User,
        googleAccessToken: 'test-token',
        loading: false,
        isAdmin: false,
        userRoles: null,
        appSettings: null,
        featurePermissions: [],
        globalPermissions: [],
        updateAppSettings: vi.fn(),
        canAccessWidget: vi.fn(() => true),
        canAccessFeature: vi.fn(() => false),
        getAssignmentMode: vi.fn(() => 'submissions' as const),
        canSeeShareTracking: vi.fn(() => false),
        signInWithGoogle: vi.fn(),
        signOut: vi.fn(),
        selectedBuildings: ['schumann-elementary'],
        userGradeLevels: [],
        setSelectedBuildings: vi.fn(),
        language: 'en',
        setLanguage: vi.fn(),
        refreshGoogleToken: vi.fn(),
        connectGoogleDrive: vi.fn(),
        disconnectGoogleDrive: vi.fn(),
        savedWidgetConfigs: {},
        saveWidgetConfig: vi.fn(),
        profileLoaded: true,
        setupCompleted: true,
        completeSetup: vi.fn(),
        disableCloseConfirmation: false,
        remoteControlEnabled: true,
        dockPosition: 'bottom',
        quizMonitorColorsEnabled: true,
        quizMonitorScoreDisplay: 'percent',
        updateAccountPreferences: vi.fn(),
        orgId: null,
        roleId: null,
        isStudentRole: false,
        roleResolved: true,
        buildingIds: [],
        orgBuildings: [],
      });

      render(<EmbedWidget widget={validWidget} />);
      const btn = screen.queryByRole('button', {
        name: /generate interactive mini app/i,
      });
      expect(btn).not.toBeInTheDocument();
    });
  });
});
