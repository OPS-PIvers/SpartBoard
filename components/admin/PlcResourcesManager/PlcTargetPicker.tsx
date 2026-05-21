import React from 'react';
import { useTranslation } from 'react-i18next';
import { usePlcs } from '@/hooks/usePlcs';
import { PlcResourceScope } from '@/types';

export interface PlcTargetPickerValue {
  scope: PlcResourceScope;
  plcIds: string[];
}

interface PlcTargetPickerProps {
  value: PlcTargetPickerValue;
  onChange: (v: PlcTargetPickerValue) => void;
  disabled?: boolean;
}

/**
 * Radio: "All PLCs" vs "Selected PLCs" + a multi-select list.
 * Admins can read /plcs per Wave-1 rule change.
 */
export const PlcTargetPicker: React.FC<PlcTargetPickerProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  const { t } = useTranslation();
  // Admin read mode: subscribe to the whole /plcs collection so an admin who
  // isn't a member of every PLC still sees them all in the picker. The
  // membership-scoped default would silently return an empty list here.
  const { plcs, loading, error } = usePlcs({ asAdmin: true });

  const handleScopeChange = (scope: PlcResourceScope) => {
    onChange({
      scope,
      plcIds: scope === 'all' ? [] : value.plcIds,
    });
  };

  const togglePlc = (plcId: string) => {
    const next = value.plcIds.includes(plcId)
      ? value.plcIds.filter((id) => id !== plcId)
      : [...value.plcIds, plcId];
    onChange({ ...value, plcIds: next });
  };

  return (
    <div className="space-y-3">
      <fieldset disabled={disabled}>
        <legend className="text-sm font-semibold text-slate-700 mb-2">
          {t('plcDashboard.resources.targetLabel', { defaultValue: 'Push to' })}
        </legend>

        {/* All PLCs radio */}
        <label className="flex items-center gap-2 cursor-pointer mb-2">
          <input
            type="radio"
            name="plc-resource-scope"
            value="all"
            checked={value.scope === 'all'}
            onChange={() => handleScopeChange('all')}
            className="accent-brand-blue-primary"
            aria-label={t('plcDashboard.resources.scopeAll', {
              defaultValue: 'All PLCs',
            })}
          />
          <span className="text-sm text-slate-700">
            {t('plcDashboard.resources.scopeAll', { defaultValue: 'All PLCs' })}
          </span>
        </label>

        {/* Selected PLCs radio */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name="plc-resource-scope"
            value="selected"
            checked={value.scope === 'selected'}
            onChange={() => handleScopeChange('selected')}
            className="accent-brand-blue-primary"
            aria-label={t('plcDashboard.resources.scopeSelected', {
              defaultValue: 'Selected PLCs',
            })}
          />
          <span className="text-sm text-slate-700">
            {t('plcDashboard.resources.scopeSelected', {
              defaultValue: 'Selected PLCs',
            })}
          </span>
        </label>
      </fieldset>

      {/* PLC multi-select — only shown when scope is 'selected' */}
      {value.scope === 'selected' && (
        <div className="ml-6 mt-2">
          {loading ? (
            <p className="text-xs text-slate-400 italic">
              {t('plcDashboard.resources.loadingPlcs', {
                defaultValue: 'Loading PLCs…',
              })}
            </p>
          ) : error ? (
            /* Render a load-failure message instead of the misleading
               "No PLCs available" empty state — an empty list on error
               doesn't mean there are no PLCs, just that we couldn't read
               them. */
            <p className="text-xs text-brand-red-primary" role="alert">
              {t('plcDashboard.resources.loadPlcsError', {
                defaultValue: "Couldn't load PLCs. Please try again.",
              })}
            </p>
          ) : plcs.length === 0 ? (
            <p className="text-xs text-slate-400 italic">
              {t('plcDashboard.resources.noPlcs', {
                defaultValue: 'No PLCs available.',
              })}
            </p>
          ) : (
            <div
              className="flex flex-col gap-1 max-h-40 overflow-y-auto border border-slate-200 rounded-lg p-2 bg-white"
              role="group"
              aria-label={t('plcDashboard.resources.selectPlcGroup', {
                defaultValue: 'Select PLCs',
              })}
            >
              {plcs.map((plc) => {
                const checked = value.plcIds.includes(plc.id);
                return (
                  <label
                    key={plc.id}
                    className="flex items-center gap-2 cursor-pointer py-0.5"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => togglePlc(plc.id)}
                      className="accent-brand-blue-primary"
                      aria-label={plc.name}
                    />
                    <span className="text-sm text-slate-700">{plc.name}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
