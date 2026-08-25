import { describe, it, expect } from 'vitest';
import { resolveActorBuildingIds } from '@/components/admin/Organization/lib/actorBuildingScope';
import type { BuildingRecord } from '@/types/organization';

const building = (id: string): Pick<BuildingRecord, 'id'> => ({ id });

describe('resolveActorBuildingIds', () => {
  it('canonicalizes a legacy long-form buildingId on the member doc', () => {
    const result = resolveActorBuildingIds(
      'building_admin',
      ['orono-high-school'],
      [building('high')]
    );
    expect(result).toEqual(['high']);
  });

  it('passes already-canonical buildingIds through unchanged', () => {
    const result = resolveActorBuildingIds(
      'building_admin',
      ['high', 'middle'],
      [building('high'), building('middle')]
    );
    expect(result).toEqual(['high', 'middle']);
  });

  it('dedupes when legacy and canonical forms both appear', () => {
    const result = resolveActorBuildingIds(
      'building_admin',
      ['orono-high-school', 'high'],
      [building('high')]
    );
    expect(result).toEqual(['high']);
  });

  it('returns every building id for domain_admin / super_admin, ignoring memberBuildingIds', () => {
    const result = resolveActorBuildingIds(
      'domain_admin',
      ['orono-high-school'],
      [building('high'), building('middle')]
    );
    expect(result).toEqual(['high', 'middle']);
  });

  it('returns an empty scope for a building_admin with no assigned buildings', () => {
    const result = resolveActorBuildingIds(
      'building_admin',
      [],
      [building('high')]
    );
    expect(result).toEqual([]);
  });
});
