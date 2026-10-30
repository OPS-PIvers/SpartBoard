/** Admin-curated `admin_settings/import_conversion` kill switch for AI Conversion in Import (docs/plans/IMPORT.md D28). */
export { MAX_AI_CONVERSIONS_PER_IMPORT } from '@/utils/import/contract';

export const IMPORT_CONVERSION_SETTINGS_DOC = 'import_conversion';

export interface ImportConversionSettings {
  /** AI Conversion runs only when on; parser routes never need it. Ships off. */
  enabled: boolean;
}

export const DEFAULT_IMPORT_CONVERSION_SETTINGS: ImportConversionSettings = {
  enabled: false,
};

/** Fills a partial or malformed settings doc with the defaults. */
export function normalizeImportConversionSettings(
  raw: unknown
): ImportConversionSettings {
  if (!raw || typeof raw !== 'object') {
    return DEFAULT_IMPORT_CONVERSION_SETTINGS;
  }
  const enabled = (raw as { enabled?: unknown }).enabled;
  return { enabled: enabled === true };
}
