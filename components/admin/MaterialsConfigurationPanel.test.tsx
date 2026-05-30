import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MaterialsConfigurationPanel } from './MaterialsConfigurationPanel';
import { MaterialsGlobalConfig } from '@/types';

// ── Performance fix ──────────────────────────────────────────────────────────
// lucide-react ships ~5 700 icons and takes >1 second to import in jsdom.
// Neither test exercises icon rendering, so we stub the entire module with
// lightweight no-op components for every icon name that the component tree
// touches.  This drops the per-file import time from ~1 300 ms to under
// 50 ms, keeping the combined test well below the 5-second nightly timeout.
//
// All icon stubs are defined INSIDE the factory so the hoisted vi.mock call
// can reference them without a "used before declaration" error.
vi.mock('lucide-react', () => {
  const S = () => null; // single tiny stub reused for every icon
  return {
    // Named imports used directly in MaterialsConfigurationPanel.tsx
    Plus: S,
    Trash2: S,
    Search: S,
    // Namespace icons accessed via MATERIAL_ICON_OPTIONS and BUILT_IN_MATERIALS
    Backpack: S,
    Book: S,
    BookCheck: S,
    BookOpen: S,
    Bookmark: S,
    Box: S,
    Briefcase: S,
    Calculator: S,
    ClipboardList: S,
    Droplets: S,
    FileText: S,
    Folder: S,
    GraduationCap: S,
    Headphones: S,
    Highlighter: S,
    Laptop: S,
    Library: S,
    Notebook: S,
    Package: S,
    Pencil: S,
    PenTool: S,
    Printer: S,
    Ruler: S,
    Scissors: S,
    Smartphone: S,
    Tablet: S,
    Wrench: S,
  };
});

// Stub IconPicker — it renders its own `import * as Icons from 'lucide-react'`
// wildcard and is not exercised by these behaviour tests.
vi.mock('@/components/widgets/InstructionalRoutines/IconPicker', () => ({
  IconPicker: () => null,
}));

vi.mock('@/config/buildings', () => ({
  BUILDINGS: [
    { id: 'b1', name: 'Building 1' },
    { id: 'b2', name: 'Building 2' },
  ],
  buildingRecordToBuilding: (r: unknown) => r,
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
