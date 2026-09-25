import React from 'react';
import { Save, Sparkles } from 'lucide-react';
import type { GlobalFeaturePermission } from '@/types';
import { KNOWN_GEMINI_MODELS } from '@/config/geminiModels';
import { isDeprecatedGeminiModelId } from '@/utils/geminiModelDeprecation';

const GEMINI_MODEL_REGEX = /^gemini-[\w.-]+$/;

// A deprecated-but-well-formed id is shape-valid, so flag it separately — the server discards it and runs the default.
const modelFieldError = (value: string, showCustom: boolean): string | null => {
  if (!showCustom || value === '') return null;
  if (!GEMINI_MODEL_REGEX.test(value)) {
    return 'Must match pattern: gemini-[name] (letters, digits, dots, hyphens, underscores)';
  }
  if (isDeprecatedGeminiModelId(value)) {
    return 'Deprecated model — the server ignores this override and uses the default. Choose a current model.';
  }
  return null;
};

const DEFAULT_ADVANCED_MODEL = 'gemini-3.7-flash';
const DEFAULT_STANDARD_MODEL = 'gemini-3.5-flash-lite';

const GeminiModelConfigSection: React.FC<{
  variant: 'inline' | 'expanded';
  permission: GlobalFeaturePermission;
  onUpdate: (updates: Partial<GlobalFeaturePermission>) => void;
}> = ({ variant, permission, onUpdate }) => {
  const advancedModel = (permission.config?.advancedModel as string) ?? '';
  const standardModel = (permission.config?.standardModel as string) ?? '';

  const isCustomAdvanced =
    advancedModel !== '' &&
    !KNOWN_GEMINI_MODELS.some((m) => m.value === advancedModel);
  const isCustomStandard =
    standardModel !== '' &&
    !KNOWN_GEMINI_MODELS.some((m) => m.value === standardModel);

  const [showCustomAdvanced, setShowCustomAdvanced] =
    React.useState(isCustomAdvanced);
  const [showCustomStandard, setShowCustomStandard] =
    React.useState(isCustomStandard);

  const advancedError = modelFieldError(advancedModel, showCustomAdvanced);
  const standardError = modelFieldError(standardModel, showCustomStandard);

  const handleSelectChange = (
    field: 'advancedModel' | 'standardModel',
    value: string,
    setShowCustom: (v: boolean) => void
  ) => {
    if (value === '__custom__') {
      setShowCustom(true);
      onUpdate({
        config: { ...permission.config, [field]: '' },
      });
    } else {
      setShowCustom(false);
      onUpdate({
        config: { ...permission.config, [field]: value },
      });
    }
  };

  const handleCustomInput = (
    field: 'advancedModel' | 'standardModel',
    value: string
  ) => {
    onUpdate({
      config: { ...permission.config, [field]: value },
    });
  };

  const getSelectValue = (
    currentValue: string,
    showCustom: boolean
  ): string => {
    if (showCustom) return '__custom__';
    if (currentValue === '') return '';
    const known = KNOWN_GEMINI_MODELS.find((m) => m.value === currentValue);
    return known ? currentValue : '__custom__';
  };

  const isInline = variant === 'inline';

  const containerClass = isInline
    ? 'border-t border-slate-100 bg-purple-50 p-4'
    : 'mb-6 p-4 bg-purple-50 rounded-xl border border-purple-100';

  const layoutClass = isInline
    ? 'grid grid-cols-1 sm:grid-cols-2 gap-3'
    : 'space-y-3';

  const inputClass = isInline
    ? 'w-full px-3 py-1.5 border rounded text-xs font-mono focus:outline-none focus:ring-1 focus:ring-purple-500'
    : 'w-full px-3 py-2 border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500';

  const selectClass = isInline
    ? 'w-full px-3 py-1.5 border border-purple-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-purple-500 bg-white'
    : 'w-full px-3 py-2 border border-purple-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white';

  const renderModelField = (
    label: string,
    field: 'advancedModel' | 'standardModel',
    currentValue: string,
    defaultModel: string,
    tier: string,
    showCustom: boolean,
    setShowCustom: (v: boolean) => void,
    error: string | null
  ) => (
    <div>
      <label className="text-xxs font-bold text-purple-700 uppercase tracking-widest mb-1 block">
        {label}
      </label>
      <select
        value={getSelectValue(currentValue, showCustom)}
        onChange={(e) =>
          handleSelectChange(field, e.target.value, setShowCustom)
        }
        className={selectClass}
      >
        <option value="">Default ({defaultModel})</option>
        {KNOWN_GEMINI_MODELS.filter((m) => m.tier === tier).map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
        <option value="__custom__">Custom...</option>
      </select>
      {showCustom && (
        <div className="mt-1.5">
          <input
            type="text"
            placeholder="e.g. gemini-2.5-flash"
            value={currentValue}
            onChange={(e) => handleCustomInput(field, e.target.value)}
            aria-invalid={error !== null}
            className={`${inputClass} ${
              error !== null
                ? 'border-red-400 focus:ring-red-400'
                : 'border-purple-200'
            }`}
          />
          {error !== null && (
            <p className="text-xxs text-red-600 mt-0.5">{error}</p>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className={containerClass}>
      <label className="text-xs font-bold text-purple-700 uppercase tracking-widest mb-2 block">
        Gemini Model Overrides
      </label>
      <div className={layoutClass}>
        {renderModelField(
          'Advanced Model (mini-apps, guided learning)',
          'advancedModel',
          advancedModel,
          DEFAULT_ADVANCED_MODEL,
          'advanced',
          showCustomAdvanced,
          setShowCustomAdvanced,
          advancedError
        )}
        {renderModelField(
          'Standard Model (OCR, polls, quizzes)',
          'standardModel',
          standardModel,
          DEFAULT_STANDARD_MODEL,
          'standard',
          showCustomStandard,
          setShowCustomStandard,
          standardError
        )}
      </div>
    </div>
  );
};

/** AI section header: model overrides stored on `global_permissions/gemini-functions` (plan D10). */
export const GeminiModelsCard: React.FC<{
  permission: GlobalFeaturePermission;
  onUpdate: (updates: Partial<GlobalFeaturePermission>) => void;
  onSave: () => void;
  isSaving: boolean;
  hasUnsaved: boolean;
}> = ({ permission, onUpdate, onSave, isSaving, hasUnsaved }) => (
  <div className="bg-white border border-purple-100 rounded-xl overflow-hidden">
    <div className="flex items-center gap-3 px-4 pt-3">
      <Sparkles className="w-4 h-4 text-purple-600" aria-hidden />
      <h4 className="flex-1 text-sm font-bold text-slate-800">Gemini models</h4>
      <button
        type="button"
        onClick={onSave}
        disabled={isSaving || !hasUnsaved}
        aria-label="Save Gemini models"
        className={`p-2 rounded-lg transition-colors disabled:cursor-not-allowed ${
          hasUnsaved
            ? 'bg-orange-600 hover:bg-orange-700 text-white'
            : 'text-slate-300'
        }`}
      >
        <Save className="w-4 h-4" />
      </button>
    </div>
    <GeminiModelConfigSection
      variant="inline"
      permission={permission}
      onUpdate={onUpdate}
    />
  </div>
);
