import '@testing-library/jest-dom/vitest';
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  render,
  screen,
  fireEvent,
  act,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmbedWidget } from './index';
import { WidgetData, EmbedGlobalConfig } from '@/types';
import {
  vi,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  onTestFinished,
} from 'vitest';
import '@testing-library/jest-dom';
import * as aiModule from '@/utils/ai';
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
    },
    googleAccessToken: 'test-token',
    loading: false,
    isAdmin: false,
    userRoles: null,
    appSettings: null,
    featurePermissions: [],
    featurePermissionsLoaded: true,
    globalPermissions: [],
    globalPermissionsLoaded: true,
    updateAppSettings: vi.fn(),
    canAccessWidget: vi.fn(() => true),
    canAccessFeature: vi.fn(() => true),
    userTier: 'free' as const,
    getAssignmentMode: vi.fn(() => 'submissions' as const),
    canSeeShareTracking: vi.fn(() => false),
    canAccessQuizMediaResponse: vi.fn(() => false),
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
    selectedBuildings: ['schumann-elementary'],
    userGradeLevels: [],
    setSelectedBuildings: vi.fn(),
    gradesTaught: null,
    subjectsTaught: [],
    effectiveGrades: [],
    buildingGrades: [],
    updateTeachingProfile: vi.fn(),
    language: 'en',
    setLanguage: vi.fn(),
    refreshGoogleToken: vi.fn(),
    connectGoogleDrive: vi.fn(),
    offlineGrantMissing: false,
    offlineGrantPresent: false,
    captureOfflineGrant: vi.fn().mockResolvedValue(false),
    ensureGoogleScope: vi.fn().mockResolvedValue(null),
    disconnectGoogleDrive: vi.fn(),
    savedWidgetConfigs: {},
    saveWidgetConfig: vi.fn(),
    saveWidgetDefault: vi.fn(),
    savedWidgetPresets: {},
    saveWidgetPreset: vi.fn(),
    customMaterials: [],
    saveCustomMaterials: vi.fn(),
    materialsPreferences: {},
    saveMaterialsPreferences: vi.fn(),
    penColors: null,
    savePenColors: vi.fn(),
    profileLoaded: true,
    setupCompleted: true,
    completeSetup: vi.fn(),
    disableCloseConfirmation: false,
    remoteControlEnabled: true,
    dockPosition: 'bottom',
    settingsDrawerWidth: 400,
    updateUserPreference: vi.fn(),
    quizMonitorColorsEnabled: true,
    quizMonitorScoreDisplay: 'percent',
    quizGraderMode: 'question',
    quizGraderAutoAdvance: true,
    rubricLevelOrder: 'high-first',
    spartyEnabled: true,
    alignmentGuidesEnabled: false,
    spellCheckEnabled: true,
    updateAccountPreferences: vi.fn(),
    lastActiveCollectionId: undefined,
    lastBoardIdByCollection: undefined,
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

const mockCanvasState = {
  zoom: 1,
  activeDashboard: null as { settings?: { spotlightWidgetId?: string } } | null,
};

vi.mock('@/context/dashboardCanvasStore', () => ({
  useDashboardActions: () => mockDashboardContext,
  useDashboardCanvasSelector: <T,>(sel: (s: typeof mockCanvasState) => T) =>
    sel(mockCanvasState),
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
    },
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
      },
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
      },
    };
    render(<EmbedWidget widget={vidsWidget} />);
    const iframe = screen.getByTitle('Embed Content');
    expect(iframe.getAttribute('sandbox')).toContain('allow-same-origin');
  });

  it('keeps allow-popups unless Block new tabs is on', () => {
    render(<EmbedWidget widget={baseWidget} />);
    expect(
      screen.getByTitle('Embed Content').getAttribute('sandbox')
    ).toContain('allow-popups');
  });

  it('drops allow-popups when Block new tabs is on', () => {
    const slidesWidget: WidgetData = {
      ...baseWidget,
      config: {
        ...baseWidget.config,
        url: 'https://docs.google.com/presentation/d/preso-id/edit',
        blockNewTabs: true,
      },
    };
    render(<EmbedWidget widget={slidesWidget} />);
    const sandbox =
      screen.getByTitle('Embed Content').getAttribute('sandbox') ?? '';
    expect(sandbox).not.toContain('allow-popups');
    expect(sandbox).toContain('allow-same-origin');
  });

  it('reloads the frame with the new sandbox when Block new tabs flips', () => {
    const { rerender } = render(<EmbedWidget widget={baseWidget} />);
    const before = screen.getByTitle('Embed Content');
    rerender(
      <EmbedWidget
        widget={{
          ...baseWidget,
          config: { ...baseWidget.config, blockNewTabs: true },
        }}
      />
    );
    const after = screen.getByTitle('Embed Content');
    expect(after).not.toBe(before);
    expect(after.getAttribute('sandbox')).not.toContain('allow-popups');
  });

  it('drops allow-popups from custom code when Block new tabs is on', () => {
    render(
      <EmbedWidget
        widget={{
          ...baseWidget,
          config: { mode: 'code', html: '<p>x</p>', blockNewTabs: true },
        }}
      />
    );
    expect(screen.getByTitle('Embed Content').getAttribute('sandbox')).toBe(
      'allow-scripts allow-forms'
    );
  });

  it('ignores Block new tabs when its preview flag is off', () => {
    const original = vi.mocked(useAuth).getMockImplementation();
    const auth = vi.mocked(useAuth)();
    vi.mocked(useAuth).mockImplementation(() => ({
      ...auth,
      canAccessFeature: (id: string) => id !== 'embed-block-new-tabs',
    }));
    onTestFinished(() => {
      if (original) vi.mocked(useAuth).mockImplementation(original);
    });
    render(
      <EmbedWidget
        widget={{
          ...baseWidget,
          config: { ...baseWidget.config, blockNewTabs: true },
        }}
      />
    );
    expect(
      screen.getByTitle('Embed Content').getAttribute('sandbox')
    ).toContain('allow-popups');
  });

  it('renders an iframe with srcDoc in code mode', () => {
    const codeWidget: WidgetData = {
      ...baseWidget,
      config: {
        mode: 'code',
        html: '<h1>Hello World</h1>',
      },
    };
    render(<EmbedWidget widget={codeWidget} />);
    const iframe = screen.getByTitle('Embed Content');
    expect(iframe).toHaveAttribute('srcDoc', '<h1>Hello World</h1>');
    expect(iframe.getAttribute('sandbox')).toBe(
      'allow-scripts allow-forms allow-popups'
    );
  });

  it('keeps code mode sandboxed when the URL field is hidden on a saved URL widget', async () => {
    const { useEmbedConfig } = await import('./hooks/useEmbedConfig');
    vi.mocked(useEmbedConfig).mockReturnValueOnce({
      config: {
        buildingId: 'schumann-elementary',
        hideUrlField: true,
        whitelistUrls: [],
      },
      isLoading: false,
    });
    const hiddenUrlWidget: WidgetData = {
      ...baseWidget,
      config: {
        mode: 'url',
        url: 'https://drive.google.com/file/d/abc456/view',
        html: '<h1>Hello World</h1>',
      },
    };
    render(<EmbedWidget widget={hiddenUrlWidget} />);
    const iframe = screen.getByTitle('Embed Content');
    expect(iframe).toHaveAttribute('srcDoc', '<h1>Hello World</h1>');
    expect(iframe.getAttribute('sandbox')).not.toContain('allow-same-origin');
  });

  it('increments refreshKey and re-renders iframe periodically', () => {
    const refreshWidget: WidgetData = {
      ...baseWidget,
      config: {
        ...baseWidget.config,
        refreshInterval: 1, // 1 minute
      },
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

  it('reloads only the iframe when the Reload button is clicked', () => {
    const { container } = renderEmbedWidget(baseWidget);
    const iframeBefore = container.querySelector('iframe');

    fireEvent.click(
      screen.getByRole('button', { name: /reload embedded content/i })
    );

    const iframeAfter = container.querySelector('iframe');
    expect(iframeAfter).toBeInTheDocument();
    expect(iframeAfter).not.toBe(iframeBefore);
    expect(iframeAfter).toHaveAttribute('src', 'https://example.com');
    expect(mockUpdateWidget).not.toHaveBeenCalled();
  });

  describe('zoom on video players', () => {
    it('applies zoom to a web page', () => {
      renderEmbedWidget({
        ...baseWidget,
        config: { mode: 'url', url: 'https://example.com', zoom: 2 },
      });
      expect(screen.getByTitle('Embed Content').style.transform).toBe(
        'scale(2)'
      );
      expect(
        screen.getByRole('button', { name: 'Zoom in' })
      ).toBeInTheDocument();
    });

    it('shows a saved-zoom YouTube video at its real size with no zoom buttons', () => {
      renderEmbedWidget({
        ...baseWidget,
        config: {
          mode: 'url',
          url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
          zoom: 2,
        },
      });
      const iframe = screen.getByTitle('Embed Content');
      expect(iframe.style.transform).toBe('scale(1)');
      expect(iframe.style.width).toBe('100%');
      expect(
        screen.queryByRole('button', { name: 'Zoom in' })
      ).not.toBeInTheDocument();
    });

    it('draws a video at screen size when the board is zoomed in', () => {
      mockCanvasState.zoom = 2;
      onTestFinished(() => {
        mockCanvasState.zoom = 1;
      });
      const ytConfig = {
        mode: 'url',
        url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
      };
      const { unmount } = renderEmbedWidget({
        ...baseWidget,
        config: ytConfig,
      });
      const iframe = screen.getByTitle('Embed Content');
      expect(iframe.style.transform).toBe('scale(0.5)');
      expect(iframe.style.width).toBe('200%');
      unmount();

      renderEmbedWidget({ ...baseWidget, maximized: true, config: ytConfig });
      expect(screen.getByTitle('Embed Content').style.transform).toBe(
        'scale(1)'
      );
    });

    it('leaves web pages to the board zoom', () => {
      mockCanvasState.zoom = 2;
      onTestFinished(() => {
        mockCanvasState.zoom = 1;
      });
      renderEmbedWidget(baseWidget);
      expect(screen.getByTitle('Embed Content').style.transform).toBe(
        'scale(1)'
      );
    });

    it('treats pasted YouTube embed code as a video', () => {
      renderEmbedWidget({
        ...baseWidget,
        config: {
          mode: 'code',
          url: '',
          html: '<iframe width="560" height="315" src="https://www.youtube.com/embed/aqz-KE-bpKQ"></iframe>',
          zoom: 1.5,
        },
      });
      expect(screen.getByTitle('Embed Content').style.transform).toBe(
        'scale(1)'
      );
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
        },
        googleAccessToken: 'test-token',
        loading: false,
        isAdmin: false,
        userRoles: null,
        appSettings: null,
        featurePermissions: [],
        featurePermissionsLoaded: true,
        globalPermissions: [],
        globalPermissionsLoaded: true,
        updateAppSettings: vi.fn(),
        canAccessWidget: vi.fn(() => true),
        canAccessFeature: vi.fn(() => false),
        userTier: 'free' as const,
        hasOrg: false,
        isExternalUser: false,
        getAssignmentMode: vi.fn(() => 'submissions' as const),
        canSeeShareTracking: vi.fn(() => false),
        canAccessQuizMediaResponse: vi.fn(() => false),
        signInWithGoogle: vi.fn(),
        signOut: vi.fn(),
        selectedBuildings: ['schumann-elementary'],
        userGradeLevels: [],
        setSelectedBuildings: vi.fn(),
        gradesTaught: null,
        subjectsTaught: [],
        effectiveGrades: [],
        buildingGrades: [],
        updateTeachingProfile: vi.fn(),
        language: 'en',
        setLanguage: vi.fn(),
        refreshGoogleToken: vi.fn(),
        connectGoogleDrive: vi.fn(),
        offlineGrantMissing: false,
        offlineGrantPresent: false,
        captureOfflineGrant: vi.fn().mockResolvedValue(false),
        ensureGoogleScope: vi.fn().mockResolvedValue(null),
        disconnectGoogleDrive: vi.fn(),
        savedWidgetConfigs: {},
        saveWidgetConfig: vi.fn(),
        saveWidgetDefault: vi.fn(),
        savedWidgetPresets: {},
        saveWidgetPreset: vi.fn(),
        customMaterials: [],
        saveCustomMaterials: vi.fn(),
        materialsPreferences: {},
        saveMaterialsPreferences: vi.fn(),
        penColors: null,
        savePenColors: vi.fn(),
        profileLoaded: true,
        setupCompleted: true,
        completeSetup: vi.fn(),
        disableCloseConfirmation: false,
        remoteControlEnabled: true,
        dockPosition: 'bottom',
        settingsDrawerWidth: 400,
        updateUserPreference: vi.fn(),
        quizMonitorColorsEnabled: true,
        quizMonitorScoreDisplay: 'percent',
        quizGraderMode: 'question',
        quizGraderAutoAdvance: true,
        rubricLevelOrder: 'high-first',
        spartyEnabled: true,
        alignmentGuidesEnabled: false,
        spellCheckEnabled: true,
        updateAccountPreferences: vi.fn(),
        lastActiveCollectionId: undefined,
        lastBoardIdByCollection: undefined,
        orgId: null,
        roleId: null,
        isStudentRole: false,
        accessDeactivated: false,
        roleUnconfirmed: false,
        roleResolved: true,
        buildingIds: [],
        orgBuildings: [],
        orgBuildingsLoaded: true,
        favoriteBackgrounds: [],
        recentBackgrounds: [],
        toggleFavoriteBackground: vi.fn(),
        recordRecentBackground: vi.fn(),
      });

      render(<EmbedWidget widget={validWidget} />);
      const btn = screen.queryByRole('button', {
        name: /generate interactive mini app/i,
      });
      expect(btn).not.toBeInTheDocument();
    });
  });
});
