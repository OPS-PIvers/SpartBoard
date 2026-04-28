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
  disconnectGoogleDrive: () => {
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
  updateAccountPreferences: async () => {
    /* mock */
  },
  orgId: null,
  roleId: null,
  isStudentRole: false,
  buildingIds: [],
  orgBuildings: [],
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
