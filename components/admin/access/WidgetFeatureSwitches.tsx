import React, { useState } from 'react';
import { tourFieldAttr } from '@/config/tourAnchors';
import { ChevronDown } from 'lucide-react';
import type { GlobalFeature, GlobalFeaturePermission } from '@/types';
import { audienceSummary, groupFeatureSwitches } from './featureSwitchGroups';
import {
  FEATURE_DEFAULTS,
  FEATURE_GROUP_LABELS,
} from '@/config/featureDefaults';
import { Toggle } from '@/components/common/Toggle';
import { BetaUsersPanel } from '@/components/admin/BetaUsersPanel';
import { MinTierSelect } from '@/components/admin/MinTierSelect';
import { PermissionBuildingMultiSelect } from '@/components/admin/PermissionBuildingMultiSelect';
import {
  AccessLevelPicker,
  DailyLimitEditor,
  ModelTierEditor,
} from './AccessFeatureRow';
import {
  GEMINI_FEATURES,
  MODEL_TIER_FEATURES,
  type GlobalPermissionsEditor,
} from './useGlobalPermissionsEditor';

const SwitchRow: React.FC<{
  featureId: GlobalFeature;
  editor: GlobalPermissionsEditor;
  child?: boolean;
}> = ({ featureId, editor, child = false }) => {
  const [open, setOpen] = useState(false);
  const def = FEATURE_DEFAULTS[featureId];
  const name = def.modalLabel ?? def.label;
  const permission = editor.getPermission(featureId);
  const onUpdate = (updates: Partial<GlobalFeaturePermission>) =>
    editor.updatePermission(featureId, updates);
  const panelId = `feature-switch-${featureId}`;
  const tone = child ? 'bg-slate-50' : 'bg-white';
  return (
    <div data-testid={`feature-switch-${featureId}`} className={tone}>
      <div
        className={`flex items-center gap-3 py-2.5 pr-4 ${child ? 'pl-11' : 'pl-4'}`}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={panelId}
          {...tourFieldAttr('admin.access.expand', 'admin', featureId)}
          className="flex items-center gap-3 min-w-0 flex-1 text-left"
        >
          <span
            className={`min-w-0 flex-1 text-sm font-semibold ${permission.enabled ? 'text-slate-800' : 'text-slate-400'}`}
          >
            {name}
          </span>
          {editor.unsavedChanges.has(featureId) && (
            <span className="shrink-0 px-1.5 py-0.5 rounded text-xxs font-bold border bg-amber-50 border-amber-200 text-amber-800">
              Unsaved
            </span>
          )}
          <span
            className={`shrink-0 text-xs font-medium ${permission.enabled ? 'text-slate-600' : 'text-slate-400'}`}
          >
            {audienceSummary(permission)}
          </span>
          <ChevronDown
            className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden
          />
        </button>
        <Toggle
          checked={permission.enabled}
          onChange={(enabled) => onUpdate({ enabled })}
          size="sm"
          label={`${name} enabled`}
          anchor={tourFieldAttr('admin.access.enabled', 'admin', featureId)}
        />
      </div>
      {open && (
        <div
          id={panelId}
          className={`pb-4 pr-4 space-y-4 ${child ? 'pl-11' : 'pl-4'}`}
        >
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
              Who
            </span>
            <AccessLevelPicker
              value={permission.accessLevel}
              onChange={(accessLevel) => onUpdate({ accessLevel })}
              label={name}
              anchorKey={featureId}
            />
          </div>
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
              showMessage={editor.showMessage}
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
        </div>
      )}
    </div>
  );
};

/** A widget's graduated switches, grouped, for its admin config modal. */
export const WidgetFeatureSwitches: React.FC<{
  featureIds: readonly GlobalFeature[];
  editor: GlobalPermissionsEditor;
}> = ({ featureIds, editor }) => {
  const sections = groupFeatureSwitches(featureIds);
  return (
    <div className="space-y-5">
      {sections.map(({ group, rows }) => (
        <section key={group ?? 'other'} className="space-y-2">
          {group && sections.length > 1 && (
            <h4 className="px-1 text-sm font-black text-slate-700 uppercase tracking-widest">
              {FEATURE_GROUP_LABELS[group]}
            </h4>
          )}
          <div className="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100 bg-white">
            {rows.map(({ id, children }) => (
              <React.Fragment key={id}>
                <SwitchRow featureId={id} editor={editor} />
                {children.map((childId) => (
                  <SwitchRow
                    key={childId}
                    featureId={childId}
                    editor={editor}
                    child
                  />
                ))}
              </React.Fragment>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};
