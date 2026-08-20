import { describe, it, expect } from 'vitest';
import { buildMiniAppExportFilename } from './exportFilename';

describe('buildMiniAppExportFilename', () => {
  it('REGRESSION: uses the local date, not the UTC date, for the export filename', () => {
    // UTC+12 teacher at local midnight 2026-06-15 (= 2026-06-14T12:00:00Z).
    // Old code: new Date().toISOString().slice(0, 10) -> "2026-06-14" (UTC date).
    // Fixed code: getLocalIsoDate() reads local getters -> "2026-06-15".
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
