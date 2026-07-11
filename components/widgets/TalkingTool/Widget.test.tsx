import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TalkingToolWidget } from './Widget';
import { WidgetData, FeaturePermission } from '@/types';
import { useAuth } from '@/context/useAuth';
import { AuthContextType } from '@/context/AuthContextValue';

// Mock useAuth
vi.mock('@/context/useAuth', () => ({
  useAuth: vi.fn(),
}));

const mockWidget: WidgetData = {
  id: 'test-widget',
  type: 'talking-tool',
  x: 0,
  y: 0,
  w: 500,
  h: 450,
  z: 1,
  flipped: false,
  config: {},
};

const mockAuthContext = (
  overrides: Partial<AuthContextType> = {}
): AuthContextType => ({
  user: null,
  googleAccessToken: null,
  loading: false,
  isAdmin: false,
  userRoles: null,
  appSettings: null,
  featurePermissions: [],
  globalPermissions: [],
  updateAppSettings: () => Promise.resolve(),
  canAccessWidget: () => true,
  canAccessFeature: () => true,
  userTier: 'free',
  getAssignmentMode: () => 'submissions',
  canSeeShareTracking: () => false,
  signInWithGoogle: async () => {
    /* mock */
  },
  signOut: async () => {
    /* mock */
  },
  selectedBuildings: [],
  userGradeLevels: [],
  setSelectedBuildings: async () => {
    /* mock */
  },
  language: 'en',
  setLanguage: async () => {
    /* mock */
  },
  refreshGoogleToken: () => Promise.resolve(null),
  connectGoogleDrive: () => Promise.resolve(),
  ensureGoogleScope: () => Promise.resolve(null),
  disconnectGoogleDrive: async () => {
    /* mock */
  },
  savedWidgetConfigs: {},
  saveWidgetConfig: () => {
    /* mock */
  },
  profileLoaded: true,
  setupCompleted: true,
  completeSetup: async () => {
    /* mock */
  },
  disableCloseConfirmation: false,
  remoteControlEnabled: true,
  dockPosition: 'bottom',
  quizMonitorColorsEnabled: true,
  quizMonitorScoreDisplay: 'percent',
  updateAccountPreferences: async () => {
    /* mock */
  },
  lastActiveCollectionId: undefined,
  lastBoardIdByCollection: undefined,
  orgId: null,
  roleId: null,
  isStudentRole: false,
  accessDeactivated: false,
  roleResolved: true,
  buildingIds: [],
  orgBuildings: [],
  orgBuildingsLoaded: true,
  hasOrg: false,
  isExternalUser: false,
  favoriteBackgrounds: [],
  recentBackgrounds: [],
  toggleFavoriteBackground: async () => {
    /* mock */
  },
  recordRecentBackground: async () => {
    /* mock */
  },
  ...overrides,
});

describe('TalkingToolWidget', () => {
  it('renders correctly and defaults to "Listen Closely" tab', () => {
    vi.mocked(useAuth).mockReturnValue(mockAuthContext());

    render(<TalkingToolWidget widget={mockWidget} />);

    // Check if the title "Listen Closely" is visible in the main content
    expect(
      screen.getByText('Listen Closely', { selector: 'h3' })
    ).toBeInTheDocument();

    // Check if a specific stem from "Listen Closely" is visible
    expect(screen.getByText(/What do you mean by/)).toBeInTheDocument();
  });

  it('switches tabs when a sidebar button is clicked', () => {
    vi.mocked(useAuth).mockReturnValue(mockAuthContext());

    render(<TalkingToolWidget widget={mockWidget} />);

    // Find and click the "Share What You Think" button in the sidebar
    const shareButton = screen.getByText('Share What You Think');
    fireEvent.click(shareButton);

    // Check if the title "Share What You Think" is now visible in the main content
    expect(
      screen.getByText('Share What You Think', { selector: 'h3' })
    ).toBeInTheDocument();

    // Check if a specific stem from "Share What You Think" is visible
    expect(
      screen.getByText(/I think ________ because ________./)
    ).toBeInTheDocument();
  });

  it('resyncs the active tab when the admin removes the currently selected category', () => {
    vi.mocked(useAuth).mockReturnValue(mockAuthContext());

    const { rerender } = render(<TalkingToolWidget widget={mockWidget} />);

    // Select the "Share What You Think" tab
    fireEvent.click(screen.getByText('Share What You Think'));
    expect(
      screen.getByText('Share What You Think', { selector: 'h3' })
    ).toBeInTheDocument();

    // Admin live-updates feature permissions, dropping the "share" category
    vi.mocked(useAuth).mockReturnValue(
      mockAuthContext({
        featurePermissions: [
          {
            widgetType: 'talking-tool',
            accessLevel: 'public',
            betaUsers: [],
            enabled: true,
            config: {
              categories: [
                {
                  id: 'listen',
                  label: 'Listen Closely',
                  color: '#008ab6',
                  icon: 'Ear',
                  stems: [{ id: 'l1', text: 'What do you mean by ________?' }],
                },
                {
                  id: 'support',
                  label: 'Support What You Say',
                  color: '#5aafd1',
                  icon: 'BookOpen',
                  stems: [{ id: 'su1', text: 'In the text, ________.' }],
                },
              ],
            },
          },
        ] as FeaturePermission[],
      })
    );
    rerender(<TalkingToolWidget widget={mockWidget} />);

    // Content falls back to the first remaining category
    expect(
      screen.getByText('Listen Closely', { selector: 'h3' })
    ).toBeInTheDocument();

    // The sidebar button for that same category must be the one highlighted as active
    const listenButton = screen
      .getByText('Listen Closely', {
        selector: 'span',
      })
      .closest('button');
    expect(listenButton).not.toBeNull();
    expect(listenButton?.style.backgroundColor).toBe('rgb(0, 138, 182)');
  });

  it('renders custom categories from global config', () => {
    vi.mocked(useAuth).mockReturnValue(
      mockAuthContext({
        featurePermissions: [
          {
            widgetType: 'talking-tool',
            accessLevel: 'public',
            betaUsers: [],
            enabled: true,
            config: {
              categories: [
                {
                  id: 'custom',
                  label: 'Custom Category',
                  color: '#ff0000',
                  icon: 'Star',
                  stems: [{ id: 'c1', text: 'Custom stem 1' }],
                },
              ],
            },
          },
        ] as FeaturePermission[],
      })
    );

    render(<TalkingToolWidget widget={mockWidget} />);

    expect(
      screen.getByText('Custom Category', { selector: 'h3' })
    ).toBeInTheDocument();
    expect(screen.getByText('Custom stem 1')).toBeInTheDocument();
  });
});
