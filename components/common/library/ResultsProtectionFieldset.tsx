import React, { useState } from 'react';
import {
  RESULTS_PROTECTION_DEFAULTS,
  RESULTS_TAB_WARNING_THRESHOLD_MAX,
  RESULTS_TAB_WARNING_THRESHOLD_MIN,
  type ResultsProtection,
} from '@/types';
import { tourAttr } from '@/config/tourAnchors';

const clampThreshold = (raw: string): number | null => {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(
    RESULTS_TAB_WARNING_THRESHOLD_MAX,
    Math.max(RESULTS_TAB_WARNING_THRESHOLD_MIN, parsed)
  );
};

interface ResultsProtectionFieldsetProps {
  value: ResultsProtection;
  onChange: (next: ResultsProtection) => void;
  disabled?: boolean;
}

/** Watermark and tab-switch lockout options for a results publish. */
export const ResultsProtectionFieldset: React.FC<
  ResultsProtectionFieldsetProps
> = ({ value, onChange, disabled = false }) => {
  // Raw text so the field can be briefly empty while typing; valid input is clamped as it lands.
  const [thresholdText, setThresholdText] = useState(() =>
    String(value.tabWarningThreshold)
  );

  const handleThresholdChange = (raw: string) => {
    setThresholdText(raw);
    const clamped = clampThreshold(raw);
    if (clamped !== null) onChange({ ...value, tabWarningThreshold: clamped });
  };

  const handleThresholdBlur = () => {
    const next =
      clampThreshold(thresholdText) ??
      RESULTS_PROTECTION_DEFAULTS.tabWarningThreshold;
    onChange({ ...value, tabWarningThreshold: next });
    setThresholdText(String(next));
  };

  return (
    <fieldset className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 space-y-2">
      <legend className="px-1 text-xs font-bold uppercase tracking-wide text-slate-500">
        Protection
      </legend>
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={value.watermarkEnabled}
          onChange={(e) =>
            onChange({ ...value, watermarkEnabled: e.target.checked })
          }
          disabled={disabled}
          {...tourAttr('assign-results-protection.watermark')}
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-blue-primary focus:ring-brand-blue-primary/40"
        />
        <span className="flex-1">
          <span className="block text-sm font-semibold text-slate-900">
            Watermark
          </span>
          <span className="block text-xs text-slate-600 leading-relaxed">
            Adds the student&apos;s name and publish time to each page.
          </span>
        </span>
      </label>
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={value.tabWarningEnabled}
          onChange={(e) => {
            onChange({ ...value, tabWarningEnabled: e.target.checked });
            if (e.target.checked)
              setThresholdText(String(value.tabWarningThreshold));
          }}
          disabled={disabled}
          {...tourAttr('assign-results-protection.tab-warning')}
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-blue-primary focus:ring-brand-blue-primary/40"
        />
        <span className="flex-1">
          <span className="block text-sm font-semibold text-slate-900">
            Tab-switch warning
          </span>
          <span className="block text-xs text-slate-600 leading-relaxed">
            Locks the results after the set number of warnings.
          </span>
        </span>
      </label>
      {value.tabWarningEnabled && (
        <label className="flex items-center gap-3 pl-7">
          <span className="text-xs text-slate-700">
            Warnings before lockout
          </span>
          <input
            type="number"
            min={RESULTS_TAB_WARNING_THRESHOLD_MIN}
            max={RESULTS_TAB_WARNING_THRESHOLD_MAX}
            value={thresholdText}
            onChange={(e) => handleThresholdChange(e.target.value)}
            onBlur={handleThresholdBlur}
            {...tourAttr('assign-results-protection.threshold')}
            disabled={disabled}
            className="w-16 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
          />
        </label>
      )}
    </fieldset>
  );
};
