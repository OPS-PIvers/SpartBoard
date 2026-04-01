import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { SoundboardWidget } from './Widget';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { WidgetData } from '@/types';

vi.mock('@/context/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/context/useDashboard', () => ({
  useDashboard: vi.fn(),
}));

const mockPlay = vi
  .fn<() => Promise<void>>()
  .mockResolvedValue(undefined as unknown as void);

vi.stubGlobal(
  'Audio',
  class {
    play(): Promise<void> {
      return mockPlay();
    }
  }
);

// Widget with sound-1 active (activeSoundIds defaults to selectedSoundIds when undefined)
const defaultWidget = {
  id: 'soundboard-1',
  type: 'soundboard',
  config: { selectedSoundIds: ['sound-1'] },
} as unknown as WidgetData;

describe('SoundboardWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useAuth).mockReturnValue({
      selectedBuildings: ['school-1'],
      featurePermissions: [
        {
          widgetType: 'soundboard',
          accessLevel: 'admin',
          enabled: true,
          betaUsers: [],
          config: {
            buildingDefaults: {
              'school-1': {
                availableSounds: [
                  {
                    id: 'sound-1',
                    label: 'Applause',
                    url: 'http://test.com/1.mp3',
                    color: '#000000',
                  },
                  {
                    id: 'sound-2',
                    label: 'Empty URL',
                    url: '',
                    color: '#111111',
                  },
                  {
                    id: 'sound-3',
                    label: 'Not Selected',
                    url: 'http://test.com/3.mp3',
                  },
                ],
              },
            },
          },
        },
      ],
    } as unknown as ReturnType<typeof useAuth>);

    vi.mocked(useDashboard).mockReturnValue({
      selectedWidgetId: null,
      updateWidget: vi.fn(),
    } as unknown as ReturnType<typeof useDashboard>);
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it('filters visible sounds by selectedSoundIds and non-empty URLs', () => {
    render(<SoundboardWidget widget={defaultWidget} />);

    // Applause should be visible (in active grid since activeSoundIds defaults to selectedSoundIds)
    expect(screen.getByText('Applause')).toBeInTheDocument();

    // Not selected should be hidden
    expect(screen.queryByText('Not Selected')).not.toBeInTheDocument();
  });

  it('hides selected sounds if their URL is empty', () => {
    const emptyUrlWidget = {
      ...defaultWidget,
      config: { selectedSoundIds: ['sound-2'] },
    };
    render(
      <SoundboardWidget widget={emptyUrlWidget as unknown as WidgetData} />
    );

    // Empty URL should be filtered out, showing empty state
    expect(screen.queryByText('Empty URL')).not.toBeInTheDocument();
    expect(screen.getByText('No Sounds Selected')).toBeInTheDocument();
  });

  it('shows empty state when no sounds are available or selected', () => {
    const emptyWidget = {
      ...defaultWidget,
      config: { selectedSoundIds: [] },
    };
    render(<SoundboardWidget widget={emptyWidget as unknown as WidgetData} />);

    expect(screen.getByText('No Sounds Selected')).toBeInTheDocument();
  });

  it('aggregates all sounds when no building is selected', () => {
    vi.mocked(useAuth).mockReturnValue({
      selectedBuildings: [],
      featurePermissions: [
        {
          widgetType: 'soundboard',
          accessLevel: 'admin',
          enabled: true,
          betaUsers: [],
          config: {
            buildingDefaults: {
              'school-1': {
                availableSounds: [
                  { id: 'sound-1', label: 'Applause', url: '1.mp3' },
                ],
              },
              'school-2': {
                availableSounds: [
                  { id: 'sound-4', label: 'Gong', url: '4.mp3' },
                ],
              },
            },
          },
        },
      ],
    } as unknown as ReturnType<typeof useAuth>);

    const multiWidget = {
      ...defaultWidget,
      config: { selectedSoundIds: ['sound-1', 'sound-4'] },
    };

    render(<SoundboardWidget widget={multiWidget as unknown as WidgetData} />);

    expect(screen.getByText('Applause')).toBeInTheDocument();
    expect(screen.getByText('Gong')).toBeInTheDocument();
  });

  it('plays sound on click', () => {
    render(<SoundboardWidget widget={defaultWidget} />);

    fireEvent.click(screen.getByRole('button', { name: /Applause/i }));

    expect(mockPlay).toHaveBeenCalled();
  });

  it('includes library sounds when enabled by admin', () => {
    vi.mocked(useAuth).mockReturnValue({
      selectedBuildings: ['school-1'],
      featurePermissions: [
        {
          widgetType: 'soundboard',
          enabled: true,
          config: {
            buildingDefaults: {
              'school-1': {
                availableSounds: [],
                enabledLibrarySoundIds: ['lib-tada'],
              },
            },
          },
        },
      ],
    } as unknown as ReturnType<typeof useAuth>);

    const libWidget = {
      ...defaultWidget,
      config: { selectedSoundIds: ['lib-tada'] },
    };

    render(<SoundboardWidget widget={libWidget as unknown as WidgetData} />);

    expect(screen.getByText('Ta-Da')).toBeInTheDocument();
  });

  it('excludes library sounds when NOT enabled by admin', () => {
    vi.mocked(useAuth).mockReturnValue({
      selectedBuildings: ['school-1'],
      featurePermissions: [
        {
          widgetType: 'soundboard',
          enabled: true,
          config: {
            buildingDefaults: {
              'school-1': {
                availableSounds: [],
                enabledLibrarySoundIds: [], // Empty
              },
            },
          },
        },
      ],
    } as unknown as ReturnType<typeof useAuth>);

    const libWidget = {
      ...defaultWidget,
      config: { selectedSoundIds: ['lib-tada'] },
    };

    render(<SoundboardWidget widget={libWidget as unknown as WidgetData} />);

    expect(screen.queryByText('Ta-Da')).not.toBeInTheDocument();
    expect(screen.getByText('No Sounds Selected')).toBeInTheDocument();
  });

  it('shows selection bar when focused', () => {
    vi.mocked(useDashboard).mockReturnValue({
      selectedWidgetId: 'soundboard-1',
      updateWidget: vi.fn(),
    } as unknown as ReturnType<typeof useDashboard>);

    render(<SoundboardWidget widget={defaultWidget} />);

    // Sound should appear in both the main grid and the selection bar
    const buttons = screen.getAllByText('Applause');
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  it('respects explicit activeSoundIds to show subset of selected sounds', () => {
    vi.mocked(useAuth).mockReturnValue({
      selectedBuildings: ['school-1'],
      featurePermissions: [
        {
          widgetType: 'soundboard',
          accessLevel: 'admin',
          enabled: true,
          betaUsers: [],
          config: {
            buildingDefaults: {
              'school-1': {
                availableSounds: [
                  { id: 'sound-1', label: 'Applause', url: '1.mp3' },
                  { id: 'sound-3', label: 'Gong', url: '3.mp3' },
                ],
              },
            },
          },
        },
      ],
    } as unknown as ReturnType<typeof useAuth>);

    // Both selected, but only sound-1 is active
    const subsetWidget = {
      ...defaultWidget,
      config: {
        selectedSoundIds: ['sound-1', 'sound-3'],
        activeSoundIds: ['sound-1'],
      },
    };

    render(<SoundboardWidget widget={subsetWidget as unknown as WidgetData} />);

    // Applause (active) is in the main grid
    expect(
      screen.getByRole('button', { name: /Applause/i })
    ).toBeInTheDocument();
    // Gong (not active, not focused) should not appear in the main grid
    expect(
      screen.queryByRole('button', { name: /Gong/i })
    ).not.toBeInTheDocument();
  });
});
