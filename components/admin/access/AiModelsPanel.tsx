import React from 'react';
import { Save, Sparkles } from 'lucide-react';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';
import { KNOWN_GEMINI_MODELS } from '@/config/geminiModels';
import {
  AI_MODEL_OPTIONS,
  aiModelLabel,
  modelReadsInputs,
  providerOf,
} from '@/config/aiModels';
import { AI_INTEGRATIONS, type AiIntegration } from '@/config/aiIntegrations';
import { ChecklistSelect } from '@/components/gradebook/settings/ChecklistSelect';
import { useGlobalPermissionsEditor } from './useGlobalPermissionsEditor';
import {
  USAGE_WINDOW_DAYS,
  claudeCost,
  useAiUsageLog,
  type AiIntegrationUsage,
} from './useAiUsageLog';

// Keep in sync with DEFAULT_ADVANCED_MODEL / DEFAULT_STANDARD_MODEL in functions/src/aiModelConfig.ts.
const DEFAULT_ADVANCED_MODEL = 'gemini-3.8-flash';
const DEFAULT_STANDARD_MODEL = 'gemini-3.5-flash-lite';

const GEMINI_IDS: string[] = KNOWN_GEMINI_MODELS.map((m) => m.value);

const FIELD =
  'h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 focus:outline-none focus:border-brand-blue-primary focus:ring-[3px] focus:ring-brand-blue-primary/30';

const formatCount = (n: number): string =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
      ? `${(n / 1_000).toFixed(1)}K`
      : String(n);

const UsageCell: React.FC<{ usage?: AiIntegrationUsage }> = ({ usage }) => {
  if (!usage || usage.calls === 0)
    return <span className="text-sm text-slate-400">No calls</span>;
  const cost = claudeCost(usage);
  const models = Object.entries(usage.byModel)
    .map(([m, n]) => `${aiModelLabel(m)}: ${n}`)
    .join(', ');
  return (
    <span className="text-sm text-slate-600" title={models}>
      {formatCount(usage.calls)} calls ·{' '}
      {formatCount(usage.inputTokens + usage.outputTokens)} tokens
      {cost >= 0.01 && <> · ${cost.toFixed(2)} Claude</>}
      {usage.fallbacks > 0 && (
        <span className="ml-1 font-semibold text-brand-red-primary">
          · {usage.fallbacks} fell back
        </span>
      )}
      {usage.errors > 0 && (
        <span className="ml-1 font-semibold text-brand-red-primary">
          · {usage.errors} failed
        </span>
      )}
    </span>
  );
};

const IntegrationRow: React.FC<{
  integration: AiIntegration;
  value: string;
  tierModel: string;
  allowed: readonly string[];
  usage?: AiIntegrationUsage;
  onChange: (model: string) => void;
}> = ({ integration, value, tierModel, allowed, usage, onChange }) => {
  const options = AI_MODEL_OPTIONS.filter(
    (m) =>
      (allowed.includes(m.id) || m.id === value) &&
      modelReadsInputs(m.id, integration.inputs)
  );
  const unreadable =
    value !== '' && !modelReadsInputs(value, integration.inputs);
  return (
    <div className="grid grid-cols-1 gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_16rem] sm:items-center">
      <div className="min-w-0">
        <p
          className="truncate text-sm font-semibold text-slate-800"
          title={integration.description}
        >
          {integration.label}
        </p>
        <UsageCell usage={usage} />
      </div>
      <select
        aria-label={`Model for ${integration.label}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${FIELD} ${unreadable ? 'border-brand-red-primary' : ''}`}
        title={
          unreadable ? 'This model cannot read this input; Gemini runs it.' : ''
        }
      >
        <option value="">Default ({aiModelLabel(tierModel)})</option>
        {options.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
    </div>
  );
};

/** Admin Settings > Access > AI: allowed models, tier defaults and a model per AI feature. */
export const AiModelsPanel: React.FC = () => {
  const editor = useGlobalPermissionsEditor();
  const { usage, claudeConfigured } = useAiUsageLog();

  if (editor.loading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-600">
        Loading AI settings...
      </div>
    );
  }

  const permission = editor.getPermission('gemini-functions');
  const config = permission.config ?? {};
  const advancedModel =
    typeof config.advancedModel === 'string' ? config.advancedModel : '';
  const standardModel =
    typeof config.standardModel === 'string' ? config.standardModel : '';
  const allowed: string[] = Array.isArray(config.allowedModels)
    ? (config.allowedModels as unknown[]).filter(
        (m): m is string => typeof m === 'string'
      )
    : GEMINI_IDS;
  const integrationModels =
    config.integrationModels && typeof config.integrationModels === 'object'
      ? (config.integrationModels as Record<string, string>)
      : {};

  const setConfig = (patch: Record<string, unknown>) =>
    editor.updatePermission('gemini-functions', {
      config: { ...config, ...patch },
    });

  const setIntegrationModel = (id: string, model: string) => {
    const next = { ...integrationModels };
    if (model) next[id] = model;
    else delete next[id];
    setConfig({ integrationModels: next });
  };

  const toggleAllowed = (id: string, checked: boolean) => {
    const next = checked
      ? [...new Set([...allowed, id])]
      : allowed.filter((m) => m !== id);
    // A model taken off the list stops running everywhere it was picked.
    const remaining = Object.fromEntries(
      Object.entries(integrationModels).filter(([, m]) => next.includes(m))
    );
    setConfig({ allowedModels: next, integrationModels: remaining });
  };

  const tierModel = (tier: AiIntegration['tier']) =>
    tier === 'advanced'
      ? advancedModel || DEFAULT_ADVANCED_MODEL
      : standardModel || DEFAULT_STANDARD_MODEL;

  const groups = [...new Set(AI_INTEGRATIONS.map((i) => i.group))];
  const hasUnsaved = editor.unsavedChanges.has('gemini-functions');
  const isSaving = editor.saving.has('gemini-functions');
  const claudeAllowed = allowed.some((m) => providerOf(m) === 'claude');

  const tierSelect = (
    field: 'advancedModel' | 'standardModel',
    label: string,
    value: string,
    fallback: string
  ) => (
    <label className="block">
      <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-500">
        {label}
      </span>
      <select
        value={value}
        {...tourFieldAttr('admin.gemini.model', 'admin', field)}
        onChange={(e) => setConfig({ [field]: e.target.value })}
        className={FIELD}
      >
        <option value="">Default ({aiModelLabel(fallback)})</option>
        {KNOWN_GEMINI_MODELS.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
        {value !== '' && !GEMINI_IDS.includes(value) && (
          <option value={value}>{value}</option>
        )}
      </select>
    </label>
  );

  return (
    <div className="space-y-4 pb-6">
      <div className="flex items-center gap-3">
        <Sparkles className="h-4 w-4 text-purple-600" aria-hidden />
        <h3 className="flex-1 text-sm font-bold text-slate-800">AI models</h3>
        {claudeAllowed && claudeConfigured === false && (
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
            Claude API key not set, Gemini runs instead
          </span>
        )}
        {claudeConfigured === true && (
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
            Claude API key set
          </span>
        )}
        <button
          type="button"
          onClick={() => void editor.savePermission('gemini-functions')}
          disabled={isSaving || !hasUnsaved}
          aria-label="Save AI models"
          {...tourAttr('admin.gemini.save')}
          className={`rounded-lg p-2 transition-colors disabled:cursor-not-allowed ${
            hasUnsaved
              ? 'bg-orange-600 text-white hover:bg-orange-700'
              : 'text-slate-300'
          }`}
        >
          <Save className="h-4 w-4" />
        </button>
      </div>

      <section className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3">
        <div>
          <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-500">
            Allowed models
          </span>
          <ChecklistSelect
            label="Allowed models"
            options={AI_MODEL_OPTIONS.map((m) => ({
              id: m.id,
              label: m.label,
              note: m.price
                ? `$${m.price.input} / $${m.price.output} per M tokens`
                : undefined,
            }))}
            selected={allowed}
            onToggle={toggleAllowed}
            emptyText="Only the defaults"
            className="w-full"
          />
        </div>
        {tierSelect(
          'advancedModel',
          'Advanced default',
          advancedModel,
          DEFAULT_ADVANCED_MODEL
        )}
        {tierSelect(
          'standardModel',
          'Standard default',
          standardModel,
          DEFAULT_STANDARD_MODEL
        )}
      </section>

      {groups.map((group) => (
        <section key={group} className="space-y-1">
          <h4 className="pt-2 text-xs font-bold uppercase tracking-widest text-slate-500">
            {group}
          </h4>
          <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
            {AI_INTEGRATIONS.filter((i) => i.group === group).map((i) => (
              <IntegrationRow
                key={i.id}
                integration={i}
                value={integrationModels[i.id] ?? ''}
                tierModel={tierModel(i.tier)}
                allowed={allowed}
                usage={usage[i.id]}
                onChange={(model) => setIntegrationModel(i.id, model)}
              />
            ))}
          </div>
        </section>
      ))}
      <p className="text-xs text-slate-500">
        Usage covers the last {USAGE_WINDOW_DAYS} days.
      </p>
    </div>
  );
};
