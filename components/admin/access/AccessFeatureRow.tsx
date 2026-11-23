import React, { useState } from 'react';
import { tourFieldAttr } from '@/config/tourAnchors';
import { ChevronDown, Globe, Save, Shield, Users } from 'lucide-react';
import type {
  AccessLevel,
  GlobalFeature,
  GlobalFeaturePermission,
} from '@/types';
import { FEATURE_DEFAULTS } from '@/config/featureDefaults';
import { Toggle } from '@/components/common/Toggle';
import { handleRadioGroupKeyDown } from '@/components/common/radioGroupKeyNav';
import { BetaUsersPanel } from '@/components/admin/BetaUsersPanel';
import { MinTierSelect } from '@/components/admin/MinTierSelect';
import { PermissionBuildingMultiSelect } from '@/components/admin/PermissionBuildingMultiSelect';
import {
  ADMIN_LIMITED_FEATURES,
  DAILY_LIMIT_NOTES,
  EXTRA_DAILY_LIMITS,
  GEMINI_FEATURES,
  MONTHLY_CAPS,
  defaultDailyLimit,
  type ExtraDailyLimit,
  type MonthlyCap,
  DEFAULT_MODEL_TIER,
  MODEL_TIER_FEATURES,
  type AiModelTier,
} from './useGlobalPermissionsEditor';
import { useSpeechToTextMonthlyUsage } from './useSpeechToTextMonthlyUsage';
import {
  SPEECH_AI_TRANSCRIPTION_FEATURE,
  SPEECH_ROW_KEYS,
} from '@/config/speechToText';
import {
  DEFAULT_OTHER_CAUSES,
  INPUT_SIGNALS_FEATURE,
} from '@/utils/inputSignals';
import {
  INPUT_SIGNS,
  OTHER_CAUSES_MAX,
  readInputSignSettings,
  type InputSignId,
  type InputSignSetting,
  type InputSignSettings,
} from '@/utils/inputSignalSettings';

const LEVELS: { level: AccessLevel; label: string; Icon: typeof Shield }[] = [
  { level: 'admin', label: 'Admin', Icon: Shield },
  { level: 'beta', label: 'Beta', Icon: Users },
  { level: 'public', label: 'Public', Icon: Globe },
];

const LEVEL_ACTIVE: Record<AccessLevel, string> = {
  admin: 'bg-brand-blue-lighter text-brand-blue-dark border-brand-blue-light',
  beta: 'bg-sky-50 text-sky-800 border-sky-300',
  public: 'bg-green-100 text-green-700 border-green-300',
};

const TIER_CHIP: Record<string, string> = {
  free: 'Free tier',
  org: 'Org tier',
  internal: 'Internal tier',
};

export const Chip: React.FC<{
  tone?: 'slate' | 'amber' | 'green';
  children: React.ReactNode;
}> = ({ tone = 'slate', children }) => (
  <span
    className={`shrink-0 px-1.5 py-0.5 rounded text-xxs font-bold border ${
      tone === 'amber'
        ? 'bg-amber-50 border-amber-200 text-amber-800'
        : tone === 'green'
          ? 'bg-green-50 border-green-200 text-green-800'
          : 'bg-slate-50 border-slate-200 text-slate-600'
    }`}
  >
    {children}
  </span>
);

/** Summary chips for a collapsed row: targeting, testers, limits. */
const permissionChips = (
  featureId: GlobalFeature,
  permission: GlobalFeaturePermission,
  isSaved: boolean
): React.ReactNode[] => {
  const chips: React.ReactNode[] = [];
  if (!isSaved)
    chips.push(
      <Chip key="unsaved" tone="amber">
        Not saved
      </Chip>
    );
  const buildings = permission.buildings?.length ?? 0;
  if (buildings > 0)
    chips.push(
      <Chip key="b">
        {buildings} building{buildings === 1 ? '' : 's'}
      </Chip>
    );
  if (permission.minTier)
    chips.push(<Chip key="t">{TIER_CHIP[permission.minTier]}</Chip>);
  if (permission.accessLevel === 'beta')
    chips.push(
      <Chip key="beta">
        {permission.betaUsers.length} tester
        {permission.betaUsers.length === 1 ? '' : 's'}
      </Chip>
    );
  const excluded = permission.excludedUsers?.length ?? 0;
  if (excluded > 0) chips.push(<Chip key="excluded">{excluded} excluded</Chip>);
  if (GEMINI_FEATURES.includes(featureId)) {
    const on = (permission.config?.dailyLimitEnabled as boolean) ?? true;
    const limit =
      (permission.config?.dailyLimit as number) ?? defaultDailyLimit(featureId);
    chips.push(
      <Chip key="limit">{on ? `Limit ${limit}/day` : 'No limit'}</Chip>
    );
  }
  return chips;
};

export const AccessLevelPicker: React.FC<{
  value: AccessLevel;
  onChange: (level: AccessLevel) => void;
  label: string;
  anchorKey?: string;
}> = ({ value, onChange, label, anchorKey }) => (
  <div
    {...(anchorKey
      ? tourFieldAttr('admin.access.level', 'admin', anchorKey)
      : {})}
    role="radiogroup"
    aria-label={`${label} access`}
    className="flex gap-1"
    onKeyDown={(e) =>
      handleRadioGroupKeyDown(e, LEVELS, (opt) => onChange(opt.level))
    }
  >
    {LEVELS.map(({ level, label: text, Icon }) => (
      <button
        // no-tour-anchor: option buttons of the radiogroup that carries the access level anchor
        key={level}
        type="button"
        role="radio"
        aria-checked={value === level}
        tabIndex={value === level ? 0 : -1}
        onClick={() => onChange(level)}
        className={`px-2 py-1 @max-2xl:py-2 @max-2xl:px-2.5 rounded-md border text-xs font-medium flex items-center gap-1 transition-colors ${
          value === level
            ? LEVEL_ACTIVE[level]
            : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
        }`}
      >
        <Icon className="w-3.5 h-3.5" aria-hidden />
        <span className="hidden sm:inline @max-2xl:inline">{text}</span>
      </button>
    ))}
  </div>
);

const DAILY_LIMIT_MIN = 1;
const DAILY_LIMIT_MAX = 1000;

export const DailyLimitEditor: React.FC<{
  featureId: GlobalFeature;
  permission: GlobalFeaturePermission;
  onUpdate: (updates: Partial<GlobalFeaturePermission>) => void;
  extra?: ExtraDailyLimit;
}> = ({ featureId, permission, onUpdate, extra }) => {
  const limitKey = extra?.limitKey ?? 'dailyLimit';
  const enabledKey = extra?.enabledKey ?? 'dailyLimitEnabled';
  const enabled = (permission.config?.[enabledKey] as boolean) ?? true;
  const label = extra
    ? `${FEATURE_DEFAULTS[featureId].label} ${extra.title.toLowerCase()}`
    : FEATURE_DEFAULTS[featureId].label;
  const rowKey = extra ? `${featureId}-${limitKey}` : featureId;
  const stored =
    (permission.config?.[limitKey] as number) ??
    extra?.defaultValue ??
    defaultDailyLimit(featureId);
  // Raw text while editing so the field can be emptied; null shows the stored value.
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
        {extra?.title ?? 'Daily limit'}
      </span>
      <Toggle
        checked={enabled}
        onChange={(checked) =>
          onUpdate({
            config: { ...permission.config, [enabledKey]: checked },
          })
        }
        size="xs"
        label={`${label} daily limit`}
        anchor={tourFieldAttr(
          'admin.features.daily-limit-toggle',
          'admin',
          rowKey
        )}
      />
      <input
        type="number"
        min={DAILY_LIMIT_MIN}
        max={DAILY_LIMIT_MAX}
        disabled={!enabled}
        aria-label={`${label} uses per day`}
        {...tourFieldAttr('admin.features.daily-limit-number', 'admin', rowKey)}
        value={draft ?? stored}
        onChange={(e) => {
          const raw = e.target.value;
          const val = parseInt(raw, 10);
          if (!Number.isFinite(val)) {
            setDraft(raw);
            return;
          }
          const clamped = Math.min(
            DAILY_LIMIT_MAX,
            Math.max(DAILY_LIMIT_MIN, val)
          );
          setDraft(clamped === val ? raw : String(clamped));
          onUpdate({
            config: { ...permission.config, [limitKey]: clamped },
          });
        }}
        onBlur={() => setDraft(null)}
        className="w-20 px-2 py-1 border border-slate-200 rounded-lg text-sm font-mono focus:outline-hidden focus:ring-2 focus:ring-brand-blue-primary disabled:opacity-50"
      />
      <span className="text-xs text-slate-500">
        {extra?.note ??
          DAILY_LIMIT_NOTES[featureId] ??
          (ADMIN_LIMITED_FEATURES.includes(featureId)
            ? 'per day. Admins included.'
            : 'per day. Admins are unlimited.')}
      </span>
    </div>
  );
};

export const ModelTierEditor: React.FC<{
  featureId: GlobalFeature;
  permission: GlobalFeaturePermission;
  onUpdate: (updates: Partial<GlobalFeaturePermission>) => void;
}> = ({ featureId, permission, onUpdate }) => {
  const tier =
    (permission.config?.modelTier as AiModelTier | undefined) ??
    DEFAULT_MODEL_TIER;
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <label
        htmlFor={`${featureId}-model-tier`}
        className="text-xs font-bold text-slate-500 uppercase tracking-widest"
      >
        Model
      </label>
      <select
        id={`${featureId}-model-tier`}
        {...tourFieldAttr('admin.features.model-tier', 'admin', featureId)}
        value={tier}
        onChange={(e) =>
          onUpdate({
            config: {
              ...permission.config,
              modelTier: e.target.value,
            },
          })
        }
        className="px-2 py-1 border border-slate-200 rounded-lg text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-brand-blue-primary"
      >
        <option value="standard">Standard</option>
        <option value="advanced">Advanced</option>
      </select>
    </div>
  );
};

const MONTHLY_CAP_MAX = 1_000_000;

/** A district-wide monthly limit and this month's use, e.g. minutes of AI transcription. */
export const MonthlyCapEditor: React.FC<{
  featureId: GlobalFeature;
  permission: GlobalFeaturePermission;
  onUpdate: (updates: Partial<GlobalFeaturePermission>) => void;
  cap: MonthlyCap;
}> = ({ featureId, permission, onUpdate, cap }) => {
  const usage = useSpeechToTextMonthlyUsage();
  const saved = permission.config?.[cap.capKey];
  const stored = Math.round(
    (typeof saved === 'number' ? saved : cap.defaultValue) / cap.perUnit
  );
  // Raw text while editing so the field can be emptied; null shows the stored value.
  const [draft, setDraft] = useState<string | null>(null);
  const used = usage ? Math.round(usage[cap.usageField] / cap.perUnit) : null;
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
        Monthly limit
      </span>
      <input
        type="number"
        min={0}
        max={MONTHLY_CAP_MAX}
        aria-label={`${FEATURE_DEFAULTS[featureId].label} monthly limit, ${cap.unit}`}
        {...tourFieldAttr(
          'admin.features.monthly-cap-number',
          'admin',
          featureId
        )}
        value={draft ?? stored}
        onChange={(e) => {
          const raw = e.target.value;
          const val = parseInt(raw, 10);
          if (!Number.isFinite(val)) {
            setDraft(raw);
            return;
          }
          const clamped = Math.min(MONTHLY_CAP_MAX, Math.max(0, val));
          setDraft(clamped === val ? raw : String(clamped));
          onUpdate({
            config: {
              ...permission.config,
              [cap.capKey]: clamped * cap.perUnit,
            },
          });
        }}
        onBlur={() => setDraft(null)}
        className="w-24 px-2 py-1 border border-slate-200 rounded-lg text-sm font-mono focus:outline-hidden focus:ring-2 focus:ring-brand-blue-primary"
      />
      <span className="text-xs text-slate-500">
        {cap.unit} for the whole district.
        {used !== null &&
          ` ${used.toLocaleString()} of ${stored.toLocaleString()} ${cap.shortUnit} this month.`}
      </span>
    </div>
  );
};

/** Exact words or Smart, for the Gemini 3.5 Transcribe model. */
export const TranscribeModeEditor: React.FC<{
  featureId: GlobalFeature;
  permission: GlobalFeaturePermission;
  onUpdate: (updates: Partial<GlobalFeaturePermission>) => void;
}> = ({ featureId, permission, onUpdate }) => {
  const mode =
    permission.config?.[SPEECH_ROW_KEYS.transcribeMode] === 'smart'
      ? 'smart'
      : 'verbatim';
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <label
        htmlFor={`${featureId}-transcribe-mode`}
        className="text-xs font-bold text-slate-500 uppercase tracking-widest"
      >
        Transcription mode
      </label>
      <select
        id={`${featureId}-transcribe-mode`}
        {...tourFieldAttr('admin.features.transcribe-mode', 'admin', featureId)}
        value={mode}
        onChange={(e) =>
          onUpdate({
            config: {
              ...permission.config,
              [SPEECH_ROW_KEYS.transcribeMode]: e.target.value,
            },
          })
        }
        className="px-2 py-1 border border-slate-200 rounded-lg text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-brand-blue-primary"
      >
        <option value="verbatim">Exact words</option>
        <option value="smart">Smart</option>
      </select>
      <span className="text-xs text-slate-500">
        Only used with the Gemini 3.5 Transcribe model. Smart adds punctuation
        but also fixes grammar and drops repeated words.
      </span>
    </div>
  );
};

const SIGN_GROUPS = [...new Set(INPUT_SIGNS.map((s) => s.group))];

/** One switch and one "Could also be" line per unusual-input sign; off hides it from teachers but keeps recording. */
export const InputSignsEditor: React.FC<{
  permission: GlobalFeaturePermission;
  onUpdate: (updates: Partial<GlobalFeaturePermission>) => void;
}> = ({ permission, onUpdate }) => {
  const settings = readInputSignSettings([permission]);
  // Raw text while a box is being edited, so it can be emptied and retyped.
  const [drafts, setDrafts] = useState<Partial<Record<InputSignId, string>>>(
    {}
  );
  const update = (id: InputSignId, next: InputSignSetting) => {
    const signs: InputSignSettings = { ...settings };
    const entry: InputSignSetting = {};
    if (next.off) entry.off = true;
    if (next.otherCauses !== undefined) entry.otherCauses = next.otherCauses;
    if (entry.off || entry.otherCauses) signs[id] = entry;
    else delete signs[id];
    onUpdate({ config: { ...permission.config, signs } });
  };
  return (
    <div className="space-y-3">
      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
        Signs
      </p>

      {SIGN_GROUPS.map((group) => (
        <div key={group} className="divide-y divide-slate-200">
          <p className="pb-1 text-xxs font-bold text-slate-500 uppercase tracking-wider">
            {group}
          </p>
          {INPUT_SIGNS.filter((s) => s.group === group).map(({ id, label }) => {
            const s = settings[id] ?? {};
            const causes =
              id === 'writing-playback' ? null : DEFAULT_OTHER_CAUSES[id];
            return (
              <div
                key={id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2"
              >
                <span
                  className="flex shrink-0"
                  title="Off hides this sign from teachers but keeps recording it."
                >
                  <Toggle
                    checked={s.off !== true}
                    onChange={(checked) => update(id, { ...s, off: !checked })}
                    size="sm"
                    label={`${label} shown to teachers`}
                    anchor={tourFieldAttr(
                      'admin.features.input-sign-toggle',
                      'admin',
                      id
                    )}
                  />
                </span>
                <span className="w-64 shrink-0 text-sm text-slate-700">
                  {label}
                </span>
                {causes !== null && (
                  <input
                    type="text"
                    maxLength={OTHER_CAUSES_MAX}
                    aria-label={`${label}: could also be`}
                    {...tourFieldAttr(
                      'admin.features.input-sign-text',
                      'admin',
                      id
                    )}
                    value={drafts[id] ?? s.otherCauses ?? causes}
                    onChange={(e) => {
                      const text = e.target.value;
                      setDrafts((d) => ({ ...d, [id]: text }));
                      const trimmed = text.trim();
                      update(id, {
                        ...s,
                        otherCauses:
                          !trimmed || trimmed === causes ? undefined : trimmed,
                      });
                    }}
                    onBlur={() =>
                      setDrafts((d) => {
                        const { [id]: _, ...rest } = d;
                        return rest;
                      })
                    }
                    title={
                      'The "Could also be" line teachers see under this sign'
                    }
                    className="min-w-48 flex-1 px-2 py-1 border border-slate-200 rounded-lg text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-brand-blue-primary"
                  />
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};

/** The row's always-visible part: one line when wide, stacked when narrow (phones). */
const AccessRowHeader: React.FC<{
  featureId: GlobalFeature;
  label: string;
  icon: React.ReactNode;
  chips: React.ReactNode[];
  status: React.ReactNode;
  expanded: boolean;
  onToggleExpanded: () => void;
  panelId: string;
  lead?: React.ReactNode;
  toggle: React.ReactNode;
  picker: React.ReactNode;
  save: React.ReactNode;
}> = ({
  featureId,
  label,
  icon,
  chips,
  status,
  expanded,
  onToggleExpanded,
  panelId,
  lead,
  toggle,
  picker,
  save,
}) => (
  <div className="flex flex-wrap @2xl:flex-nowrap items-center gap-x-3 gap-y-2 p-3 hover:bg-slate-50 transition-colors">
    <button
      type="button"
      onClick={onToggleExpanded}
      aria-expanded={expanded}
      aria-controls={panelId}
      {...tourFieldAttr('admin.access.expand', 'admin', featureId)}
      className="order-1 flex items-center gap-3 min-w-0 flex-1 text-left"
    >
      <span className="bg-brand-blue-lighter p-2 rounded-lg text-brand-blue-primary shrink-0">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 flex-wrap">
          <span className="font-bold text-slate-800 text-sm">{label}</span>
          {chips}
        </span>
        <span className="block text-xs @2xl:text-xxs text-slate-500 @2xl:truncate">
          {status}
        </span>
      </span>
      <ChevronDown
        className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
        aria-hidden
      />
    </button>
    {/* Narrow: the switch sits on the name line, like iOS Settings. */}
    <span className="order-2 @2xl:order-3 flex shrink-0">{toggle}</span>
    <div className="order-3 basis-full flex flex-wrap items-center gap-x-3 gap-y-2 pl-11 @2xl:contents">
      <span className="flex items-center gap-3 empty:hidden @2xl:order-2">
        {lead}
      </span>
      <span className="flex @2xl:order-4">{picker}</span>
      <span className="flex ml-auto @2xl:ml-0 @2xl:order-5">{save}</span>
    </div>
  </div>
);

interface AccessFeatureRowProps {
  featureId: GlobalFeature;
  permission: GlobalFeaturePermission;
  isSaved: boolean;
  isSaving: boolean;
  hasUnsaved: boolean;
  onUpdate: (updates: Partial<GlobalFeaturePermission>) => void;
  onSave: () => void;
  showMessage: (type: 'success' | 'error', text: string) => void;
  /** Rendered before the enabled toggle, e.g. a district switch. */
  lead?: React.ReactNode;
  /** Extra chips after the permission chips. */
  extraChips?: React.ReactNode[];
  /** A line under the name, e.g. who it is live for. */
  status?: React.ReactNode;
  /** Extra expanded content. */
  children?: React.ReactNode;
  /** Shorter name shown on the row, e.g. inside a group. */
  displayLabel?: string;
  /** Start expanded, e.g. when a search matched a nested row. */
  defaultExpanded?: boolean;
}

/** One collapsed line per feature; expands for targeting and limits (plan D8). */
export const AccessFeatureRow: React.FC<AccessFeatureRowProps> = ({
  featureId,
  permission,
  isSaved,
  isSaving,
  hasUnsaved,
  onUpdate,
  onSave,
  showMessage,
  lead,
  extraChips = [],
  status,
  children,
  displayLabel,
  defaultExpanded = false,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [prevDefault, setPrevDefault] = useState(defaultExpanded);
  if (prevDefault !== defaultExpanded) {
    setPrevDefault(defaultExpanded);
    if (defaultExpanded) setExpanded(true);
  }
  const def = FEATURE_DEFAULTS[featureId];
  const Icon = def.icon;
  const panelId = `access-row-${featureId}`;
  return (
    <div
      data-testid={`access-row-${featureId}`}
      className="bg-white @container"
    >
      <AccessRowHeader
        featureId={featureId}
        label={displayLabel ?? def.label}
        icon={<Icon className="w-4 h-4" aria-hidden />}
        chips={[
          ...permissionChips(featureId, permission, isSaved),
          ...extraChips,
        ]}
        status={status ?? def.description}
        expanded={expanded}
        onToggleExpanded={() => setExpanded((v) => !v)}
        panelId={panelId}
        lead={lead}
        toggle={
          <Toggle
            checked={permission.enabled}
            onChange={(checked) => onUpdate({ enabled: checked })}
            size="sm"
            label={`${def.label} enabled`}
            anchor={tourFieldAttr('admin.access.enabled', 'admin', featureId)}
          />
        }
        picker={
          <AccessLevelPicker
            value={permission.accessLevel}
            onChange={(accessLevel) => onUpdate({ accessLevel })}
            label={def.label}
            anchorKey={featureId}
          />
        }
        save={
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving || !hasUnsaved}
            aria-label={`Save ${def.label}`}
            {...tourFieldAttr('admin.access.save', 'admin', featureId)}
            title={hasUnsaved ? 'Save changes' : 'No changes to save'}
            className={`relative touch-target-expand p-2 rounded-lg transition-colors disabled:cursor-not-allowed ${
              hasUnsaved
                ? 'bg-orange-600 hover:bg-orange-700 text-white'
                : 'text-slate-300'
            }`}
          >
            <Save className="w-4 h-4" />
          </button>
        }
      />
      {expanded && (
        <div
          id={panelId}
          className="border-t border-slate-100 bg-slate-50 p-4 space-y-4"
        >
          {status && (
            <p className="text-xs text-slate-500">{def.description}</p>
          )}
          <PermissionBuildingMultiSelect
            label="Restrict to buildings"
            selectedIds={permission.buildings ?? []}
            onChange={(buildings) => onUpdate({ buildings })}
          />
          <MinTierSelect
            value={permission.minTier}
            onChange={(minTier) => onUpdate({ minTier })}
          />
          {permission.accessLevel === 'beta' && (
            <BetaUsersPanel
              betaUsers={permission.betaUsers}
              onChange={(betaUsers) => onUpdate({ betaUsers })}
              showMessage={showMessage}
              variant="expanded"
            />
          )}
          <BetaUsersPanel
            kind="excluded"
            betaUsers={permission.excludedUsers ?? []}
            onChange={(excludedUsers) => onUpdate({ excludedUsers })}
            showMessage={showMessage}
            variant="expanded"
          />
          {GEMINI_FEATURES.includes(featureId) && (
            <DailyLimitEditor
              featureId={featureId}
              permission={permission}
              onUpdate={onUpdate}
            />
          )}
          {EXTRA_DAILY_LIMITS[featureId] && (
            <DailyLimitEditor
              featureId={featureId}
              permission={permission}
              onUpdate={onUpdate}
              extra={EXTRA_DAILY_LIMITS[featureId]}
            />
          )}
          {MONTHLY_CAPS[featureId] && (
            <MonthlyCapEditor
              featureId={featureId}
              permission={permission}
              onUpdate={onUpdate}
              cap={MONTHLY_CAPS[featureId]}
            />
          )}
          {featureId === SPEECH_AI_TRANSCRIPTION_FEATURE && (
            <TranscribeModeEditor
              featureId={featureId}
              permission={permission}
              onUpdate={onUpdate}
            />
          )}
          {MODEL_TIER_FEATURES.includes(featureId) && (
            <ModelTierEditor
              featureId={featureId}
              permission={permission}
              onUpdate={onUpdate}
            />
          )}
          {featureId === INPUT_SIGNALS_FEATURE && (
            <InputSignsEditor permission={permission} onUpdate={onUpdate} />
          )}
          {children}
        </div>
      )}
    </div>
  );
};
