// Pins the "Active" Toggle's accessible name; without a label prop the
// switch is unnamed for screen readers.

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { BackgroundPreset } from '@/types';

vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => [],
}));

import { GridPresetCard } from '@/components/admin/BackgroundManager/GridPresetCard';

afterEach(cleanup);

function buildPreset(
  overrides: Partial<BackgroundPreset> = {}
): BackgroundPreset {
  return {
    id: 'preset-1',
    url: 'https://example.com/bg.jpg',
    label: 'Ocean Waves',
    active: true,
    accessLevel: 'public',
    betaUsers: [],
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('GridPresetCard — label associations', () => {
  it('names the Active toggle from the preset label', () => {
    render(
      <GridPresetCard
        preset={buildPreset()}
        editingId={null}
        editName=""
        editingCategoryPresetId={null}
        editingCategoryValue=""
        allCategories={[]}
        allTags={[]}
        setEditingId={vi.fn()}
        setEditName={vi.fn()}
        setEditingCategoryPresetId={vi.fn()}
        setEditingCategoryValue={vi.fn()}
        updatePreset={vi.fn().mockResolvedValue(undefined)}
        clearPresetCategory={vi.fn().mockResolvedValue(undefined)}
        deletePreset={vi.fn().mockResolvedValue(undefined)}
        addBetaUser={vi.fn().mockResolvedValue(undefined)}
        removeBetaUser={vi.fn().mockResolvedValue(undefined)}
        toggleBuildingId={vi.fn().mockResolvedValue(undefined)}
        toggleFeatured={vi.fn().mockResolvedValue(undefined)}
        getAccessLevelIcon={() => null}
        getAccessLevelColor={() => ''}
      />
    );

    expect(
      screen.getByRole('switch', { name: 'Ocean Waves active' })
    ).toBeInTheDocument();
  });
});
