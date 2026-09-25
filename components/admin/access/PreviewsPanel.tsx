import React, { useMemo } from 'react';
import { FlaskConical, Loader2 } from 'lucide-react';
import type { GlobalFeature } from '@/types';
import { FEATURE_DEFAULTS } from '@/config/featureDefaults';
import type { RolloutSwitch } from '@/config/rolloutSwitches';
import { Toast } from '@/components/common/Toast';
import { Toggle } from '@/components/common/Toggle';
import { AccessFeatureRow, Chip } from './AccessFeatureRow';
import { AccessSearchEmpty, AdminSearchField } from './AdminSearchField';
import {
  PREVIEW_FEATURES,
  ROLLOUT_ONLY_SWITCHES,
  featureSearchFields,
  matchesSearch,
  rolloutSearchFields,
  switchForFeature,
} from './accessSearch';
import { useAccessSearch } from './accessSearchContext';
import { useGlobalPermissionsEditor } from './useGlobalPermissionsEditor';
import { useRolloutSwitch } from './useRolloutSwitch';
import { isReadyToGraduate, previewStatus } from './previewStatus';

const DistrictSwitch: React.FC<{
  sw: RolloutSwitch;
  state: ReturnType<typeof useRolloutSwitch>;
}> = ({ sw, state }) => (
  <span className="flex items-center gap-1.5">
    <span className="text-xxs font-bold text-slate-400 uppercase">
      District
    </span>
    {state.enabled === null ? (
      <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
    ) : (
      <Toggle
        checked={state.enabled}
        disabled={state.saving}
        onChange={(next) => void state.change(next)}
        size="sm"
        label={`${sw.title} district switch`}
      />
    )}
  </span>
);

const PreviewRow: React.FC<{
  featureId: GlobalFeature;
  editor: ReturnType<typeof useGlobalPermissionsEditor>;
}> = ({ featureId, editor }) => {
  const sw = switchForFeature(featureId);
  const district = useRolloutSwitch(sw);
  const districtOn = sw ? district.enabled : undefined;
  const permission = editor.getPermission(featureId);
  const saved = editor.isSaved(featureId);
  const ready = isReadyToGraduate(permission, saved, districtOn);
  const retire = FEATURE_DEFAULTS[featureId].afterLaunch === 'retire';
  return (
    <AccessFeatureRow
      featureId={featureId}
      permission={permission}
      isSaved={saved}
      isSaving={editor.saving.has(featureId)}
      hasUnsaved={editor.unsavedChanges.has(featureId)}
      onUpdate={(updates) => editor.updatePermission(featureId, updates)}
      onSave={() => void editor.savePermission(featureId)}
      showMessage={editor.showMessage}
      lead={sw ? <DistrictSwitch sw={sw} state={district} /> : undefined}
      extraChips={
        ready
          ? [
              <Chip key="ready" tone="green">
                {retire ? 'Ready to retire' : 'Ready to graduate'}
              </Chip>,
            ]
          : []
      }
      status={
        <>
          {previewStatus(permission, districtOn)}
          {district.error ? ` · ${district.error}` : ''}
        </>
      }
    />
  );
};

const RolloutOnlyRow: React.FC<{ sw: RolloutSwitch }> = ({ sw }) => {
  const state = useRolloutSwitch(sw);
  return (
    <div
      data-testid={`rollout-row-${sw.docId}`}
      className="bg-white border border-slate-200 rounded-xl flex items-center gap-3 p-3"
    >
      <span className="bg-brand-blue-lighter p-2 rounded-lg text-brand-blue-primary shrink-0">
        <FlaskConical className="w-4 h-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold text-slate-800 text-sm">
          {sw.title}
        </span>
        <span className="block text-xxs text-slate-500 truncate">
          {state.enabled === null
            ? sw.description
            : state.enabled
              ? 'Live for: everyone'
              : 'Off everywhere'}
          {state.error ? ` · ${state.error}` : ''}
        </span>
      </span>
      <DistrictSwitch sw={sw} state={state} />
    </div>
  );
};

/** Everything still being tested: access flags and district switches together (D1, D12). */
export const PreviewsPanel: React.FC = () => {
  const editor = useGlobalPermissionsEditor();
  const { query } = useAccessSearch();

  const features = useMemo(
    () =>
      PREVIEW_FEATURES.filter((id) =>
        matchesSearch(query, featureSearchFields(id))
      ).sort((a, b) =>
        FEATURE_DEFAULTS[a].label.localeCompare(FEATURE_DEFAULTS[b].label)
      ),
    [query]
  );
  const rolloutOnly = ROLLOUT_ONLY_SWITCHES.filter((sw) =>
    matchesSearch(query, rolloutSearchFields(sw))
  );

  if (editor.loading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-600">
        Loading previews...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {editor.message && (
        <Toast
          message={editor.message.text}
          type={editor.message.type}
          onClose={() => editor.setMessage(null)}
        />
      )}
      <AdminSearchField tab="previews" placeholder="Search previews" />
      {features.length === 0 && rolloutOnly.length === 0 ? (
        <AccessSearchEmpty tab="previews" fallback="Nothing in preview." />
      ) : (
        <>
          {features.map((id) => (
            <PreviewRow key={id} featureId={id} editor={editor} />
          ))}
          {rolloutOnly.length > 0 && (
            <h3 className="pt-3 text-xs font-bold uppercase tracking-widest text-slate-500">
              District switches
            </h3>
          )}
          {rolloutOnly.map((sw) => (
            <RolloutOnlyRow key={sw.docId} sw={sw} />
          ))}
        </>
      )}
    </div>
  );
};
