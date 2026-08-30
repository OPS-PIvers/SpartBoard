import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { SpecialistScheduleConfigurationModal } from './SpecialistScheduleConfigurationModal';
import type { Building } from '@/config/buildings';

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

// isAuthBypass:true short-circuits fetchConfig/handleSave so no Firestore
// network calls happen during render.
vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: true }));
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
});
