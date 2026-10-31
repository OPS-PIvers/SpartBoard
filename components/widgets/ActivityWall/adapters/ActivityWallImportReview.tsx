import React, { useId } from 'react';
import { tourAttr } from '@/config/tourAnchors';
import type { WallConversionLayout } from '@/utils/import/aiConversion';
import { LAYOUT_OPTIONS } from '../editor/layoutOptions';
import { SectionsEditor } from '../editor/SectionsEditor';
import type { ActivityWallImportData } from './activityWallImportAdapter';

const REVIEW_LAYOUTS: readonly WallConversionLayout[] = [
  'wall',
  'columns',
  'wordcloud',
];

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-primary';

interface ActivityWallImportReviewProps {
  data: ActivityWallImportData;
  onChange: (next: ActivityWallImportData) => void;
}

/** Review step for an AI-made Activity Wall: the prompt, the layout and, for columns, their labels. */
export const ActivityWallImportReview: React.FC<
  ActivityWallImportReviewProps
> = ({ data, onChange }) => {
  const promptId = useId();
  const layoutId = useId();
  return (
    <div className="space-y-4">
      <div>
        <label
          className="mb-1 block text-sm font-bold text-slate-700"
          htmlFor={promptId}
        >
          Prompt
        </label>
        <textarea
          id={promptId}
          {...tourAttr('import-review.wall-prompt')}
          rows={3}
          className={inputClass}
          value={data.prompt}
          onChange={(event) =>
            onChange({ ...data, prompt: event.target.value })
          }
        />
      </div>
      <div>
        <label
          className="mb-1 block text-sm font-bold text-slate-700"
          htmlFor={layoutId}
        >
          Layout
        </label>
        <select
          id={layoutId}
          {...tourAttr('import-review.wall-layout')}
          className={inputClass}
          value={data.layout}
          onChange={(event) =>
            onChange({
              ...data,
              layout: event.target.value as WallConversionLayout,
            })
          }
        >
          {LAYOUT_OPTIONS.filter((o) =>
            REVIEW_LAYOUTS.includes(o.layout as WallConversionLayout)
          ).map((o) => (
            <option key={o.layout} value={o.layout}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      {data.layout === 'columns' && (
        <SectionsEditor
          layout="columns"
          value={{ sections: data.sections }}
          onChange={(patch) =>
            onChange({ ...data, sections: patch.sections ?? [] })
          }
        />
      )}
    </div>
  );
};
