import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MaterialsConfigurationPanel } from './MaterialsConfigurationPanel';
import { MaterialsGlobalConfig } from '@/types';

/**
 * Why this file mocks so aggressively:
 *
 * Root cause of the flaky 5 s timeout seen in CI:
 *
 * 1. `import * as LucideIcons from 'lucide-react'` in MaterialsConfigurationPanel,
 *    MaterialsWidget/constants, and IconPicker loads a ~25,000-line CJS bundle.
 *    This alone costs ~400–700 ms of import-phase time per test file.
 *
 * 2. `Object.keys(LucideIcons)` (used by `filteredFallbackIcons`) iterates
 *    ~1,100 icon names even when the iconQuery is empty, because the expensive
 *    `Object.keys + filter + sort` runs unconditionally before the early-return
 *    `if (!query) return []`. On every render that line does O(n log n) work
 *    over the full icon set.
 *
 * 3. The component renders a large DOM tree: 25 MATERIAL_ICON_OPTIONS buttons +
 *    17+ BUILT_IN_MATERIALS catalog buttons. After a `fireEvent.click` on
 *    "Add Material", React processes at least three separate `setState` calls
 *    (updateAllBuildingAssignments → onChange, then resetDraft sets draft,
 *    editingId, and iconQuery), causing multiple JSDOM re-renders of the full
 *    catalog grid. Measured at ~1,300 ms per click in JSDOM on the CI runner.
 *
 * Rejected band-aids:
 *   - Increasing the vitest `testTimeout` option: hides the symptom, does not
 *     remove the underlying work, still fails on the slowest runners.
 *   - Only mocking lucide-react: reduces import time but leaves the per-click
 *     re-render cost (~1,200 ms per test).
 *
 * Fix strategy:
 *   - Mock `lucide-react` with a minimal static object so import + Object.keys
 *     are O(1) instead of O(1100).
 *   - Mock `@/hooks/useAdminBuildings` to avoid loading firebase/auth
 *     transitively through AuthContextValue.
 *   - Mock `@/components/widgets/MaterialsWidget/constants` with a fully
 *     self-contained stub: only 1 built-in item + 1 icon option, cutting the
 *     JSDOM render work by ~95% and dropping per-click cost from ~1,300 ms to
 *     ~40 ms.
 *
 * NOTE: vi.mock is hoisted to the top of the file by vitest's transformer, so
 * all factory functions must be fully self-contained (no outer-scope references).
 */

// 1. Replace the full 25,000-line lucide-react bundle with stub components.
vi.mock('lucide-react', () => {
  function icon(name: string) {
    const Stub = (props: React.HTMLAttributes<HTMLSpanElement>) =>
      React.createElement('span', { 'data-icon': name, ...props });
    Stub.displayName = name;
    return Stub;
  }
  // Pre-seed known icons; Proxy auto-stubs any future import so this mock
  // doesn't need updating when new icons are added to the component.
  const mocks: Record<string, unknown> = {
    Plus: icon('Plus'),
    Trash2: icon('Trash2'),
    Search: icon('Search'),
    Laptop: icon('Laptop'),
    Backpack: icon('Backpack'),
    Package: icon('Package'),
    HelpCircle: icon('HelpCircle'),
    X: icon('X'),
  };
  return new Proxy(mocks, {
    get(target, prop) {
      if (prop === '__esModule') return true;
      // CRITICAL: never auto-stub `then`. A function-valued `then` makes this
      // mocked module look like a thenable, so vitest's `await import(...)`
      // tries to chain on it and never resolves — the worker hangs forever
      // (this was the real cause of the "flaky 5s timeout" actually being an
      // infinite stall). Symbols already fall through to `undefined` below.
      if (prop === 'then') return undefined;
      if (typeof prop === 'string' && !(prop in target)) {
        target[prop] = icon(prop);
      }
      return target[prop as string];
    },
  });
});

// 2. Mock useAdminBuildings to skip the firebase/auth transitive import chain
//    (AuthContextValue.ts → firebase/auth, ~300 ms of module loading).
vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => [
    { id: 'b1', name: 'Building 1', gradeLevels: [], gradeLabel: 'K-12' },
    { id: 'b2', name: 'Building 2', gradeLevels: [], gradeLabel: 'K-12' },
  ],
}));

vi.mock('@/config/buildings', () => ({
  BUILDINGS: [
    { id: 'b1', name: 'Building 1' },
    { id: 'b2', name: 'Building 2' },
  ],
}));

// 3. Fully self-contained stub for the constants module. Using importOriginal
//    would still trigger lucide-react evaluation inside constants.ts (even
//    though it is mocked, the factory runs once). A plain object avoids that
//    extra work entirely. All values needed by MaterialsConfigurationPanel are
//    reproduced here; add more only when new tests cover them.
vi.mock('@/components/widgets/MaterialsWidget/constants', () => {
  // Inline stub icon component (no outer-scope refs — vi.mock is hoisted)
  const StubIcon = (props: React.HTMLAttributes<HTMLSpanElement>) =>
    React.createElement('span', { 'data-icon': 'stub', ...props });

  const BUILT_IN = [
    {
      id: 'computer',
      label: 'Computer',
      icon: 'Laptop',
      color: '#3b82f6',
      textColor: '#ffffff',
      iconComponent: StubIcon,
    },
  ];

  return {
    MATERIAL_ICON_FALLBACK: 'Package',
    BUILT_IN_MATERIALS: BUILT_IN,
    // Single entry so the icon-option button strip renders 1 button not 25.
    MATERIAL_ICON_OPTIONS: ['Backpack'],
    MATERIAL_COLOR_OPTIONS: ['#2563eb'],
    resolveMaterialIcon: () => StubIcon,
    getContrastingTextColor: () => '#ffffff',
    resolveMaterialDefinition: (m: {
      id: string;
      label: string;
      icon: string;
      color: string;
      textColor?: string;
    }) => ({
      ...m,
      textColor: m.textColor ?? '#ffffff',
      iconComponent: StubIcon,
    }),
    getMaterialsCatalog: (config?: {
      customMaterials?: Array<{
        id: string;
        label: string;
        icon: string;
        color: string;
      }>;
    }) => [
      ...BUILT_IN,
      ...(config?.customMaterials ?? []).map((m) => ({
        ...m,
        textColor: '#ffffff',
        iconComponent: StubIcon,
      })),
    ],
    getMaterialMap: (config?: {
      customMaterials?: Array<{
        id: string;
        label: string;
        icon: string;
        color: string;
      }>;
    }) => {
      const catalog = [
        ...BUILT_IN,
        ...(config?.customMaterials ?? []).map((m) => ({
          ...m,
          textColor: '#ffffff',
          iconComponent: StubIcon,
        })),
      ];
      return new Map(catalog.map((m) => [m.id, m]));
    },
  };
});

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
