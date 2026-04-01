import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_MATERIALS,
  MATERIAL_ICON_FALLBACK,
  getMaterialsCatalog,
  resolveMaterialDefinition,
} from './constants';

describe('MaterialsWidget constants', () => {
  it('merges built-in and custom materials into a single catalog', () => {
    const catalog = getMaterialsCatalog({
      customMaterials: [
        {
          id: 'custom-glue',
          label: 'Glue Sticks',
          icon: 'Package',
          color: '#16a34a',
        },
      ],
    });

    expect(catalog.map((material) => material.id)).toContain('computer');
    expect(catalog.map((material) => material.id)).toContain('custom-glue');
    expect(catalog).toHaveLength(BUILT_IN_MATERIALS.length + 1);
  });

  it('falls back to the default icon when the saved icon is invalid', () => {
    const resolved = resolveMaterialDefinition({
      id: 'custom-invalid',
      label: 'Invalid',
      icon: 'NotARealIcon',
      color: '#2563eb',
    });

    const fallbackResolved = resolveMaterialDefinition({
      id: 'fallback',
      label: 'Fallback',
      icon: MATERIAL_ICON_FALLBACK,
      color: '#2563eb',
    });

    expect(resolved.iconComponent).toBe(fallbackResolved.iconComponent);
    expect(resolved.textColor).toBe('#ffffff');
  });
});
