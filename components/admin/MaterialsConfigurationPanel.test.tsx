import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MaterialsConfigurationPanel } from './MaterialsConfigurationPanel';
import { MaterialsGlobalConfig } from '@/types';

// ── Performance fix ──────────────────────────────────────────────────────────
// lucide-react ships ~5 700 icons and takes >1 second to import in jsdom.
// Neither test exercises icon rendering, so we stub the entire module.
//
// A catch-all Proxy returns the same no-op renderer for every property access,
// so the mock stays correct even when the component (or one of its
// dependencies) starts importing a new Lucide icon — no enumeration to
// maintain, and no silent "X is not a function" render errors from an icon
// that resolved to undefined. The __esModule branch keeps Vite/Vitest ESM
// interop happy so the module is treated as a real ES module.
vi.mock('lucide-react', () => {
  const Stub = () => null;
  return new Proxy(
    {},
    {
      get: (_target, prop) => (prop === '__esModule' ? true : Stub),
    }
  );
});

// Stub IconPicker — it renders its own `import * as Icons from 'lucide-react'`
// wildcard and is not exercised by these behaviour tests.
vi.mock('@/components/widgets/InstructionalRoutines/IconPicker', () => ({
  IconPicker: () => null,
}));

vi.mock('@/config/buildings', () => ({
  BUILDINGS: [
    { id: 'b1', name: 'Building 1', gradeLevels: [], gradeLabel: 'K-12' },
    { id: 'b2', name: 'Building 2', gradeLevels: [], gradeLabel: 'K-12' },
  ],
  buildingRecordToBuilding: (r: { id?: string; name?: string }) => ({
    id: r?.id,
    name: r?.name,
    gradeLevels: [],
    gradeLabel: 'K-12',
  }),
}));

// Stub useAdminBuildings to return the two test buildings without touching
// AuthContext or firebase/auth — both bring in heavy Firebase init code that
// can deadlock jsdom when run in an isolated vitest worker.
vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => [
    { id: 'b1', name: 'Building 1', gradeLevels: [], gradeLabel: 'K-12' },
    { id: 'b2', name: 'Building 2', gradeLevels: [], gradeLabel: 'K-12' },
  ],
}));

describe('MaterialsConfigurationPanel', () => {
  const mockOnChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a custom material and persists it into config', () => {
    const config: MaterialsGlobalConfig = {
      customMaterials: [],
      buildingDefaults: {
        b1: {
          buildingId: 'b1',
          selectedItems: [],
        },
      },
    };

    render(
      <MaterialsConfigurationPanel config={config} onChange={mockOnChange} />
    );

    fireEvent.change(screen.getByPlaceholderText('Glue sticks'), {
      target: { value: 'Glue Sticks' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Material' }));

    expect(mockOnChange).toHaveBeenCalledTimes(1);
    const nextConfig = mockOnChange.mock.calls[0][0] as MaterialsGlobalConfig;
    expect(nextConfig.customMaterials).toHaveLength(1);
    expect(nextConfig.customMaterials?.[0]).toMatchObject({
      label: 'Glue Sticks',
      icon: 'Backpack',
    });
  });

  it('removes deleted custom materials from building assignments', () => {
    const config: MaterialsGlobalConfig = {
      customMaterials: [
        {
          id: 'custom-glue',
          label: 'Glue Sticks',
          icon: 'Package',
          color: '#16a34a',
        },
      ],
      buildingDefaults: {
        b1: {
          buildingId: 'b1',
          selectedItems: ['computer', 'custom-glue'],
        },
        b2: {
          buildingId: 'b2',
          selectedItems: ['custom-glue'],
        },
      },
    };

    render(
      <MaterialsConfigurationPanel config={config} onChange={mockOnChange} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove Glue Sticks' }));

    const nextConfig = mockOnChange.mock.calls[0][0] as MaterialsGlobalConfig;
    expect(nextConfig.customMaterials).toEqual([]);
    expect(nextConfig.buildingDefaults.b1.selectedItems).toEqual(['computer']);
    expect(nextConfig.buildingDefaults.b2.selectedItems).toEqual([]);
  });
});
