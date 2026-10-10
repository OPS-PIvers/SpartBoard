import React, { useMemo, useState } from 'react';
import { ExternalLink, FileSpreadsheet, FileText } from 'lucide-react';
import { CellPopover } from '@/components/admin/Organization/components/primitives';
import { useAuth } from '@/context/useAuth';
import { tourAttr } from '@/config/tourAnchors';
import { useGradebook } from '../GradebookContext';
import { buildGradebookExportRows, exportTitle } from './gradebookExport';
import {
  createGradebookSheet,
  downloadGradebookCsv,
} from './gradebookExportFiles';

export interface GradebookExportMenuProps {
  anchor: HTMLElement;
  onClose: () => void;
}

const itemClass =
  'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-slate-700 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none disabled:opacity-50';

/** D30: the grid's current view to a CSV download or a new Google Sheet. */
export const GradebookExportMenu: React.FC<GradebookExportMenuProps> = ({
  anchor,
  onClose,
}) => {
  const gb = useGradebook();
  const { ensureGoogleScope, isExternalUser } = useAuth();
  const [busy, setBusy] = useState(false);
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const anchorRef = useMemo(() => ({ current: anchor }), [anchor]);

  const rows = () =>
    buildGradebookExportRows(
      {
        students: gb.students,
        columns: gb.columns,
        cell: (uid, sessionId) => gb.getCell(sessionId, uid).final,
        overall: gb.overall,
        flagDefs: gb.settings.flags,
      },
      {
        nameFormat: gb.view.nameFormat,
        scoreFormat: gb.view.cellFormat,
        flagsAsCodes: true,
      }
    );
  const title = () => exportTitle(gb.roster.name);

  const toCsv = () => {
    downloadGradebookCsv(rows(), title());
    gb.toast('CSV downloaded');
    onClose();
  };

  const toSheet = async () => {
    setBusy(true);
    setError(null);
    try {
      const token = await ensureGoogleScope('drive.file', {
        interactive: true,
      });
      if (!token) throw new Error('Google access is needed to make a sheet.');
      setSheetUrl(await createGradebookSheet(token, rows(), title()));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not make the sheet.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <CellPopover
      open
      onClose={onClose}
      anchorRef={anchorRef}
      className="w-[260px] !p-1.5"
    >
      <div role="menu" aria-label="Export" className="flex flex-col gap-1">
        <button
          type="button"
          role="menuitem"
          {...tourAttr('gradebook.export.csv')}
          className={itemClass}
          onClick={toCsv}
        >
          <FileText aria-hidden className="h-4 w-4 text-slate-500" />
          Download CSV
        </button>
        {isExternalUser ? null : sheetUrl ? (
          <a
            role="menuitem"
            href={sheetUrl}
            {...tourAttr('gradebook.export.open-sheet')}
            target="_blank"
            rel="noopener noreferrer"
            className={`${itemClass} font-semibold text-brand-blue-primary`}
            onClick={onClose}
          >
            <ExternalLink aria-hidden className="h-4 w-4" />
            Open sheet
          </a>
        ) : (
          <button
            type="button"
            role="menuitem"
            {...tourAttr('gradebook.export.sheet')}
            className={itemClass}
            disabled={busy}
            onClick={() => void toSheet()}
          >
            <FileSpreadsheet aria-hidden className="h-4 w-4 text-slate-500" />
            {busy ? 'Making sheet…' : 'New Google Sheet'}
          </button>
        )}
        {error && (
          <p
            role="alert"
            className="px-2.5 pb-1 text-xs text-brand-red-primary"
          >
            {error}
          </p>
        )}
      </div>
    </CellPopover>
  );
};
