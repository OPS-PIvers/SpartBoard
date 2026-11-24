import React, { useMemo } from 'react';
import type { GlobalFeature, GlobalFeaturePermission } from '@/types';
import { FEATURE_DEFAULTS } from '@/config/featureDefaults';
import { rolloutSwitchKey } from '@/config/rolloutSwitches';
import { TOOLS } from '@/config/tools';
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
import { previewStatus } from './previewStatus';
import { retireIssueUrl, retireSwitchIssueUrl } from './retireIssue';
import {
  DistrictSwitch,
  GraduateButton,
  RetireLink,
  RolloutOnlyRow,
} from './DistrictSwitch';
import { useGraduatedSwitches } from './useGraduatedSwitches';

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
  const savedPermission = editor.getSavedPermission(featureId);
  const def = FEATURE_DEFAULTS[featureId];
  const unsaved = editor.unsavedChanges.has(featureId);
  // A group parent graduates only once its add-ons have left Previews.
  const hasPreviewOptions =
    previewGroupChildren(featureId, previewFeatures(editor.graduated)).length >
    0;
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
      isSaved={editor.isSaved(featureId)}
      isSaving={editor.saving.has(featureId)}
      hasUnsaved={unsaved}
      onUpdate={(updates) => editor.updatePermission(featureId, updates)}
      onSave={() => void editor.savePermission(featureId)}
      showMessage={editor.showMessage}
      displayLabel={displayLabel}
      defaultExpanded={defaultExpanded}
      lead={
        <>
          {sw && <DistrictSwitch sw={sw} state={district} />}
          {!hasPreviewOptions && (
            <GraduateButton
              anchorKey={featureId}
              testId={`graduate-${featureId}`}
              busy={editor.saving.has(featureId)}
              disabled={unsaved}
              title={
                unsaved
                  ? 'Save first'
                  : 'Moves it out of Previews with its settings'
              }
              onClick={graduate}
            />
          )}
          {!hasPreviewOptions && (
            <RetireLink
              anchorKey={featureId}
              testId={`retire-${featureId}`}
              href={retireIssueUrl(featureId, savedPermission, districtOn)}
              disabled={unsaved || (!!sw && district.enabled === null)}
            />
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

/** Everything still being tested: access flags and district switches together (D1, D12). */
export const PreviewsPanel: React.FC = () => {
  const editor = useGlobalPermissionsEditor();
  const switches = useGraduatedSwitches();
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
  const rolloutOnly = ROLLOUT_ONLY_SWITCHES.filter(
    (sw) =>
      !switches.keys.has(rolloutSwitchKey(sw)) &&
      matchesSearch(query, rolloutSearchFields(sw))
  );
  const focusHours = matchesSearch(query, FOCUS_HOURS_SEARCH_FIELDS);
  const district = rolloutOnly.length > 0 || focusHours;

  if (editor.loading || switches.loading) {
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
          {switches.error && (
            <p role="alert" className="text-xs text-brand-red-primary">
              {switches.error}
            </p>
          )}
          {district && (
            <h3 className="pt-3 text-xs font-bold uppercase tracking-widest text-slate-500">
              District switches
            </h3>
          )}
          {district && (
            <div className="divide-y divide-slate-200 border-y border-slate-200">
              {rolloutOnly.map((sw) => (
                <RolloutOnlyRow
                  key={rolloutSwitchKey(sw)}
                  sw={sw}
                  actions={(enabled) => (
                    <>
                      <GraduateButton
                        anchorKey={rolloutSwitchKey(sw)}
                        testId={`graduate-${rolloutSwitchKey(sw)}`}
                        busy={switches.saving === rolloutSwitchKey(sw)}
                        title="Moves it to Features, where it stays a switch"
                        onClick={() =>
                          void switches.graduate(rolloutSwitchKey(sw))
                        }
                      />
                      <RetireLink
                        anchorKey={rolloutSwitchKey(sw)}
                        testId={`retire-${rolloutSwitchKey(sw)}`}
                        href={retireSwitchIssueUrl(sw, enabled)}
                      />
                    </>
                  )}
                />
              ))}
              {focusHours && <FocusHoursRow />}
            </div>
          )}
        </>
      )}
    </div>
  );
};
