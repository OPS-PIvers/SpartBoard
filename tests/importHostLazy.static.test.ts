import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Import screen chunk', () => {
  it('DashboardView loads the Import host lazily, not statically', () => {
    const src = readFileSync('components/layout/DashboardView.tsx', 'utf8');
    expect(src).not.toMatch(
      /^import .*ImportScreenHost.* from '@\/components\/import\/ImportScreenHost'/m
    );
    expect(src).toMatch(/import\('@\/components\/import\/ImportScreenHost'\)/);
  });
});
