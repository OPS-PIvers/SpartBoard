import { describe, expect, it } from 'vitest';
import {
  forgetMaterial,
  preferencesFromConfig,
  seedMaterialsConfig,
} from './materialsPreferences';
import type { MaterialDefinition } from '@/types';

const GLUE: MaterialDefinition = {
  id: 'custom_glue',
  label: 'Glue',
  icon: 'Package',
  color: '#16a34a',
};

describe('seedMaterialsConfig', () => {
  it('returns nothing when the teacher has no preferences yet', () => {
    expect(seedMaterialsConfig(undefined)).toEqual({});
    expect(seedMaterialsConfig({})).toEqual({});
    expect(seedMaterialsConfig({ selectedItems: [] })).toEqual({});
  });

  it('seeds selection, snapshots and title but never the active items', () => {
    const seed = seedMaterialsConfig({
      selectedItems: ['pencil', GLUE.id],
      customMaterialSnapshots: [GLUE],
      title: 'Bring',
      titleFont: 'font-sans',
      hiddenMaterialIds: ['calculator'],
    });
    expect(seed).toEqual({
      selectedItems: ['pencil', GLUE.id],
      customMaterialSnapshots: [GLUE],
      title: 'Bring',
      titleFont: 'font-sans',
    });
    expect(seed).not.toHaveProperty('activeItems');
    expect(seed).not.toHaveProperty('hiddenMaterialIds');
  });
});

describe('preferencesFromConfig', () => {
  it('captures the selection and only the snapshots it still references', () => {
    const next = preferencesFromConfig(
      { hiddenMaterialIds: ['calculator'], title: 'Old' },
      {
        selectedItems: ['pencil', GLUE.id],
        activeItems: ['pencil'],
        customMaterialSnapshots: [
          GLUE,
          { ...GLUE, id: 'custom_gone', label: 'Gone' },
        ],
        titleFont: 'font-mono',
      }
    );
    expect(next).toEqual({
      hiddenMaterialIds: ['calculator'],
      title: 'Old',
      titleFont: 'font-mono',
      selectedItems: ['pencil', GLUE.id],
      customMaterialSnapshots: [GLUE],
    });
  });
});

describe('forgetMaterial', () => {
  it('removes the material from every list', () => {
    expect(
      forgetMaterial(
        {
          selectedItems: ['pencil', GLUE.id],
          customMaterialSnapshots: [GLUE],
          hiddenMaterialIds: [GLUE.id, 'calculator'],
        },
        GLUE.id
      )
    ).toEqual({
      selectedItems: ['pencil'],
      customMaterialSnapshots: [],
      hiddenMaterialIds: ['calculator'],
    });
  });
});
