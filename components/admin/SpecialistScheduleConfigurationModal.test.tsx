import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { SpecialistScheduleConfigurationModal } from './SpecialistScheduleConfigurationModal';

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

// Post-migration, useAdminBuildings() resolves canonical short IDs, not legacy long-form ones.
vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => [
    {
      id: 'schumann',
      name: 'Schumann Elementary',
      gradeLevels: ['k-2'],
      gradeLabel: 'K-2',
    },
    {
      id: 'intermediate',
      name: 'Orono Intermediate',
      gradeLevels: ['3-5'],
      gradeLabel: '3-5',
    },
  ],
}));

describe('SpecialistScheduleConfigurationModal', () => {
  afterEach(() => {
    cleanup();
  });

  it('seeds Schumann default specialist options for the canonical short building id', () => {
    render(<SpecialistScheduleConfigurationModal isOpen onClose={vi.fn()} />);

    expect(screen.getByText('🎵 Music')).toBeInTheDocument();
    expect(screen.getByText('👟 PE')).toBeInTheDocument();
    expect(screen.getByText('🎨 Art')).toBeInTheDocument();
    expect(screen.getByText('🌐 Spanish')).toBeInTheDocument();
    expect(screen.getByText('📖 Media')).toBeInTheDocument();
    expect(screen.queryByText('No options added.')).not.toBeInTheDocument();
  });
});
