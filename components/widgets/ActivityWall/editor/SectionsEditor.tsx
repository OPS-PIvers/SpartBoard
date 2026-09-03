import React, { lazy, Suspense, useId } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import type { ActivityWallLayout, ActivityWallSection } from '@/types';
import { DEFAULT_MAP_CENTER, type WallStructure } from './constants';

const MapPinPicker = lazy(
  () => import('@/components/activityWall/submission/MapPinPicker')
);

interface SectionsEditorProps {
  layout: ActivityWallLayout;
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
  hint: string;
  addLabel: string;
  items: ActivityWallSection[];
  onChange: (items: ActivityWallSection[]) => void;
}

const LabelledList: React.FC<LabelledListProps> = ({
  legend,
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
      <p className="text-xs text-slate-600">{hint}</p>
      {items.length === 0 && (
        <p className="text-xs text-slate-600">Nothing added yet.</p>
      )}
      <ul className="space-y-2">
        {items.map((item, index) => (
          <li key={item.id} className="flex items-center gap-2">
            <label className="sr-only" htmlFor={`${fieldPrefix}-${item.id}`}>
              {`${legend} ${index + 1} label`}
            </label>
            <input
              id={`${fieldPrefix}-${item.id}`}
              className={inputClass}
              value={item.label}
              placeholder={`${legend} ${index + 1}`}
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
              aria-label={`Move ${legend.toLowerCase()} ${index + 1} up`}
              disabled={index === 0}
              onClick={() => move(index, -1)}
            >
              <ArrowUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={iconButtonClass}
              aria-label={`Move ${legend.toLowerCase()} ${index + 1} down`}
              disabled={index === items.length - 1}
              onClick={() => move(index, 1)}
            >
              <ArrowDown className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={iconButtonClass}
              aria-label={`Remove ${legend.toLowerCase()} ${index + 1}`}
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
        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-brand-blue-primary transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary"
      >
        <Plus className="h-4 w-4" />
        {addLabel}
      </button>
    </fieldset>
  );
};

/** Layout-specific structure fields; wall, timeline and word cloud render nothing. */
export const SectionsEditor: React.FC<SectionsEditorProps> = ({
  layout,
  value,
  onChange,
}) => {
  const zoomId = useId();

  if (layout === 'columns') {
    return (
      <LabelledList
        legend="Column"
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
          legend="Row"
          hint="Rows run down the left edge of the table."
          addLabel="Add row"
          items={value.tableRows ?? []}
          onChange={(tableRows) => onChange({ tableRows })}
        />
        <LabelledList
          legend="Column"
          hint="Columns run across the top of the table."
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
            Tap the map to set where students start. They can still pan
            anywhere.
          </p>
        </div>
        <Suspense
          fallback={
            <div className="h-64 animate-pulse rounded-xl bg-slate-200" />
          }
        >
          <MapPinPicker
            center={center}
            pin={{ lat: center.lat, lng: center.lng }}
            onPick={(pin) =>
              onChange({ mapCenter: { ...center, lat: pin.lat, lng: pin.lng } })
            }
          />
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
