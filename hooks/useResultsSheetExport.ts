// Export to Sheets for a results screen: Google access, busy state, the sheet link and errors.
import { useState } from 'react';
import { useAuth } from '@/context/useAuth';
import { useViewAsOutward } from '@/hooks/useViewAsOutward';
import { logError } from '@/utils/logError';

export interface ResultsSheetExport {
  exporting: boolean;
  exportUrl: string | null;
  exportError: string | null;
  /** Off in a read-only view-as tab. */
  locked: boolean;
  lockedTitle: string | undefined;
  /** Hidden for users outside the district, who have no Drive. */
  available: boolean;
  run: () => Promise<void>;
}

/** `create` makes a new sheet the teacher owns and returns its URL. */
export function useResultsSheetExport(
  create: (token: string) => Promise<string>,
  logTag: string
): ResultsSheetExport {
  const { ensureGoogleScope, isExternalUser } = useAuth();
  const outward = useViewAsOutward();
  const [exporting, setExporting] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const run = async (): Promise<void> => {
    if (outward.active && !(await outward.confirm('Export to Sheets'))) return;
    // A new sheet the teacher owns, so the login drive.file scope is enough.
    const token = await ensureGoogleScope('drive.file', { interactive: true });
    if (!token) {
      setExportError(
        'Google Drive access is required to export. Please sign out and sign in again.'
      );
      return;
    }
    setExporting(true);
    setExportError(null);
    try {
      setExportUrl(await create(token));
    } catch (err) {
      logError(logTag, err);
      setExportError(
        err instanceof Error ? err.message : 'Export failed. Please try again.'
      );
    } finally {
      setExporting(false);
    }
  };

  return {
    exporting,
    exportUrl,
    exportError,
    locked: outward.locked,
    lockedTitle: outward.lockedTitle,
    available: !isExternalUser,
    run,
  };
}
