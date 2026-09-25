import React, { useState } from 'react';
import { ChevronDown, Globe, Save, Shield, Users } from 'lucide-react';
import type {
  AccessLevel,
  GlobalFeature,
  GlobalFeaturePermission,
} from '@/types';
import { FEATURE_DEFAULTS } from '@/config/featureDefaults';
import { Toggle } from '@/components/common/Toggle';
import { BetaUsersPanel } from '@/components/admin/BetaUsersPanel';
import { MinTierSelect } from '@/components/admin/MinTierSelect';
import { PermissionBuildingMultiSelect } from '@/components/admin/PermissionBuildingMultiSelect';
import {
  GEMINI_FEATURES,
  defaultDailyLimit,
  DEFAULT_MODEL_TIER,
  MODEL_TIER_FEATURES,
  type AiModelTier,
} from './useGlobalPermissionsEditor';

const LEVELS: { level: AccessLevel; label: string; Icon: typeof Shield }[] = [
  { level: 'admin', label: 'Admin', Icon: Shield },
  { level: 'beta', label: 'Beta', Icon: Users },
  { level: 'public', label: 'Public', Icon: Globe },
];

const LEVEL_ACTIVE: Record<AccessLevel, string> = {
  admin: 'bg-purple-100 text-purple-700 border-purple-300',
  beta: 'bg-blue-100 text-blue-700 border-blue-300',
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
}> = ({ value, onChange, label }) => (
  <div role="group" aria-label={`${label} access`} className="flex gap-1">
    {LEVELS.map(({ level, label: text, Icon }) => (
      <button
        key={level}
        type="button"
        onClick={() => onChange(level)}
        aria-pressed={value === level}
        className={`px-2 py-1 rounded-md border text-xs font-medium flex items-center gap-1 transition-colors ${
          value === level
            ? LEVEL_ACTIVE[level]
            : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
        }`}
      >
        <Icon className="w-3.5 h-3.5" aria-hidden />
        <span className="hidden sm:inline">{text}</span>
      </button>
    ))}
  </div>
);

const DailyLimitEditor: React.FC<{
  featureId: GlobalFeature;
  permission: GlobalFeaturePermission;
  onUpdate: (updates: Partial<GlobalFeaturePermission>) => void;
}> = ({ featureId, permission, onUpdate }) => {
  const enabled = (permission.config?.dailyLimitEnabled as boolean) ?? true;
  const label = FEATURE_DEFAULTS[featureId].label;
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
        Daily limit
      </span>
      <Toggle
        checked={enabled}
        onChange={(checked) =>
          onUpdate({
            config: { ...permission.config, dailyLimitEnabled: checked },
          })
        }
        size="xs"
        label={`${label} daily limit`}
      />
      <input
        type="number"
        min="1"
        max="1000"
        disabled={!enabled}
        aria-label={`${label} uses per day`}
        value={
          (permission.config?.dailyLimit as number) ??
          defaultDailyLimit(featureId)
        }
        onChange={(e) => {
          const val = parseInt(e.target.value);
          onUpdate({
            config: {
              ...permission.config,
              dailyLimit: isNaN(val) ? defaultDailyLimit(featureId) : val,
            },
          });
        }}
        className="w-20 px-2 py-1 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-blue-primary disabled:opacity-50"
      />
      <span className="text-xs text-slate-500">
        per day. Admins are unlimited.
      </span>
    </div>
  );
};

const ModelTierEditor: React.FC<{
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
        value={tier}
        onChange={(e) =>
          onUpdate({
            config: {
              ...permission.config,
              modelTier: e.target.value as AiModelTier,
            },
          })
        }
        className="px-2 py-1 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
      >
        <option value="standard">Standard</option>
        <option value="advanced">Advanced</option>
      </select>
    </div>
  );
};

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
}) => {
  const [expanded, setExpanded] = useState(false);
  const def = FEATURE_DEFAULTS[featureId];
  const Icon = def.icon;
  const panelId = `access-row-${featureId}`;
  return (
    <div
      data-testid={`access-row-${featureId}`}
      className="bg-white border border-slate-200 rounded-xl hover:border-brand-blue-light transition-colors"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls={panelId}
          className="flex items-center gap-3 min-w-0 flex-1 text-left"
        >
          <span className="bg-brand-blue-lighter p-2 rounded-lg text-brand-blue-primary shrink-0">
            <Icon className="w-4 h-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-slate-800 text-sm">
                {def.label}
              </span>
              {permissionChips(featureId, permission, isSaved)}
              {extraChips}
            </span>
            <span className="block text-xxs text-slate-500 truncate">
              {status ?? def.description}
            </span>
          </span>
          <ChevronDown
            className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
            aria-hidden
          />
        </button>
        <div className="flex items-center gap-3 ml-auto">
          {lead}
          <Toggle
            checked={permission.enabled}
            onChange={(checked) => onUpdate({ enabled: checked })}
            size="sm"
            label={`${def.label} enabled`}
          />
          <AccessLevelPicker
            value={permission.accessLevel}
            onChange={(accessLevel) => onUpdate({ accessLevel })}
            label={def.label}
          />
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving || !hasUnsaved}
            aria-label={`Save ${def.label}`}
            title={hasUnsaved ? 'Save changes' : 'No changes to save'}
            className={`p-2 rounded-lg transition-colors disabled:cursor-not-allowed ${
              hasUnsaved
                ? 'bg-orange-600 hover:bg-orange-700 text-white'
                : 'text-slate-300'
            }`}
          >
            <Save className="w-4 h-4" />
          </button>
        </div>
      </div>
      {expanded && (
        <div
          id={panelId}
          className="border-t border-slate-100 bg-slate-50 p-4 space-y-4 rounded-b-xl"
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
          {GEMINI_FEATURES.includes(featureId) && (
            <DailyLimitEditor
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
          {children}
        </div>
      )}
    </div>
  );
};
