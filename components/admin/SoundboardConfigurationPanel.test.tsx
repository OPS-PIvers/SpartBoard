import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, beforeEach, afterAll, vi } from 'vitest';
import { SoundboardConfigurationPanel } from './SoundboardConfigurationPanel';
import { SoundboardGlobalConfig } from '@/types';
import { SOUND_LIBRARY } from '@/config/soundLibrary';
import { BUILDINGS } from '@/config/buildings';

const mockPlay = vi
  .fn<() => Promise<void>>()
  .mockResolvedValue(undefined as unknown as void);

const mockPause = vi.fn<() => void>();
const mockAudioConstructor = vi.fn<(src?: string) => void>();

vi.stubGlobal(
  'Audio',
  class {
    constructor(src?: string) {
      mockAudioConstructor(src);
    }

    play(): Promise<void> {
      return mockPlay();
    }

    pause(): void {
      mockPause();
    }
  }
);

describe('SoundboardConfigurationPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it('normalizes Google Drive share links before test playback', () => {
    const config: SoundboardGlobalConfig = {
      customLibrarySounds: [
        {
          id: 'drive-sound-1',
          label: 'Drive Chime',
          url: 'https://drive.google.com/file/d/1EjE5Dnmrx2H8um03srzcoMm1LCdtO8Xp/view?usp=sharing',
          color: '#6366f1',
        },
      ],
      buildingDefaults: {
        'schumann-elementary': {
          availableSounds: [],
          enabledLibrarySoundIds: [],
          enabledCustomSoundIds: ['drive-sound-1'],
        },
      },
    };

    render(<SoundboardConfigurationPanel config={config} onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /test/i }));

    expect(mockAudioConstructor).toHaveBeenCalledWith(
      'https://drive.google.com/uc?id=1EjE5Dnmrx2H8um03srzcoMm1LCdtO8Xp&export=download'
    );
    expect(mockPlay).toHaveBeenCalled();
  });

  it('toggles a library sound across all buildings in a single onChange call', () => {
    const handleChange = vi.fn();
    const targetSoundId = SOUND_LIBRARY[0].id;

    const config: SoundboardGlobalConfig = {
      customLibrarySounds: [],
      buildingDefaults: {},
    };

    render(
      <SoundboardConfigurationPanel config={config} onChange={handleChange} />
    );

    // Click the first "All" button (one per library sound)
    const allButtons = screen.getAllByRole('button', { name: 'All' });
    fireEvent.click(allButtons[0]);

    // Must be called exactly once — not once per building
    expect(handleChange).toHaveBeenCalledTimes(1);

    // Every building must have the sound enabled
    const nextConfig = handleChange.mock.calls[0][0] as SoundboardGlobalConfig;
    BUILDINGS.forEach((building) => {
      expect(
        nextConfig.buildingDefaults?.[building.id]?.enabledLibrarySoundIds
      ).toContain(targetSoundId);
    });
  });
});
