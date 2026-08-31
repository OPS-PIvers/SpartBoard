import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_MATERIALS,
  MATERIAL_ICON_FALLBACK,
  MATERIAL_ICON_OPTIONS,
  TEACHER_MATERIAL_ID_PREFIX,
  buildMaterialSnapshots,
  createTeacherMaterialId,
  getMaterialsCatalog,
  resolveMaterialDefinition,
  resolveMaterialIcon,
} from './constants';
import { MaterialDefinition } from '@/types';

const TEACHER_GLUE: MaterialDefinition = {
  id: `${TEACHER_MATERIAL_ID_PREFIX}glue`,
  label: 'Glue Sticks',
  icon: 'Package',
  color: '#16a34a',
  textColor: '#ffffff',
};

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

  it('appends teacher materials and exempts them from the building allowlist', () => {
    const catalog = getMaterialsCatalog(
      {},
      { teacherMaterials: [TEACHER_GLUE], allowedIds: ['pencil'] }
    );

    expect(catalog.map((material) => material.id)).toEqual([
      'pencil',
      TEACHER_GLUE.id,
    ]);
  });

  it('filters built-ins and admin customs by the building allowlist', () => {
    const catalog = getMaterialsCatalog(
      {
        customMaterials: [
          {
            id: 'admin-clay',
            label: 'Clay',
            icon: 'Package',
            color: '#111111',
          },
        ],
      },
      { allowedIds: ['pencil', 'admin-clay'] }
    );

    expect(catalog.map((material) => material.id)).toEqual([
      'pencil',
      'admin-clay',
    ]);
  });

  it('uses snapshots only for ids the live catalog cannot resolve', () => {
    const stale = { ...TEACHER_GLUE, label: 'Old Name' };
    const catalog = getMaterialsCatalog(
      {},
      { teacherMaterials: [TEACHER_GLUE], snapshots: [stale] }
    );

    const resolved = catalog.find(
      (material) => material.id === TEACHER_GLUE.id
    );
    expect(resolved?.label).toBe('Glue Sticks');
  });

  it('resolves snapshot-only materials so shared boards still render', () => {
    const catalog = getMaterialsCatalog({}, { snapshots: [TEACHER_GLUE] });

    expect(
      catalog.find((material) => material.id === TEACHER_GLUE.id)?.label
    ).toBe('Glue Sticks');
  });

  it('ignores custom entries missing an id or a label', () => {
    const catalog = getMaterialsCatalog(
      {},
      {
        teacherMaterials: [
          { id: '', label: 'No id', icon: 'Package', color: '#111111' },
          { id: 'blank', label: '   ', icon: 'Package', color: '#111111' },
        ],
      }
    );

    expect(catalog).toHaveLength(BUILT_IN_MATERIALS.length);
  });

  it('namespaces teacher ids so they cannot shadow a built-in', () => {
    const id = createTeacherMaterialId();

    expect(id.startsWith(TEACHER_MATERIAL_ID_PREFIX)).toBe(true);
    expect(BUILT_IN_MATERIALS.map((material) => material.id)).not.toContain(id);
  });

  it('offers a broad set of resolvable icon options', () => {
    const fallback = resolveMaterialIcon(MATERIAL_ICON_FALLBACK);

    expect(MATERIAL_ICON_OPTIONS.length).toBeGreaterThanOrEqual(60);
    expect(new Set(MATERIAL_ICON_OPTIONS).size).toBe(
      MATERIAL_ICON_OPTIONS.length
    );
    MATERIAL_ICON_OPTIONS.forEach((name) => {
      if (name === MATERIAL_ICON_FALLBACK) return;
      expect(resolveMaterialIcon(name)).not.toBe(fallback);
    });
  });
});

describe('buildMaterialSnapshots', () => {
  const catalog = getMaterialsCatalog({}, { teacherMaterials: [TEACHER_GLUE] });

  it('snapshots referenced non-built-in materials without the icon component', () => {
    const snapshots = buildMaterialSnapshots(
      ['pencil', TEACHER_GLUE.id],
      catalog
    );

    expect(snapshots).toEqual([TEACHER_GLUE]);
    expect(snapshots[0]).not.toHaveProperty('iconComponent');
  });

  it('drops duplicates and ids the catalog cannot resolve', () => {
    const snapshots = buildMaterialSnapshots(
      [TEACHER_GLUE.id, TEACHER_GLUE.id, 'custom_gone'],
      catalog
    );

    expect(snapshots).toEqual([TEACHER_GLUE]);
  });
});
