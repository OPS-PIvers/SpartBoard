import { describe, it, expect } from 'vitest';
import {
  canonicalBuildingIdServer,
  canonicalizeBuildingIdsServer,
} from './buildingIds';

describe('buildingIds', () => {
  it('maps legacy aliases', () => {
    expect(canonicalBuildingIdServer('orono-high-school')).toBe('high');
  });

  it('does not resolve Object.prototype members as aliases', () => {
    for (const id of [
      'constructor',
      'toString',
      '__proto__',
      'hasOwnProperty',
    ]) {
      expect(canonicalBuildingIdServer(id)).toBe(id);
    }
    expect(canonicalizeBuildingIdsServer(['constructor', 'high'])).toEqual([
      'constructor',
      'high',
    ]);
  });
});
