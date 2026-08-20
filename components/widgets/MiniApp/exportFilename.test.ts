import { describe, it, expect } from 'vitest';
import { buildMiniAppExportFilename } from './exportFilename';

describe('buildMiniAppExportFilename', () => {
  it('REGRESSION: uses the local date, not the UTC date, for the export filename', () => {
    // Getters stubbed (not a plain Date) because TZ is pinned to UTC in tests/setTz.ts, so a real offset can't otherwise be simulated.
    const now = new Date('2026-06-14T12:00:00.000Z');
    now.getFullYear = () => 2026;
    now.getMonth = () => 5;
    now.getDate = () => 15;

    expect(buildMiniAppExportFilename(now)).toBe(
      'spartboard-apps-2026-06-15.json'
    );
  });

  it('pads single-digit month and day', () => {
    const now = new Date('2026-01-05T00:00:00.000Z');
    now.getFullYear = () => 2026;
    now.getMonth = () => 0;
    now.getDate = () => 5;

    expect(buildMiniAppExportFilename(now)).toBe(
      'spartboard-apps-2026-01-05.json'
    );
  });
});
