import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MaterialsConfigurationPanel } from './MaterialsConfigurationPanel';
import { MaterialsGlobalConfig } from '@/types';

vi.mock('@/config/buildings', () => ({
  BUILDINGS: [
    { id: 'b1', name: 'Building 1' },
    { id: 'b2', name: 'Building 2' },
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
