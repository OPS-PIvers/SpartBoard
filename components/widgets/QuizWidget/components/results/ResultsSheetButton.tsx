// Export to Sheets, then Open Sheet, for a results footer; pairs with useResultsSheetExport.
import React from 'react';
import { ExternalLink, FileSpreadsheet, Loader2 } from 'lucide-react';
import type { ResultsSheetExport } from '@/hooks/useResultsSheetExport';
import type { TourAnchorAttrs } from '@/config/tourAnchors';

type Anchor = TourAnchorAttrs;

interface Props {
  sheet: ResultsSheetExport;
  disabled?: boolean;
  exportAnchor: Anchor;
  openAnchor: Anchor;
  className: string;
  style: React.CSSProperties;
  iconStyle: React.CSSProperties;
  iconClassName?: string;
}

export const ResultsSheetButton: React.FC<Props> = ({
  sheet,
  disabled = false,
  exportAnchor,
  openAnchor,
  className,
  style,
  iconStyle,
  iconClassName,
}) => {
  if (!sheet.available) return null;
  return (
    <>
      {sheet.exportError && (
        <span
          role="alert"
          className="min-w-0 font-sans font-semibold text-brand-red-primary"
          style={{ fontSize: 'min(11px, 3.8cqmin)' }}
        >
          {sheet.exportError}
        </span>
      )}
      {sheet.exportUrl ? (
        <a
          href={sheet.exportUrl}
          target="_blank"
          rel="noopener noreferrer"
          {...openAnchor}
          className={className}
          style={style}
        >
          <ExternalLink
            aria-hidden
            className={iconClassName}
            style={iconStyle}
          />
          Open Sheet
        </a>
      ) : (
        <button
          type="button"
          onClick={() => void sheet.run()}
          disabled={disabled || sheet.exporting || sheet.locked}
          title={sheet.lockedTitle}
          {...exportAnchor}
          className={className}
          style={style}
        >
          {sheet.exporting ? (
            <Loader2
              aria-hidden
              className={`animate-spin ${iconClassName ?? ''}`}
              style={iconStyle}
            />
          ) : (
            <FileSpreadsheet
              aria-hidden
              className={iconClassName}
              style={iconStyle}
            />
          )}
          Export to Sheets
        </button>
      )}
    </>
  );
};
