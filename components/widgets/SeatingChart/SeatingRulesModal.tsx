import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { SeatingChartRules } from '@/types';
import { Modal } from '@/components/common/Modal';
import { tourAttr } from '@/config/tourAnchors';

interface SeatingRulesModalProps {
  widgetId: string;
  isOpen: boolean;
  onClose: () => void;
  students: { id: string; label: string }[];
  rules: SeatingChartRules;
  onChange: (rules: SeatingChartRules) => void;
}

const selectClass =
  'flex-1 min-w-0 p-1.5 text-sm border border-slate-200 bg-white rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-slate-700';

export const SeatingRulesModal: React.FC<SeatingRulesModalProps> = ({
  widgetId,
  isOpen,
  onClose,
  students,
  rules,
  onChange,
}) => {
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const labelById = new Map(students.map((s) => [s.id, s.label]));
  const pairs = (rules.keepApart ?? []).filter(
    (p) => labelById.has(p.a) && labelById.has(p.b)
  );
  const front = new Set(rules.frontSeat ?? []);
  const duplicate = pairs.some(
    (p) =>
      (p.a === first && p.b === second) || (p.a === second && p.b === first)
  );
  const canAdd =
    first !== '' && second !== '' && first !== second && !duplicate;

  const addPair = () => {
    if (!canAdd) return;
    onChange({
      ...rules,
      keepApart: [...(rules.keepApart ?? []), { a: first, b: second }],
    });
    setFirst('');
    setSecond('');
  };

  const removePair = (index: number) => {
    const target = pairs[index];
    onChange({
      ...rules,
      keepApart: (rules.keepApart ?? []).filter((p) => p !== target),
    });
  };

  const toggleFront = (id: string) => {
    const next = new Set(front);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange({ ...rules, frontSeat: [...next] });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Seating rules"
      maxWidth="max-w-lg"
    >
      <div className="space-y-5">
        <section className="space-y-2">
          <h3 className="text-sm font-bold text-slate-700">Keep apart</h3>
          {pairs.length > 0 && (
            <ul className="divide-y divide-slate-100 border-y border-slate-100">
              {pairs.map((p, i) => (
                <li
                  key={`${p.a}-${p.b}`}
                  className="flex items-center justify-between gap-2 py-1.5 text-sm text-slate-700"
                >
                  <span className="min-w-0">
                    {labelById.get(p.a)} and {labelById.get(p.b)}
                  </span>
                  <button
                    type="button"
                    {...tourAttr(
                      'seating.rules-remove-pair',
                      widgetId,
                      'seating-chart'
                    )}
                    onClick={() => removePair(i)}
                    className="p-1 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    aria-label={`Remove ${labelById.get(p.a)} and ${labelById.get(p.b)}`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center gap-2">
            <select
              aria-label="First student"
              {...tourAttr('seating.rules-first', widgetId, 'seating-chart')}
              value={first}
              onChange={(e) => setFirst(e.target.value)}
              className={selectClass}
            >
              <option value="">Student</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Second student"
              {...tourAttr('seating.rules-second', widgetId, 'seating-chart')}
              value={second}
              onChange={(e) => setSecond(e.target.value)}
              className={selectClass}
            >
              <option value="">Student</option>
              {students
                .filter((s) => s.id !== first)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
            </select>
            <button
              type="button"
              {...tourAttr('seating.rules-add-pair', widgetId, 'seating-chart')}
              onClick={addPair}
              disabled={!canAdd}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400"
            >
              <Plus className="w-4 h-4" />
              Add
            </button>
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-bold text-slate-700">Front row</h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 max-h-56 overflow-y-auto pb-1 custom-scrollbar">
            {students.map((s) => (
              <label
                key={s.id}
                className="flex items-center gap-2 py-0.5 text-sm text-slate-700 cursor-pointer min-w-0"
              >
                <input
                  type="checkbox"
                  {...tourAttr(
                    'seating.rules-front-seat',
                    widgetId,
                    'seating-chart'
                  )}
                  checked={front.has(s.id)}
                  onChange={() => toggleFront(s.id)}
                  className="accent-indigo-600"
                />
                <span className="truncate" title={s.label}>
                  {s.label}
                </span>
              </label>
            ))}
          </div>
        </section>
      </div>
    </Modal>
  );
};
