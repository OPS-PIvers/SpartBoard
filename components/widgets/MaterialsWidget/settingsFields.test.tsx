import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useDialog } from '@/context/useDialog';
import { useWidgetBuildingId } from '@/hooks/useWidgetBuildingId';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import type { MaterialDefinition, MaterialsConfig, WidgetData } from '@/types';
import { TEACHER_MATERIAL_ID_PREFIX } from './constants';
import { MaterialsCatalogField, MaterialsTitleFontField } from './settingsFields';

vi.mock('@/context/useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('@/context/useDashboard', () => ({ useDashboard: vi.fn() }));
vi.mock('@/context/useDialog', () => ({ useDialog: vi.fn() }));
vi.mock('@/hooks/useWidgetBuildingId', () => ({ useWidgetBuildingId: vi.fn() }));

const mockedUseAuth = vi.mocked(useAuth);
const mockedUseDashboard = vi.mocked(useDashboard);
const mockedUseDialog = vi.mocked(useDialog);
const mockedUseWidgetBuildingId = vi.mocked(useWidgetBuildingId);

const GLUE: MaterialDefinition = {
  id: TEACHER_MATERIAL_ID_PREFIX + 'glue',
  label: 'Glue Sticks',
  icon: 'Package',
  color: '#16a34a',
  textColor: '#ffffff',
};

const widget = {
  id: 'materials-test-1',
  type: 'materials',
  config: { selectedItems: [], activeItems: [] },
} as unknown as WidgetData;

const translate = (key: string, options?: Record<string, unknown>) => {
  const leaf = key.split('.').pop() ?? key;
  const labels: Record<string, string> = {
    inherit: 'Inherit',
    digital: 'Digital',
    modern: 'Modern',
    school: 'School',
    availableMaterials: 'Available materials',
    addMaterial: 'Add',
    selectAll: 'Select all',
    deselectAll: 'Deselect all',
    selectionTip: 'Selection tip',
    editMaterial: 'Edit {{label}}',
    deleteMaterial: 'Delete {{label}}',
    deleteMaterialQuestion: 'Delete “{{label}}”?',
    deleteMaterialTitle: 'Delete material',
    delete: 'Delete',
    material: 'material',
    deleteUsageOther: 'It is used on {{count}} widgets and will be removed from them.',
    newMaterial: 'New material',
    editMaterialTitle: 'Edit material',
    materialPlaceholder: 'Glue sticks',
    icon: 'Icon',
    iconSearch: 'Search icons…',
    materialIcon: 'Material icon',
    noIconsMatch: 'No icons match “{{query}}”.',
    color: 'Color',
    save: 'Save',
    cancel: 'Cancel',
  };
  let value = labels[leaf] ?? leaf;
  for (const [name, option] of Object.entries(options ?? {})) {
    value = value.replace('{{' + name + '}}', String(option));
  }
  return value;
};

const makeCtx = (
  config: Partial<MaterialsConfig>,
  updateConfig: (patch: Record<string, unknown>) => void = vi.fn()
) =>
  ({
    config,
    widget,
    isAdmin: false,
    canAccessFeature: vi.fn(() => true),
    canAccessWidget: vi.fn(() => true),
    toolLabel: vi.fn((type: string) => type),
    t: translate,
    surface: 'drawer',
    updateConfig,
    id: 'materials-field',
    labelId: 'materials-field-label',
    describedBy: undefined,
  }) as unknown as CustomRenderCtx;

const setup = (options: { customMaterials?: MaterialDefinition[]; dashboards?: unknown[] } = {}) => {
  const updateWidgetConfigsAcrossBoards = vi.fn().mockResolvedValue(undefined);
  const showConfirm = vi.fn().mockResolvedValue(true);
  mockedUseDashboard.mockReturnValue({
    dashboards: options.dashboards ?? [],
    updateWidgetConfigsAcrossBoards,
  } as unknown as ReturnType<typeof useDashboard>);
  mockedUseAuth.mockReturnValue({
    featurePermissions: [],
    customMaterials: options.customMaterials ?? [],
    saveCustomMaterials: vi.fn().mockResolvedValue(undefined),
    materialsPreferences: {},
    saveMaterialsPreferences: vi.fn(),
  } as unknown as ReturnType<typeof useAuth>);
  mockedUseDialog.mockReturnValue({ showConfirm } as unknown as ReturnType<typeof useDialog>);
  mockedUseWidgetBuildingId.mockReturnValue(undefined);
  return { showConfirm, updateWidgetConfigsAcrossBoards };
};

describe('Materials settings drawer fields', () => {
  beforeEach(() => vi.clearAllMocks());

  it('moves through the title-font radiogroup with arrow keys', () => {
    const updateConfig = vi.fn();
    setup();
    render(<MaterialsTitleFontField ctx={makeCtx({ titleFont: 'global' }, updateConfig)} />);
    const radios = screen.getAllByRole('radio');
    radios[0].focus();
    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(radios[1]);
    expect(updateConfig).toHaveBeenCalledWith({ titleFont: 'font-mono' });
  });

  it('cascades a confirmed custom-material delete across boards', async () => {
    const dashboards = [
      { id: 'a', widgets: [{ id: 'w1', type: 'materials', config: { selectedItems: [GLUE.id] } }] },
      { id: 'b', widgets: [{ id: 'w2', type: 'materials', config: { activeItems: [GLUE.id] } }] },
    ];
    const { showConfirm, updateWidgetConfigsAcrossBoards } = setup({
      customMaterials: [GLUE],
      dashboards,
    });
    const user = userEvent.setup();
    render(<MaterialsCatalogField ctx={makeCtx({ selectedItems: [], activeItems: [] })} />);
    await user.click(screen.getByRole('button', { name: 'Edit Glue Sticks' }));
    await user.click(screen.getByRole('button', { name: 'Delete Glue Sticks' }));
    await waitFor(() => expect(showConfirm).toHaveBeenCalled());
    expect(updateWidgetConfigsAcrossBoards).toHaveBeenCalledWith('materials', expect.any(Function));
    const transform = updateWidgetConfigsAcrossBoards.mock.calls[0][1] as (
      config: MaterialsConfig
    ) => MaterialsConfig | null;
    expect(transform({
      selectedItems: [GLUE.id, 'pencil'],
      activeItems: [GLUE.id],
      customMaterialSnapshots: [GLUE],
    })).toEqual({
      selectedItems: ['pencil'],
      activeItems: [],
      customMaterialSnapshots: [],
    });
  });
});
