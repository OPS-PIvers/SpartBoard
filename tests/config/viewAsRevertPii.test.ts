import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { PII_WIDGET_FIELDS } from '@/utils/dashboardPII';

// revertViewAsChangeV1 strips these from a restored widget config; its copy must not drift.
describe('revertViewAsChangeV1 PII field list', () => {
  it('matches utils/dashboardPII.ts', () => {
    const source = readFileSync('functions/src/viewAsRevert.ts', 'utf8');
    const block = /PII_WIDGET_FIELDS: readonly string\[\] = \[([^\]]*)\]/.exec(
      source
    );
    const serverList = [...(block?.[1] ?? '').matchAll(/'([^']+)'/g)].map(
      (m) => m[1]
    );
    expect(serverList).toEqual([...PII_WIDGET_FIELDS]);
  });
});
