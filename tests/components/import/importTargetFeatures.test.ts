import { describe, expect, it } from 'vitest';
import {
  IMPORT_ROUTES,
  IMPORT_TARGET_FEATURES,
} from '@/components/import/importTargets';
import { FEATURE_DEFAULTS } from '@/config/featureDefaults';
import type { ImportTarget } from '@/utils/import/contract';

describe('per-type Import flags', () => {
  it('gives every Import route its own admin-default flag under universal-import', () => {
    for (const target of Object.keys(IMPORT_ROUTES) as ImportTarget[]) {
      const flag = IMPORT_TARGET_FEATURES[target];
      expect(flag, target).toBeDefined();
      if (!flag) continue;
      const def = FEATURE_DEFAULTS[flag];
      expect(def.requires, flag).toBe('universal-import');
      expect(def.defaultAccessLevel, flag).toBe('admin');
      expect(def.missingDocPublic, flag).toBe(false);
    }
  });
});
