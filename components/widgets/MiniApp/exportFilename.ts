import { getLocalIsoDate } from '@/utils/localDate';

// Filename for the exported library JSON — local date, not UTC.
export function buildMiniAppExportFilename(now: Date = new Date()): string {
  return `spartboard-apps-${getLocalIsoDate(now)}.json`;
}
