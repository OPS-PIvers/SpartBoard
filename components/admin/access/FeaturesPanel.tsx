import React from 'react';
import type { GlobalFeature } from '@/types';
import {
  FEATURE_CATEGORY_LABELS,
  FEATURE_DEFAULTS,
  type FeatureCategory,
} from '@/config/featureDefaults';
import { Toast } from '@/components/common/Toast';
import { AccessFeatureRow } from './AccessFeatureRow';
import { AccessSearchEmpty, AdminSearchField } from './AdminSearchField';
import { GeminiModelsCard } from './GeminiModelsCard';
import {
  FEATURES_TAB_FEATURES,
  featureSearchFields,
  matchesSearch,
} from './accessSearch';
import { useAccessSearch } from './accessSearchContext';
import { useGlobalPermissionsEditor } from './useGlobalPermissionsEditor';

const GEMINI_MODEL_FIELDS = ['Gemini models', 'model overrides', 'AI'];

type SectionKey = FeatureCategory | 'widgets';

const SECTION_LABELS: Record<SectionKey, string> = {
  ...FEATURE_CATEGORY_LABELS,
  widgets: 'Widget features',
};

const sectionOf = (id: GlobalFeature): SectionKey =>
  FEATURE_DEFAULTS[id].category ?? 'widgets';

/** Permanent app-wide capabilities, grouped by category (plan D10). */
export const FeaturesPanel: React.FC = () => {
  const editor = useGlobalPermissionsEditor();
  const { query } = useAccessSearch();

  if (editor.loading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-600">
        Loading features...
      </div>
    );
  }

  const visible = FEATURES_TAB_FEATURES.filter((id) =>
    matchesSearch(query, featureSearchFields(id))
  );
  const showModels = matchesSearch(query, GEMINI_MODEL_FIELDS);
  const sections = (Object.keys(SECTION_LABELS) as SectionKey[])
    .map((key) => ({
      key,
      ids: visible
        .filter((id) => sectionOf(id) === key)
        .sort((a, b) =>
          FEATURE_DEFAULTS[a].label.localeCompare(FEATURE_DEFAULTS[b].label)
        ),
    }))
    .filter(({ key, ids }) => ids.length > 0 || (key === 'ai' && showModels));

  return (
    <div className="space-y-3">
      {editor.message && (
        <Toast
          message={editor.message.text}
          type={editor.message.type}
          onClose={() => editor.setMessage(null)}
        />
      )}
      <AdminSearchField tab="features" placeholder="Search features" />
      {sections.length === 0 && (
        <AccessSearchEmpty tab="features" fallback="No features." />
      )}
      {sections.map(({ key, ids }) => (
        <section key={key} className="space-y-2">
          <h3 className="pt-2 text-xs font-bold uppercase tracking-widest text-slate-500">
            {SECTION_LABELS[key]}
          </h3>
          {key === 'ai' && showModels && (
            <GeminiModelsCard
              permission={editor.getPermission('gemini-functions')}
              onUpdate={(updates) =>
                editor.updatePermission('gemini-functions', updates)
              }
              onSave={() => void editor.savePermission('gemini-functions')}
              isSaving={editor.saving.has('gemini-functions')}
              hasUnsaved={editor.unsavedChanges.has('gemini-functions')}
            />
          )}
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
            />
          ))}
        </section>
      ))}
    </div>
  );
};
