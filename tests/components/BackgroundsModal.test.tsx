import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const noop = vi.fn();

// Mock the hooks the modal depends on
vi.mock('@/hooks/useBackgrounds', () => ({
  useBackgrounds: () => ({
    presets: [
      {
        id: 'https://example.com/p1.jpg',
        url: 'https://example.com/p1.jpg',
        label: 'Forest',
        thumbnailUrl: 'https://example.com/p1-thumb.jpg',
        active: true,
        accessLevel: 'public',
        betaUsers: [],
        createdAt: 0,
        category: 'Nature',
        tags: ['calm'],
        featured: false,
      },
    ],
    colors: [],
    patterns: [],
    gradients: [],
  }),
}));

const setBackground = vi.fn();
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    activeDashboard: { id: 'd1', background: 'https://example.com/p1.jpg' },
    setBackground,
  }),
}));

const toggleFavoriteBackground = vi.fn().mockResolvedValue(undefined);
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    favoriteBackgrounds: [],
    recentBackgrounds: [],
    toggleFavoriteBackground,
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, opts?: { defaultValue?: string }) =>
      opts?.defaultValue ?? _k,
  }),
}));

// Mock Google Drive hooks used by BackgroundsUploadsPanel
vi.mock('@/hooks/useGoogleDrive', () => ({
  useGoogleDrive: () => ({
    uploadBackgroundToDrive: vi.fn(),
    getUserBackgroundsFromDrive: vi.fn().mockResolvedValue([]),
    isInitialized: false,
  }),
}));

vi.mock('@/hooks/useDriveReconnected', () => ({
  useDriveReconnected: vi.fn(),
}));

import { BackgroundsModal } from '@/components/backgroundsModal/BackgroundsModal';

describe('BackgroundsModal', () => {
  beforeEach(() => {
    setBackground.mockClear();
    toggleFavoriteBackground.mockClear();
  });

  it('renders with rail sections', () => {
    render(<BackgroundsModal isOpen={true} onClose={noop} />);
    expect(screen.getByText('Favorites')).toBeInTheDocument();
    expect(screen.getByText('Recent')).toBeInTheDocument();
    expect(screen.getByText('Nature')).toBeInTheDocument();
  });

  it('selecting a category renders its items', async () => {
    render(<BackgroundsModal isOpen={true} onClose={noop} />);
    await userEvent.click(screen.getByText('Nature'));
    expect(screen.getByLabelText('Forest')).toBeInTheDocument();
  });

  it('clicking a thumbnail calls setBackground', async () => {
    render(<BackgroundsModal isOpen={true} onClose={noop} />);
    await userEvent.click(screen.getByText('Nature'));
    await userEvent.click(screen.getByLabelText('Forest'));
    expect(setBackground).toHaveBeenCalledWith('https://example.com/p1.jpg');
  });
});
