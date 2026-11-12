// Who a District library item reaches: everyone, buildings, grades or named staff (QUIZ_MCA_PRACTICE.md M27).
import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { tourFieldAttr } from '@/config/tourAnchors';
import { canonicalBuildingId, type Building } from '@/config/buildings';
import { ALL_GRADES, gradeLabel } from '@/utils/gradeMatch';
import { parseEmails } from '@/utils/districtLibraryTargeting';
import type {
  DistrictLibraryItem,
  DistrictLibraryTargeting,
} from '@/types/districtLibrary';

interface Props {
  item: Pick<DistrictLibraryItem, 'id'> & DistrictLibraryTargeting;
  buildings: readonly Building[];
  onSave: (targeting: DistrictLibraryTargeting) => Promise<void>;
  onCancel: () => void;
}

const toggle = (list: string[], value: string): string[] =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

export const DistrictLibraryTargetingEditor: React.FC<Props> = ({
  item,
  buildings,
  onSave,
  onCancel,
}) => {
  const [everyone, setEveryone] = useState(item.everyone);
  const [picked, setPicked] = useState<string[]>(() => [
    ...new Set(item.targetBuildings.map(canonicalBuildingId)),
  ]);
  const [grades, setGrades] = useState<string[]>(item.targetGrades);
  const [emailText, setEmailText] = useState(item.targetEmails.join('\n'));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { invalid } = parseEmails(emailText);

  const save = async () => {
    if (invalid.length > 0) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({
        everyone,
        targetBuildings: picked,
        targetGrades: grades,
        targetEmails: parseEmails(emailText).emails,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
      setSaving(false);
    }
  };

  const key = item.id;
  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-4">
      <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
        <input
          type="checkbox"
          checked={everyone}
          onChange={(e) => setEveryone(e.target.checked)}
          {...tourFieldAttr('admin.district-library.everyone', 'admin', key)}
        />
        Every teacher in the district
      </label>
      {!everyone && (
        <>
          <fieldset>
            <legend className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
              Buildings
            </legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
              {buildings.map((b) => (
                <label
                  key={b.id}
                  className="flex items-center gap-2 text-sm text-slate-700"
                >
                  <input
                    type="checkbox"
                    checked={picked.includes(b.id)}
                    onChange={() => setPicked((prev) => toggle(prev, b.id))}
                    {...tourFieldAttr(
                      'admin.district-library.building',
                      'admin',
                      b.id
                    )}
                  />
                  {b.name}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
              Grades
            </legend>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-1">
              {ALL_GRADES.map((g) => (
                <label
                  key={g}
                  className="flex items-center gap-2 text-sm text-slate-700"
                >
                  <input
                    type="checkbox"
                    checked={grades.includes(g)}
                    onChange={() => setGrades((prev) => toggle(prev, g))}
                    {...tourFieldAttr(
                      'admin.district-library.grade',
                      'admin',
                      g
                    )}
                  />
                  {gradeLabel(g)}
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Teachers who haven&apos;t picked their grades match by building.
            </p>
          </fieldset>
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Teachers
            </span>
            <textarea
              value={emailText}
              onChange={(e) => setEmailText(e.target.value)}
              rows={3}
              placeholder="name@orono.k12.mn.us"
              {...tourFieldAttr(
                'admin.district-library.teachers',
                'admin',
                key
              )}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-brand-blue-primary/40"
            />
            {invalid.length > 0 && (
              <span role="alert" className="text-xs text-red-600">
                Not an email: {invalid.join(', ')}
              </span>
            )}
          </label>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || invalid.length > 0}
          {...tourFieldAttr(
            'admin.district-library.save-targeting',
            'admin',
            key
          )}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-blue-primary px-3 py-1.5 text-sm font-bold text-white hover:bg-brand-blue-dark disabled:opacity-50"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          {...tourFieldAttr(
            'admin.district-library.cancel-targeting',
            'admin',
            key
          )}
          className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-200"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};
