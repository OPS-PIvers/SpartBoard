import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { FeaturePermission } from '@/types';

// Regression guard: symbol.buildings loaded from Firestore may still hold a
// legacy long-form building id (e.g. "orono-high-school") from before the
// Organization Buildings panel switched to short canonical ids ("high").
// Comparing it directly against useAdminBuildings()'s canonical building.id
// means a legacy entry never matches, so re-toggling a legacy-assigned
// building adds a duplicate canonical id instead of removing it.

// Hoisted, referentially-stable mock values: an inline factory returning a
// fresh object/array per render would change a useCallback/useEffect
// dependency on every commit and spin it into an infinite re-render loop
// (see AnnouncementsWidget.labels.test.tsx for the same guard).
const mockAddToast = vi.fn();
const mockStorage = {
  uploadAdminWorkSymbol: vi.fn(),
  deleteFile: vi.fn(),
};
// More than one building so the per-symbol building-toggle UI renders.
const mockBuildings = [
  { id: 'high', name: 'Orono High School', gradeLabel: '9-12' },
  { id: 'middle', name: 'Orono Middle School', gradeLabel: '6-8' },
];

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: mockAddToast }),
}));

vi.mock('@/hooks/useStorage', () => ({
  useStorage: () => mockStorage,
}));

vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => mockBuildings,
}));

vi.mock('@/hooks/useBuildingSelection', () => ({
  useBuildingSelection: () => ['high', vi.fn()],
}));

import { WorkSymbolsConfigurationModal } from '@/components/admin/WorkSymbolsConfigurationModal';

const permission: FeaturePermission = {
  widgetType: 'work-symbols',
  accessLevel: 'public',
  betaUsers: [],
  enabled: true,
  config: {
    symbols: [
      {
        id: 'sym1',
        title: 'Legacy Assigned Symbol',
        imageUrl: 'https://example.com/sym.png',
        // Stored before the short-id migration — should resolve to canonical "high".
        buildings: ['orono-high-school'],
      },
    ],
    buildingDefaults: {},
  },
};

describe('WorkSymbolsConfigurationModal — building id canonicalization', () => {
  it('shows a legacy-id-assigned building as explicitly assigned', () => {
    render(
      <WorkSymbolsConfigurationModal
        isOpen
        onClose={vi.fn()}
        permission={permission}
        onSave={vi.fn()}
      />
    );

    const highSchoolButton = screen.getByRole('button', {
      name: 'Orono High School',
    });
    expect(highSchoolButton.className).toContain('bg-violet-500');
    expect(highSchoolButton).toHaveAttribute(
      'title',
      'Click to remove from this building'
    );
  });

  it('fully unassigns a legacy-id building on toggle instead of adding a duplicate canonical id', () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <WorkSymbolsConfigurationModal
        isOpen
        onClose={vi.fn()}
        permission={permission}
        onSave={onSave}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Orono High School' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalled();
    const [{ config }] = onSave.mock.calls[0] as [
      { config: { symbols: { buildings: string[] }[] } },
    ];
    expect(config.symbols[0].buildings).toEqual([]);
  });
});
