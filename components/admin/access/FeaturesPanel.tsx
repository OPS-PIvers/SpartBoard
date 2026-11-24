import React from 'react';
import type { GlobalFeature } from '@/types';
import {
  FEATURE_CATEGORY_LABELS,
  FEATURE_DEFAULTS,
  type FeatureCategory,
} from '@/config/featureDefaults';
import { AccessFeatureRow } from './AccessFeatureRow';
import { AssignmentModesSection } from './AssignmentModesSection';
import { ImportOffersSection } from './ImportOffersSection';
import { AccessSearchEmpty, AdminSearchField } from './AdminSearchField';
import {
  ASSIGNMENT_MODES_SEARCH_FIELDS,
  featureSearchFields,
  featuresTabFeatures,
  matchesSearch,
  ROLLOUT_ONLY_SWITCHES,
  rolloutSearchFields,
  switchForFeature,
} from './accessSearch';
import { rolloutSwitchKey } from '@/config/rolloutSwitches';
import { DistrictSwitch, RolloutOnlyRow, WrapUpMenu } from './DistrictSwitch';
import { retireIssueUrl, retireSwitchIssueUrl } from './retireIssue';
import { useRolloutSwitch } from './useRolloutSwitch';
import { useGraduatedSwitches } from './useGraduatedSwitches';
import { useAccessSearch } from './accessSearchContext';
import { useGlobalPermissionsEditor } from './useGlobalPermissionsEditor';

type SectionKey = FeatureCategory | 'other';

const SECTION_LABELS: Record<SectionKey, string> = {
  ...FEATURE_CATEGORY_LABELS,
  other: 'Other',
};

// A graduated preview with no category still needs a section.
const sectionOf = (id: GlobalFeature): SectionKey =>
  FEATURE_DEFAULTS[id].category ?? 'other';

// A graduated preview keeps its district switch and can still be retired.
const GraduatedRowActions: React.FC<{
  featureId: GlobalFeature;
  editor: ReturnType<typeof useGlobalPermissionsEditor>;
}> = ({ featureId, editor }) => {
  const sw = switchForFeature(featureId);
  const district = useRolloutSwitch(sw);
  if (FEATURE_DEFAULTS[featureId].stage === 'permanent') {
    return sw ? <DistrictSwitch sw={sw} state={district} /> : null;
  }
  return (
    <>
      {sw && <DistrictSwitch sw={sw} state={district} />}
      <WrapUpMenu
        anchorKey={featureId}
        retire={{
          href: retireIssueUrl(
            featureId,
            editor.getSavedPermission(featureId),
            sw ? district.enabled : undefined
          ),
          disabled:
            editor.unsavedChanges.has(featureId) ||
            (!!sw && (district.enabled === null || district.failed)),
        }}
      />
    </>
  );
};

/** Permanent app-wide capabilities, grouped by category (plan D10). */
export const FeaturesPanel: React.FC = () => {
  const editor = useGlobalPermissionsEditor();
  const switches = useGraduatedSwitches();
  const { query } = useAccessSearch();

  if (editor.loading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-600">
        Loading features...
      </div>
    );
  }

  const visible = featuresTabFeatures(editor.graduated).filter((id) =>
    matchesSearch(query, featureSearchFields(id))
  );
  const sections = (Object.keys(SECTION_LABELS) as SectionKey[])
    .map((key) => ({
      key,
      ids: visible
        .filter((id) => sectionOf(id) === key)
        .sort((a, b) =>
          FEATURE_DEFAULTS[a].label.localeCompare(FEATURE_DEFAULTS[b].label)
        ),
    }))
    .filter(({ ids }) => ids.length > 0);
  const showModes = matchesSearch(query, ASSIGNMENT_MODES_SEARCH_FIELDS);
  const districtSwitches = ROLLOUT_ONLY_SWITCHES.filter(
    (sw) =>
      switches.keys.has(rolloutSwitchKey(sw)) &&
      matchesSearch(query, rolloutSearchFields(sw))
  );

  return (
    <div className="space-y-3">
      <AdminSearchField tab="features" placeholder="Search features" />
      {showModes && <AssignmentModesSection editor={editor} />}
      {sections.length === 0 && !showModes && districtSwitches.length === 0 && (
        <AccessSearchEmpty
          tab="features"
          fallback="No features."
          graduated={editor.graduated}
          graduatedSwitches={switches.keys}
        />
      )}
      {sections.map(({ key, ids }) => (
        <section key={key} className="space-y-2">
          <h3 className="pt-2 text-xs font-bold uppercase tracking-widest text-slate-500">
            {SECTION_LABELS[key]}
          </h3>
          <div className="divide-y divide-slate-200 border-y border-slate-200">
            {ids.map((id) => (
              <AccessFeatureRow
                key={id}
                featureId={id}
                permission={editor.getPermission(id)}
                isSaved={editor.isSaved(id)}
                isSaving={editor.saving.has(id)}
                hasUnsaved={editor.unsavedChanges.has(id)}
                onUpdate={(updates) => editor.updatePermission(id, updates)}
                onSave={() => void editor.savePermission(id)}
                showMessage={editor.showMessage}
                lead={<GraduatedRowActions featureId={id} editor={editor} />}
              >
                {id === 'universal-import' && (
                  <ImportOffersSection editor={editor} />
                )}
              </AccessFeatureRow>
            ))}
          </div>
        </section>
      ))}
      {districtSwitches.length > 0 && (
        <section className="space-y-2">
          <h3 className="pt-2 text-xs font-bold uppercase tracking-widest text-slate-500">
            District switches
          </h3>
          <div className="divide-y divide-slate-200 border-y border-slate-200">
            {districtSwitches.map((sw) => (
              <RolloutOnlyRow
                key={rolloutSwitchKey(sw)}
                sw={sw}
                actions={(enabled) => (
                  <WrapUpMenu
                    anchorKey={rolloutSwitchKey(sw)}
                    retire={{ href: retireSwitchIssueUrl(sw, enabled) }}
                  />
                )}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
