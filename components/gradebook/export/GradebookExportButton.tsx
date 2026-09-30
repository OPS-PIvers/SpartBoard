import React, { useRef, useState } from 'react';
import {
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
} from 'lucide-react';
import { useAuth } from '@/context/useAuth';
import { useClickOutside } from '@/hooks/useClickOutside';
import {
  buildGradebookExportRows,
  exportTitle,
  type GradebookExportOptions,
  type GradebookExportView,
} from './gradebookExport';
import {
  createGradebookSheet,
  downloadGradebookCsv,
} from './gradebookExportFiles';

interface GradebookExportButtonProps {
  className: string;
  /** Read at click time so the export matches the grid as it is now. */
  getView: () => GradebookExportView;
  /** The grid's View settings: name format and score format (D30). */
  options: GradebookExportOptions;
}

const itemClass =
  'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-slate-700 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none disabled:opacity-50';

/** Subbar Export: the current view to a CSV download or a new Google Sheet. */
export const GradebookExportButton: React.FC<GradebookExportButtonProps> = ({
  className,
  getView,
  options,
}) => {
  const { ensureGoogleScope, isExternalUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  useClickOutside(wrapRef, () => setOpen(false));

  const rows = () => buildGradebookExportRows(getView(), options);

  const toCsv = () => {
    downloadGradebookCsv(rows(), exportTitle(className));
    setOpen(false);
  };

  const toSheet = async () => {
    setBusy(true);
    setError(null);
    try {
      const token = await ensureGoogleScope('drive.file', {
        interactive: true,
      });
      if (!token) throw new Error('Google access is needed to make a sheet.');
      setSheetUrl(
        await createGradebookSheet(token, rows(), exportTitle(className))
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not make the sheet.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-label="Export"
        title="Export"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
          setSheetUrl(null);
          setError(null);
        }}
        className={`inline-grid h-[34px] w-[34px] place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-blue-primary ${
          open ? 'bg-slate-100 text-slate-800' : ''
        }`}
      >
        <Download aria-hidden className="h-[18px] w-[18px]" />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Export"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setOpen(false);
            }
          }}
          className="absolute right-0 top-full z-popover mt-1.5 flex w-[240px] flex-col gap-1 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"
        >
          <button
            type="button"
            role="menuitem"
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
              target="_blank"
              rel="noopener noreferrer"
              className={`${itemClass} font-semibold text-brand-blue-primary`}
              onClick={() => setOpen(false)}
            >
              <ExternalLink aria-hidden className="h-4 w-4" />
              Open sheet
            </a>
          ) : (
            <button
              type="button"
              role="menuitem"
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
      )}
    </div>
  );
};
