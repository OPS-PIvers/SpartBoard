import React, { lazy, Suspense, useId } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import type {
  ActivityWallLayout,
  ActivityWallPeriod,
  ActivityWallSection,
} from '@/types';
import { timePeriodError } from './timePeriods';
import { DEFAULT_MAP_CENTER, type WallStructure } from './constants';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';

const MapPinPicker = lazy(
  () => import('@/components/activityWall/submission/MapPinPicker')
);

interface SectionsEditorProps {
  layout: ActivityWallLayout;
  /** Dated timeline preview: shows the time periods list on timeline walls. */
  timelineDates?: boolean;
  value: WallStructure;
  onChange: (patch: WallStructure) => void;
}

const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary';

const iconButtonClass =
  'rounded-lg border border-slate-200 bg-white p-2 text-slate-600 transition hover:bg-slate-50 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary';

const newSection = (): ActivityWallSection => ({
  id: crypto.randomUUID(),
  label: '',
});

interface LabelledListProps {
  legend: string;
  /** Singular noun used for the per-item labels under the plural legend. */
  itemNoun: string;
  hint?: string;
  addLabel: string;
  items: ActivityWallSection[];
  onChange: (items: ActivityWallSection[]) => void;
}

const LabelledList: React.FC<LabelledListProps> = ({
  legend,
  itemNoun,
  hint,
  addLabel,
  items,
  onChange,
}) => {
  const fieldPrefix = useId();

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    onChange(next);
  };

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-bold text-slate-700">{legend}</legend>
      {hint && <p className="text-xs text-slate-600">{hint}</p>}
      {items.length === 0 && (
        <p className="text-xs text-slate-600">Nothing added yet.</p>
      )}
      <ul className="space-y-2">
        {items.map((item, index) => (
          <li key={item.id} className="flex items-center gap-2">
            <label className="sr-only" htmlFor={`${fieldPrefix}-${item.id}`}>
              {`${itemNoun} ${index + 1} label`}
            </label>
            <input
              id={`${fieldPrefix}-${item.id}`}
              {...tourFieldAttr(
                'activity-wall-editor.section-label',
                'activity-wall',
                item.id
              )}
              className={inputClass}
              value={item.label}
              placeholder={`${itemNoun} ${index + 1}`}
              onChange={(event) =>
                onChange(
                  items.map((entry) =>
                    entry.id === item.id
                      ? { ...entry, label: event.target.value }
                      : entry
                  )
                )
              }
            />
            <button
              type="button"
              className={iconButtonClass}
              aria-label={`Move ${itemNoun.toLowerCase()} ${index + 1} up`}
              disabled={index === 0}
              {...tourFieldAttr(
                'activity-wall-editor.section-move-up',
                'activity-wall',
                item.id
              )}
              onClick={() => move(index, -1)}
            >
              <ArrowUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={iconButtonClass}
              aria-label={`Move ${itemNoun.toLowerCase()} ${index + 1} down`}
              disabled={index === items.length - 1}
              {...tourFieldAttr(
                'activity-wall-editor.section-move-down',
                'activity-wall',
                item.id
              )}
              onClick={() => move(index, 1)}
            >
              <ArrowDown className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={iconButtonClass}
              aria-label={`Remove ${itemNoun.toLowerCase()} ${index + 1}`}
              {...tourFieldAttr(
                'activity-wall-editor.section-remove',
                'activity-wall',
                item.id
              )}
              onClick={() =>
                onChange(items.filter((entry) => entry.id !== item.id))
              }
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => onChange([...items, newSection()])}
        {...tourAttr('activity-wall-editor.section-add')}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-brand-blue-primary transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary"
      >
        <Plus className="h-4 w-4" />
        {addLabel}
      </button>
    </fieldset>
  );
};

const TimePeriodsList: React.FC<{
  items: ActivityWallPeriod[];
  onChange: (items: ActivityWallPeriod[]) => void;
}> = ({ items, onChange }) => {
  const fieldPrefix = useId();
  const update = (id: string, patch: Partial<ActivityWallPeriod>) =>
    onChange(
      items.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-bold text-slate-700">Time periods</legend>
      <p className="text-xs text-slate-600">
        Shade and name stretches of time on the timeline.
      </p>
      {items.length === 0 && (
        <p className="text-xs text-slate-600">Nothing added yet.</p>
      )}
      <ul className="space-y-3">
        {items.map((item, index) => {
          // Date problems show once both dates are typed; the rest wait for Save.
          const error =
            item.from.trim() && item.to.trim() ? timePeriodError(item) : null;
          const errorId = `${fieldPrefix}-${item.id}-error`;
          return (
            <li key={item.id} className="space-y-1">
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <label
                    className="text-xs font-semibold text-slate-600"
                    htmlFor={`${fieldPrefix}-${item.id}-name`}
                  >
                    Name
                  </label>
                  <input
                    id={`${fieldPrefix}-${item.id}-name`}
                    {...tourFieldAttr(
                      'activity-wall-editor.period-name',
                      'activity-wall',
                      item.id
                    )}
                    className={inputClass}
                    value={item.label}
                    placeholder={`Time period ${index + 1}`}
                    onChange={(event) =>
                      update(item.id, { label: event.target.value })
                    }
                  />
                </div>
                <div className="w-28 shrink-0">
                  <label
                    className="text-xs font-semibold text-slate-600"
                    htmlFor={`${fieldPrefix}-${item.id}-from`}
                  >
                    From
                  </label>
                  <input
                    id={`${fieldPrefix}-${item.id}-from`}
                    {...tourFieldAttr(
                      'activity-wall-editor.period-from',
                      'activity-wall',
                      item.id
                    )}
                    className={inputClass}
                    value={item.from}
                    placeholder="1861"
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? errorId : undefined}
                    onChange={(event) =>
                      update(item.id, { from: event.target.value })
                    }
                  />
                </div>
                <div className="w-28 shrink-0">
                  <label
                    className="text-xs font-semibold text-slate-600"
                    htmlFor={`${fieldPrefix}-${item.id}-to`}
                  >
                    To
                  </label>
                  <input
                    id={`${fieldPrefix}-${item.id}-to`}
                    {...tourFieldAttr(
                      'activity-wall-editor.period-to',
                      'activity-wall',
                      item.id
                    )}
                    className={inputClass}
                    value={item.to}
                    placeholder="1865"
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? errorId : undefined}
                    onChange={(event) =>
                      update(item.id, { to: event.target.value })
                    }
                  />
                </div>
                <button
                  type="button"
                  className={iconButtonClass}
                  aria-label={`Remove time period ${index + 1}`}
                  {...tourFieldAttr(
                    'activity-wall-editor.period-remove',
                    'activity-wall',
                    item.id
                  )}
                  onClick={() =>
                    onChange(items.filter((entry) => entry.id !== item.id))
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {error && (
                <p id={errorId} className="text-xs text-red-600">
                  {error}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={() =>
          onChange([
            ...items,
            { id: crypto.randomUUID(), label: '', from: '', to: '' },
          ])
        }
        {...tourAttr('activity-wall-editor.period-add')}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-brand-blue-primary transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary"
      >
        <Plus className="h-4 w-4" />
        Add time period
      </button>
    </fieldset>
  );
};

/** Layout-specific structure fields; wall and word cloud render nothing, timeline only its time periods. */
export const SectionsEditor: React.FC<SectionsEditorProps> = ({
  layout,
  timelineDates,
  value,
  onChange,
}) => {
  const zoomId = useId();

  if (layout === 'timeline') {
    return timelineDates ? (
      <TimePeriodsList
        items={value.timePeriods ?? []}
        onChange={(timePeriods) => onChange({ timePeriods })}
      />
    ) : null;
  }

  if (layout === 'columns') {
    return (
      <LabelledList
        legend="Columns"
        itemNoun="Column"
        hint="Students choose one column when they post."
        addLabel="Add column"
        items={value.sections ?? []}
        onChange={(sections) => onChange({ sections })}
      />
    );
  }

  if (layout === 'table') {
    return (
      <div className="space-y-5">
        <LabelledList
          legend="Rows"
          itemNoun="Row"
          addLabel="Add row"
          items={value.tableRows ?? []}
          onChange={(tableRows) => onChange({ tableRows })}
        />
        <LabelledList
          legend="Columns"
          itemNoun="Column"
          addLabel="Add column"
          items={value.tableCols ?? []}
          onChange={(tableCols) => onChange({ tableCols })}
        />
      </div>
    );
  }

  if (layout === 'map') {
    const center = value.mapCenter ?? DEFAULT_MAP_CENTER;
    return (
      <div className="space-y-3">
        <div>
          <p className="text-sm font-bold text-slate-700">Starting view</p>
          <p className="text-xs text-slate-600">
            Tap the map to set the start view.
          </p>
        </div>
        <Suspense
          fallback={
            <div className="h-64 animate-pulse rounded-xl bg-slate-200" />
          }
        >
          <div {...tourAttr('activity-wall-editor.map-start')}>
            <MapPinPicker
              center={center}
              pin={{ lat: center.lat, lng: center.lng }}
              onPick={(pin) =>
                onChange({
                  mapCenter: { ...center, lat: pin.lat, lng: pin.lng },
                })
              }
            />
          </div>
        </Suspense>
        <div>
          <label
            className="mb-1 block text-sm font-semibold text-slate-700"
            htmlFor={zoomId}
          >
            Zoom level
          </label>
          <input
            id={zoomId}
            {...tourAttr('activity-wall-editor.map-zoom')}
            type="range"
            min={1}
            max={18}
            step={1}
            value={center.zoom}
            onChange={(event) =>
              onChange({
                mapCenter: { ...center, zoom: Number(event.target.value) },
              })
            }
            className="w-full accent-brand-blue-primary"
          />
          <p className="text-xs text-slate-600">{`Zoom ${center.zoom}`}</p>
        </div>
      </div>
    );
  }

  return null;
};
