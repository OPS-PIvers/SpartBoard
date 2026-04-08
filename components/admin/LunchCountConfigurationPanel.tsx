import React from 'react';
import { LunchCountGlobalConfig } from '@/types';

interface LunchCountConfigurationPanelProps {
  config: LunchCountGlobalConfig | Record<string, unknown>;
  onChange: (newConfig: Record<string, unknown>) => void;
}

export const LunchCountConfigurationPanel: React.FC<
  LunchCountConfigurationPanelProps
> = ({ config: rawConfig, onChange }) => {
  const config = rawConfig as LunchCountGlobalConfig;

  const isSchumannIdMalformed =
    config.schumannSheetId && config.schumannSheetId.includes('/');
  const isIntermediateIdMalformed =
    config.intermediateSheetId && config.intermediateSheetId.includes('/');
  const isUrlMalformed =
    config.submissionUrl && !config.submissionUrl.startsWith('https://');

  return (
    <div className="space-y-4 p-4 bg-white rounded-lg border border-slate-200 shadow-sm">
      <h3 className="text-sm font-bold text-slate-800 mb-2 border-b pb-2">
        Lunch Count Configuration
      </h3>
      <p className="text-xxs text-slate-400 leading-tight">
        Found in the URL: docs.google.com/spreadsheets/d/<b>[ID]</b>/edit
      </p>

      <div className="space-y-3">
        <div>
          <label className="text-xxs font-bold text-slate-500 uppercase mb-1 block">
            Schumann Elementary — Sheet ID
          </label>
          <input
            type="text"
            value={config.schumannSheetId ?? ''}
            onChange={(e) =>
              onChange({
                ...config,
                schumannSheetId: e.target.value.trim(),
              })
            }
            className={`w-full px-2 py-1.5 text-xs font-mono border rounded focus:ring-1 outline-none ${
              isSchumannIdMalformed
                ? 'border-red-300 bg-red-50 focus:ring-red-500'
                : 'border-slate-300 focus:ring-brand-blue-primary'
            }`}
            placeholder="Schumann spreadsheet ID"
          />
          {isSchumannIdMalformed && (
            <p className="text-xxs text-red-600 font-bold mt-1">
              Warning: Enter only the ID, not the full URL.
            </p>
          )}
        </div>

        <div>
          <label className="text-xxs font-bold text-slate-500 uppercase mb-1 block">
            Intermediate School — Sheet ID
          </label>
          <input
            type="text"
            value={config.intermediateSheetId ?? ''}
            onChange={(e) =>
              onChange({
                ...config,
                intermediateSheetId: e.target.value.trim(),
              })
            }
            className={`w-full px-2 py-1.5 text-xs font-mono border rounded focus:ring-1 outline-none ${
              isIntermediateIdMalformed
                ? 'border-red-300 bg-red-50 focus:ring-red-500'
                : 'border-slate-300 focus:ring-brand-blue-primary'
            }`}
            placeholder="Intermediate spreadsheet ID"
          />
          {isIntermediateIdMalformed && (
            <p className="text-xxs text-red-600 font-bold mt-1">
              Warning: Enter only the ID, not the full URL.
            </p>
          )}
        </div>

        <div>
          <label className="text-xxs font-bold text-slate-500 uppercase mb-1 block">
            Submission URL (Apps Script)
          </label>
          <input
            type="text"
            value={config.submissionUrl ?? ''}
            onChange={(e) =>
              onChange({
                ...config,
                submissionUrl: e.target.value.trim(),
              })
            }
            className={`w-full px-2 py-1.5 text-xs font-mono border rounded focus:ring-1 outline-none ${
              isUrlMalformed
                ? 'border-red-300 bg-red-50 focus:ring-red-500'
                : 'border-slate-300 focus:ring-brand-blue-primary'
            }`}
            placeholder="https://script.google.com/macros/s/.../exec"
          />
          {isUrlMalformed && (
            <p className="text-xxs text-red-600 font-bold mt-1">
              Warning: URL must start with https://
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
