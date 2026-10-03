import { describe, it, expect } from 'vitest';
import {
  buildingRecordToBuilding,
  canonicalBuildingId,
  gradeLabelFromType,
  toLunchCountSchoolSite,
} from './buildings';
import type { BuildingRecord } from '@/types/organization';

describe('buildingRecordToBuilding — Other-type buildings', () => {
  it('falls back to all grade bands (not empty) when grades is unset', () => {
    // Regression: 'other' used to fall back to [], which hides every
    // grade-gated widget in FeaturePermissionsManager's building filter.
    const record: BuildingRecord = {
      id: 'district-office',
      orgId: 'org-1',
      name: 'District Office',
      type: 'other',
      address: '',
      grades: '',
      users: 0,
      adminEmails: [],
    };

    const building = buildingRecordToBuilding(record);

    expect(building.gradeLevels).toEqual(['k-2', '3-5', '6-8', '9-12']);
    expect(building.gradeLabel).toBe('K-12');
  });
});

describe('gradeLabelFromType', () => {
  it('returns a non-empty label for every BuildingType, including other', () => {
    expect(gradeLabelFromType('elementary')).toBe('K-5');
    expect(gradeLabelFromType('middle')).toBe('6-8');
    expect(gradeLabelFromType('high')).toBe('9-12');
    expect(gradeLabelFromType('other')).toBe('K-12');
  });
});

describe('building id lookups ignore Object.prototype keys', () => {
  it('canonicalBuildingId returns inherited-name ids unchanged', () => {
    expect(canonicalBuildingId('constructor')).toBe('constructor');
    expect(canonicalBuildingId('toString')).toBe('toString');
    expect(canonicalBuildingId('orono-high-school')).toBe('high');
  });

  it('toLunchCountSchoolSite returns null for inherited-name ids', () => {
    expect(toLunchCountSchoolSite('constructor')).toBeNull();
    expect(toLunchCountSchoolSite('high')).toBe('orono-high-school');
  });
});
