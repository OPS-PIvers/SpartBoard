import React, { useMemo } from 'react';
import { tourFieldAttr } from '@/config/tourAnchors';
import { Archive, FlaskConical, GraduationCap, Loader2 } from 'lucide-react';
import type { GlobalFeature, GlobalFeaturePermission } from '@/types';
import { FEATURE_DEFAULTS } from '@/config/featureDefaults';
import { rolloutSwitchKey, type RolloutSwitch } from '@/config/rolloutSwitches';
import { TOOLS } from '@/config/tools';
import { Toggle } from '@/components/common/Toggle';
import { AccessFeatureRow } from './AccessFeatureRow';
import { FocusHoursRow } from './FocusHoursRow';
import { ImportOffersSection } from './ImportOffersSection';
import { IMPORT_FLAGS_ON_ROWS } from '@/components/import/importTargets';
import { FOCUS_HOURS_SEARCH_FIELDS } from '@/config/focusSessions';
import { AccessSearchEmpty, AdminSearchField } from './AdminSearchField';
import {
  ROLLOUT_ONLY_SWITCHES,
  featureSearchFields,
  matchesSearch,
  groupChildLabel,
  previewFeatures,
  previewGroupChildren,
  rolloutSearchFields,
  switchForFeature,
} from './accessSearch';
import { useAccessSearch } from './accessSearchContext';
import { useGlobalPermissionsEditor } from './useGlobalPermissionsEditor';
import { useRolloutSwitch } from './useRolloutSwitch';
import { isReadyToGraduate, previewStatus } from './previewStatus';
import { retireIssueUrl } from './retireIssue';
import { useAuth } from '@/context/useAuth';
import { isSuperAdminActor } from '@/utils/superAdmin';

// True when the rules refuse this switch's write for the signed-in admin.
const useSuperAdminLock = (sw: RolloutSwitch): boolean => {
  const { user, roleId, orgId } = useAuth();
  return !!sw.superAdminOnly && !isSuperAdminActor(user?.email, roleId, orgId);
};

const DistrictSwitch: React.FC<{
  sw: RolloutSwitch;
  state: ReturnType<typeof useRolloutSwitch>;
}> = ({ sw, state }) => {
  const locked = useSuperAdminLock(sw);
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-xxs font-bold text-slate-400 uppercase">
        District
      </span>
      {state.enabled === null ? (
        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
      ) : (
        <Toggle
          checked={state.enabled}
          disabled={state.saving || locked}
          onChange={(next) => void state.change(next)}
          size="sm"
          label={`${sw.title} district switch`}
          anchor={tourFieldAttr(
            'admin.previews.district-switch',
            'admin',
            rolloutSwitchKey(sw)
          )}
        />
      )}
    </span>
  );
};

export const PreviewRow: React.FC<{
  featureId: GlobalFeature;
  editor: ReturnType<typeof useGlobalPermissionsEditor>;
  displayLabel?: string;
  defaultExpanded?: boolean;
  children?: React.ReactNode;
}> = ({ featureId, editor, displayLabel, defaultExpanded, children }) => {
  const sw = switchForFeature(featureId);
  const district = useRolloutSwitch(sw);
  const districtOn = sw ? district.enabled : undefined;
  const permission = editor.getPermission(featureId);
  const saved = editor.isSaved(featureId);
  const ready = isReadyToGraduate(permission, saved, districtOn);
  const def = FEATURE_DEFAULTS[featureId];
  const retire = def.afterLaunch === 'retire';
  // A group parent graduates only once its add-ons have left Previews.
  const hasPreviewOptions =
    previewGroupChildren(featureId, previewFeatures(editor.graduated)).length >
    0;
  const graduating = editor.saving.has(featureId);
  const graduate = () => {
    const home = def.widget
      ? `${TOOLS.find((t) => t.type === def.widget)?.label ?? def.widget} settings`
      : 'Features';
    void editor.savePermission(
      featureId,
      { graduated: true },
      `Moved ${def.label} to ${home}`
    );
  };
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
      displayLabel={displayLabel}
      defaultExpanded={defaultExpanded}
      lead={
        <>
          {sw && <DistrictSwitch sw={sw} state={district} />}
          {ready && !retire && !hasPreviewOptions && (
            <button
              type="button"
              onClick={graduate}
              disabled={graduating || editor.unsavedChanges.has(featureId)}
              data-testid={`graduate-${featureId}`}
              {...tourFieldAttr('admin.previews.graduate', 'admin', featureId)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-green-300 bg-green-50 text-green-800 text-xs font-bold hover:bg-green-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {graduating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
              ) : (
                <GraduationCap className="w-3.5 h-3.5" aria-hidden />
              )}
              Graduate
            </button>
          )}
          {ready && retire && (
            <a
              href={retireIssueUrl(featureId)}
              target="_blank"
              rel="noopener noreferrer"
              title="Opens a GitHub issue asking Claude to remove the old version"
              data-testid={`retire-${featureId}`}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-green-300 bg-green-50 text-green-800 text-xs font-bold hover:bg-green-100"
            >
              <Archive className="w-3.5 h-3.5" aria-hidden />
              Retire
            </a>
          )}
        </>
      }
      status={
        <>
          {previewStatus(permission, districtOn)}
          {district.error ? ` · ${district.error}` : ''}
        </>
      }
    >
      {children}
    </AccessFeatureRow>
  );
};

// The Import lists only set the level, so a flag saved as off or narrowed keeps its full row.
const needsFullRow = (p: GlobalFeaturePermission): boolean =>
  !p.enabled || (p.buildings?.length ?? 0) > 0 || !!p.minTier;

const RolloutOnlyRow: React.FC<{ sw: RolloutSwitch }> = ({ sw }) => {
  const state = useRolloutSwitch(sw);
  const locked = useSuperAdminLock(sw);
  return (
    <div
      data-testid={`rollout-row-${rolloutSwitchKey(sw)}`}
      className="bg-white flex items-center gap-3 p-3"
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
          {locked ? ' · Super admins only' : ''}
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

  const { features, groups } = useMemo(() => {
    const all = previewFeatures(editor.graduated);
    const matches = (id: GlobalFeature) =>
      matchesSearch(query, featureSearchFields(id));
    const byLabel = (a: GlobalFeature, b: GlobalFeature) =>
      FEATURE_DEFAULTS[a].label.localeCompare(FEATURE_DEFAULTS[b].label);
    const nested = new Set<GlobalFeature>();
    const groups = new Map<
      GlobalFeature,
      { children: GlobalFeature[]; openForSearch: boolean }
    >();
    for (const parent of all) {
      const kids = previewGroupChildren(parent, all);
      if (kids.length === 0) continue;
      kids.forEach((id) => nested.add(id));
      const hits = query.trim() ? kids.filter(matches) : [];
      if (hits.length === 0 && !matches(parent)) continue;
      groups.set(parent, {
        children: (hits.length > 0 ? hits : kids).sort((a, b) =>
          groupChildLabel(a).localeCompare(groupChildLabel(b))
        ),
        openForSearch: hits.length > 0,
      });
    }
    const features = all
      .filter((id) => !nested.has(id) && (groups.has(id) || matches(id)))
      .sort(byLabel);
    return { features, groups };
  }, [query, editor.graduated]);
  const rolloutOnly = ROLLOUT_ONLY_SWITCHES.filter((sw) =>
    matchesSearch(query, rolloutSearchFields(sw))
  );
  const focusHours = matchesSearch(query, FOCUS_HOURS_SEARCH_FIELDS);
  const district = rolloutOnly.length > 0 || focusHours;

  if (editor.loading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-600">
        Loading previews...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <AdminSearchField tab="previews" placeholder="Search previews" />
      {features.length === 0 && !district ? (
        <AccessSearchEmpty
          tab="previews"
          fallback="Nothing in preview."
          graduated={editor.graduated}
        />
      ) : (
        <>
          {features.length > 0 && (
            <div className="divide-y divide-slate-200 border-y border-slate-200">
              {features.map((id) => {
                const group = groups.get(id);
                if (!group)
                  return <PreviewRow key={id} featureId={id} editor={editor} />;
                // Import anything shows its own flags on its lists; Options keeps the rest.
                const options =
                  id === 'universal-import'
                    ? group.children.filter(
                        (c) =>
                          !IMPORT_FLAGS_ON_ROWS.has(c) ||
                          needsFullRow(editor.getSavedPermission(c))
                      )
                    : group.children;
                return (
                  <PreviewRow
                    key={id}
                    featureId={id}
                    editor={editor}
                    defaultExpanded={group.openForSearch}
                  >
                    {id === 'universal-import' && (
                      <ImportOffersSection editor={editor} />
                    )}
                    {options.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                          Options
                        </p>
                        <div
                          data-testid={`preview-group-${id}`}
                          className="divide-y divide-slate-200 border-y border-slate-200"
                        >
                          {options.map((child) => (
                            <PreviewRow
                              key={child}
                              featureId={child}
                              editor={editor}
                              displayLabel={groupChildLabel(child)}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </PreviewRow>
                );
              })}
            </div>
          )}
          {district && (
            <h3 className="pt-3 text-xs font-bold uppercase tracking-widest text-slate-500">
              District switches
            </h3>
          )}
          {district && (
            <div className="divide-y divide-slate-200 border-y border-slate-200">
              {rolloutOnly.map((sw) => (
                <RolloutOnlyRow key={rolloutSwitchKey(sw)} sw={sw} />
              ))}
              {focusHours && <FocusHoursRow />}
            </div>
          )}
        </>
      )}
    </div>
  );
};
