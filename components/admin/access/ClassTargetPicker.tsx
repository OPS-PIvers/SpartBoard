import React, { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useDashboard } from '@/context/useDashboard';

interface Props {
  selectedIds: string[];
  onChange: (next: string[]) => void;
}

const chipClass = (selected: boolean) =>
  `inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${
    selected
      ? 'bg-brand-blue-primary text-white border-brand-blue-primary shadow-sm hover:bg-brand-blue-dark'
      : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
  }`;

/** Pick the classes whose students get a feature early; picks the ClassLink section ID a student's sign-in carries. */
export const ClassTargetPicker: React.FC<Props> = ({
  selectedIds,
  onChange,
}) => {
  const { rosters } = useDashboard();
  const [draft, setDraft] = useState('');

  const options = useMemo(() => {
    const seen = new Set<string>();
    const out: { id: string; name: string }[] = [];
    for (const r of rosters) {
      const id = r.classlinkClassId ?? r.testClassId;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push({ id, name: r.name });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }, [rosters]);

  const selected = new Set(selectedIds);
  const known = new Set(options.map((o) => o.id));
  const other = selectedIds.filter((id) => !known.has(id));

  const toggle = (id: string) =>
    onChange(
      selected.has(id)
        ? selectedIds.filter((s) => s !== id)
        : [...selectedIds, id]
    );

  const add = () => {
    const id = draft.trim();
    setDraft('');
    if (id && !selected.has(id)) onChange([...selectedIds, id]);
  };

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
        Student classes
      </p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => toggle(o.id)}
            aria-pressed={selected.has(o.id)}
            aria-label={`${selected.has(o.id) ? 'Remove' : 'Add'} ${o.name}`}
            className={chipClass(selected.has(o.id))}
          >
            {selected.has(o.id) ? (
              <X className="w-3 h-3" />
            ) : (
              <Plus className="w-3 h-3" />
            )}
            {o.name}
          </button>
        ))}
        {other.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => toggle(id)}
            aria-pressed="true"
            aria-label={`Remove class ${id}`}
            className={chipClass(true)}
          >
            <X className="w-3 h-3" />
            {id}
          </button>
        ))}
      </div>
      <div className="flex gap-2 max-w-md">
        <input
          type="text"
          value={draft}
          placeholder="Section ID"
          aria-label="Add class by section ID"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add();
          }}
          className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
        />
        <button
          type="button"
          onClick={add}
          aria-label="Add class"
          className="px-3 py-1.5 bg-brand-blue-primary text-white rounded-lg hover:bg-brand-blue-dark transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
