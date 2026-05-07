import React from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, FileSpreadsheet } from 'lucide-react';
import { Plc } from '@/types';

interface SharedSheetTileProps {
  plc: Plc;
}

/** Defense-in-depth — only render the sheet URL as a link if it's http/https. */
function isSafeHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export const SharedSheetTile: React.FC<SharedSheetTileProps> = ({ plc }) => {
  const { t } = useTranslation();
  const url = plc.sharedSheetUrl ?? null;
  const safeUrl = url && isSafeHttpUrl(url) ? url : null;

  return (
    <div className="h-full p-4 flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-green-100 flex items-center justify-center">
          <FileSpreadsheet className="w-3.5 h-3.5 text-green-600" />
        </div>
        <h4 className="text-xxs font-bold uppercase tracking-widest text-slate-500">
          {t('plcDashboard.overview.tiles.sharedSheet.heading', {
            defaultValue: 'Shared sheet',
          })}
        </h4>
      </div>

      {safeUrl ? (
        <div className="flex flex-col gap-2 flex-1 justify-between">
          <p className="text-xxs text-slate-500 leading-relaxed">
            {t('plcDashboard.overview.tiles.sharedSheet.connectedHint', {
              defaultValue:
                'Aggregated PLC results land in this Google Sheet. All members can open it.',
            })}
          </p>
          <a
            href={safeUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-green-50 hover:bg-green-100 text-green-700 text-xxs font-bold uppercase tracking-wider rounded-lg transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            {t('plcDashboard.overview.tiles.sharedSheet.open', {
              defaultValue: 'Open sheet',
            })}
          </a>
        </div>
      ) : (
        <div className="flex flex-col gap-2 flex-1 justify-between">
          <p className="text-xxs text-slate-500 leading-relaxed">
            {t('plcDashboard.overview.tiles.sharedSheet.unsetHint', {
              defaultValue:
                'No shared sheet yet — it will be created automatically when the first PLC quiz is run.',
            })}
          </p>
          <span className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-50 text-slate-400 text-xxs font-bold uppercase tracking-wider rounded-lg cursor-not-allowed">
            {t('plcDashboard.overview.tiles.sharedSheet.notReady', {
              defaultValue: 'Not yet created',
            })}
          </span>
        </div>
      )}
    </div>
  );
};
