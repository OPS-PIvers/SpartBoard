import React from 'react';
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { SpecialistScheduleConfigurationModal } from './SpecialistScheduleConfigurationModal';
import type { Building } from '@/config/buildings';
import { getDoc, setDoc, type DocumentSnapshot } from 'firebase/firestore';

const snapshot = (overrides: Record<string, unknown>): DocumentSnapshot =>
  ({
    exists: () => false,
    data: () => undefined,
    ...overrides,
  }) as unknown as DocumentSnapshot;

// Minimal lucide-react stub — avoids loading the full icon bundle.
vi.mock('lucide-react', () => {
  function icon(name: string) {
    const Stub = (props: React.HTMLAttributes<HTMLSpanElement>) =>
      React.createElement('span', { 'data-icon': name, ...props });
    Stub.displayName = name;
    return Stub;
  }
  const mocks: Record<string, unknown> = {};
  return new Proxy(mocks, {
    get(target, prop) {
      if (prop === '__esModule') return true;
      if (prop === 'then') return undefined;
      if (typeof prop === 'string' && !(prop in target)) {
        target[prop] = icon(prop);
      }
      return target[prop as string];
    },
  });
});

// isAuthBypass:true (the default for every test but the load-path one below)
// short-circuits fetchConfig/handleSave so no Firestore network calls happen
// during render. A getter lets one test flip it to exercise the real load.
let mockIsAuthBypass = true;
vi.mock('@/config/firebase', () => ({
  db: {},
  get isAuthBypass() {
    return mockIsAuthBypass;
  },
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
}));
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: vi.fn() }),
}));

const mockUseAdminBuildings = vi.fn<() => Building[]>();
vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => mockUseAdminBuildings(),
}));

const building = (id: string): Building[] => [
  { id, name: 'Test Building', gradeLevels: ['k-2'], gradeLabel: 'K-2' },
];

describe('SpecialistScheduleConfigurationModal', () => {
  afterEach(() => {
    cleanup();
    mockIsAuthBypass = true;
    vi.mocked(getDoc).mockReset();
    vi.mocked(setDoc).mockReset();
  });

  it('seeds Schumann default specialist options for the canonical short building id', () => {
    mockUseAdminBuildings.mockReturnValue(building('schumann'));
    render(<SpecialistScheduleConfigurationModal isOpen onClose={vi.fn()} />);

    expect(screen.getByText('🎵 Music')).toBeInTheDocument();
    expect(screen.getByText('👟 PE')).toBeInTheDocument();
    expect(screen.getByText('🎨 Art')).toBeInTheDocument();
    expect(screen.getByText('🌐 Spanish')).toBeInTheDocument();
    expect(screen.getByText('📖 Media')).toBeInTheDocument();
    expect(screen.queryByText('No options added.')).not.toBeInTheDocument();
  });

  it('seeds Schumann default specialist options for the legacy long-form building id — the case a hardcoded-short-ID fix would NOT cover', () => {
    mockUseAdminBuildings.mockReturnValue(building('schumann-elementary'));
    render(<SpecialistScheduleConfigurationModal isOpen onClose={vi.fn()} />);

    expect(screen.getByText('🎵 Music')).toBeInTheDocument();
    expect(screen.queryByText('No options added.')).not.toBeInTheDocument();
  });

  it('seeds Intermediate default specialist options for the canonical short building id', () => {
    mockUseAdminBuildings.mockReturnValue(building('intermediate'));
    render(<SpecialistScheduleConfigurationModal isOpen onClose={vi.fn()} />);

    expect(screen.getByText('🎵 Music')).toBeInTheDocument();
    expect(screen.queryByText('No options added.')).not.toBeInTheDocument();
    // Media is Schumann-only — its absence is what distinguishes the Intermediate set from Schumann's.
    expect(screen.queryByText('📖 Media')).not.toBeInTheDocument();
  });

  it('seeds Intermediate default specialist options for the legacy long-form building id', () => {
    mockUseAdminBuildings.mockReturnValue(
      building('orono-intermediate-school')
    );
    render(<SpecialistScheduleConfigurationModal isOpen onClose={vi.fn()} />);

    expect(screen.getByText('🎵 Music')).toBeInTheDocument();
    expect(screen.queryByText('No options added.')).not.toBeInTheDocument();
    expect(screen.queryByText('📖 Media')).not.toBeInTheDocument();
  });

  it('does NOT seed any defaults for a building that is neither Schumann nor Intermediate', () => {
    mockUseAdminBuildings.mockReturnValue(building('some-other-building'));
    render(<SpecialistScheduleConfigurationModal isOpen onClose={vi.fn()} />);

    expect(screen.getByText('No options added.')).toBeInTheDocument();
  });

  it('finds a Firestore-saved buildingDefaults entry keyed by the canonical id when the org building record still resolves to the legacy raw id', async () => {
    // A real-world mismatch: the saved config was written (or normalized)
    // under the canonical short id, but useAdminBuildings() still resolves
    // this org's building doc to its legacy long-form id.
    mockIsAuthBypass = false;
    mockUseAdminBuildings.mockReturnValue(building('schumann-elementary'));
    vi.mocked(getDoc).mockResolvedValue(
      snapshot({
        exists: () => true,
        data: () => ({
          config: {
            buildingDefaults: {
              schumann: {
                cycleLength: 6,
                startDate: '2026-01-01',
                schoolDays: [],
                dayLabel: 'Day',
                customDayNames: {},
                blocks: [],
                specialistOptions: ['🔬 Science'],
              },
            },
          },
        }),
      })
    );

    render(<SpecialistScheduleConfigurationModal isOpen onClose={vi.fn()} />);

    expect(await screen.findByText('🔬 Science')).toBeInTheDocument();
    // If the lookup missed (raw-id bug), it would have fallen back to the
    // Schumann defaults instead of the saved custom option set.
    expect(screen.queryByText('🎵 Music')).not.toBeInTheDocument();
  });

  it('saves a new option under the canonical building id, not the legacy raw id', async () => {
    mockIsAuthBypass = false;
    mockUseAdminBuildings.mockReturnValue(building('schumann-elementary'));
    vi.mocked(getDoc).mockResolvedValue(snapshot({}));
    vi.mocked(setDoc).mockResolvedValue(undefined);

    render(<SpecialistScheduleConfigurationModal isOpen onClose={vi.fn()} />);
    await screen.findByText('🎵 Music');

    fireEvent.change(screen.getByPlaceholderText('e.g. 🎨 Art'), {
      target: { value: '🎭 Drama' },
    });
    fireEvent.keyDown(screen.getByPlaceholderText('e.g. 🎨 Art'), {
      key: 'Enter',
    });
    await screen.findByText('🎭 Drama');

    fireEvent.click(screen.getByText('Save Configuration'));
    await waitFor(() => expect(setDoc).toHaveBeenCalled());

    const [, payload] = vi.mocked(setDoc).mock.calls.at(-1) as unknown as [
      unknown,
      { config: { buildingDefaults: Record<string, unknown> } },
    ];
    expect(Object.keys(payload.config.buildingDefaults)).toEqual(['schumann']);
    expect(
      payload.config.buildingDefaults['schumann-elementary']
    ).toBeUndefined();
  });
});
