import React from 'react';
import type { ImportAdapter } from '@/components/common/library';
import type { ActivityWallLibraryEntry, ActivityWallSection } from '@/types';
import { buildDefaultWall } from '@/utils/activityWallNormalize';
import type { ActivityWallActivityDefaults } from '../buildingDefaults';
import {
  AI_CONVERSION_REVIEW_NOTE,
  AI_CONVERSION_TRUNCATED_NOTE,
  convertWithAi,
  type ActivityWallConversionResult,
  type ConversionInput,
  type WallConversionLayout,
} from '@/utils/import/aiConversion';
import { ActivityWallImportReview } from './ActivityWallImportReview';

/** The teacher's prompt and wall shape only; never student posts (docs/plans/IMPORT.md D10). */
export interface ActivityWallImportData {
  title: string;
  prompt: string;
  layout: WallConversionLayout;
  sections: ActivityWallSection[];
}

interface ActivityWallImportAdapterDeps {
  /** Building defaults a new wall starts from, as the wall editor uses. */
  defaults: ActivityWallActivityDefaults;
  save: (entry: ActivityWallLibraryEntry) => Promise<void>;
  /** Defaults to the importConvertV1 callable. */
  convert?: (
    target: 'activityWall',
    input: ConversionInput
  ) => Promise<ActivityWallConversionResult>;
}

/** A new wall with the reviewed prompt and layout, on the same defaults the wall editor starts from. */
export function buildImportedWall(
  data: ActivityWallImportData,
  title: string,
  defaults: ActivityWallActivityDefaults
): ActivityWallLibraryEntry {
  const sections =
    data.layout === 'columns'
      ? data.sections
          .map((s) => ({ ...s, label: s.label.trim() }))
          .filter((s) => s.label)
      : [];
  const blank = buildDefaultWall(defaults);
  const showNames = defaults.showNames ?? blank.showNames;
  return {
    ...blank,
    allowGuests: defaults.allowGuests ?? blank.allowGuests,
    showNames,
    maxPostsPerStudent: defaults.maxPostsPerStudent ?? blank.maxPostsPerStudent,
    title: title.trim(),
    prompt: data.prompt.trim(),
    layout: data.layout,
    // Legacy fields, kept in step as the wall editor does.
    mode: data.layout === 'wordcloud' ? 'text' : 'photo',
    identificationMode: showNames ? 'name' : 'anonymous',
    ...(sections.length > 0 ? { sections } : {}),
  };
}

export function createActivityWallImportAdapter(
  deps: ActivityWallImportAdapterDeps
): ImportAdapter<ActivityWallImportData> {
  return {
    widgetLabel: 'Activity Wall',
    supportedSources: [],
    parse: async (source) => {
      if (source.kind !== 'conversion') {
        throw new Error('Activity Walls are made from an imported page.');
      }
      const result = deps.convert
        ? await deps.convert('activityWall', source.input)
        : await convertWithAi('activityWall', source.input);
      return {
        data: {
          title: result.title,
          prompt: result.prompt,
          layout: result.layout,
          sections: result.columns.map((label) => ({
            id: crypto.randomUUID(),
            label,
          })),
        },
        warnings: result.truncated ? [AI_CONVERSION_TRUNCATED_NOTE] : [],
        note: AI_CONVERSION_REVIEW_NOTE,
      };
    },
    validate: (data) => {
      const errors: string[] = [];
      if (!data.prompt.trim()) errors.push('Add a prompt.');
      if (
        data.layout === 'columns' &&
        !data.sections.some((s) => s.label.trim())
      ) {
        errors.push('Add at least one column.');
      }
      return { ok: errors.length === 0, errors };
    },
    renderPreview: (data) => (
      <p className="whitespace-pre-wrap text-sm text-slate-800">
        {data.prompt}
      </p>
    ),
    renderReview: (data, onChange) => (
      <ActivityWallImportReview data={data} onChange={onChange} />
    ),
    suggestTitle: (data) => data.title,
    save: (data, title) =>
      deps.save(buildImportedWall(data, title, deps.defaults)),
  };
}
