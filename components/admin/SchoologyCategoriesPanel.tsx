// Admin card for `admin_settings/schoology_categories`: categories offered to a Schoology course that has none (SCHOOLOGY_TOOL_COLUMNS.md D13).
import React, { useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Loader2, Plus, School, X } from 'lucide-react';
import { db } from '@/config/firebase';
import { logError } from '@/utils/logError';

const SCHOOLOGY_CATEGORIES_DOC = 'schoology_categories';
const DEFAULT_SCHOOLOGY_CATEGORIES = [
  { title: 'Academic Practice', weight: 20 },
  { title: 'Academic Achievement', weight: 80 },
];

type Row = { key: number; title: string; weight: number };

let rowKey = 0;
const toRows = (cats: { title: string; weight: number }[]): Row[] =>
  cats.map((c) => ({ key: ++rowKey, title: c.title, weight: c.weight }));

const inputClass =
  'rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40';

export const SchoologyCategoriesPanel: React.FC = () => {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDoc(doc(db, 'admin_settings', SCHOOLOGY_CATEGORIES_DOC))
      .then((snap) => {
        if (cancelled) return;
        const cats = (snap.data() as { categories?: unknown } | undefined)
          ?.categories;
        setRows(
          toRows(
            Array.isArray(cats) && cats.length > 0
              ? (cats as { title: string; weight: number }[])
              : DEFAULT_SCHOOLOGY_CATEGORIES
          )
        );
      })
      .catch((err: unknown) => {
        logError('SchoologyCategoriesPanel.load', err);
        if (!cancelled) setRows(toRows(DEFAULT_SCHOOLOGY_CATEGORIES));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const total = (rows ?? []).reduce((t, r) => t + r.weight, 0);
  const names = (rows ?? []).map((r) => r.title.trim().toLowerCase());
  const valid =
    !!rows &&
    rows.length > 0 &&
    rows.length <= 10 &&
    names.every((n) => n.length > 0) &&
    new Set(names).size === names.length &&
    total === 100;

  const update = (next: Row[]) => {
    setRows(next);
    setSaved(false);
  };

  const save = async () => {
    if (!rows || !valid) return;
    setSaving(true);
    setError(null);
    try {
      await setDoc(doc(db, 'admin_settings', SCHOOLOGY_CATEGORIES_DOC), {
        categories: rows.map((r) => ({
          title: r.title.trim(),
          weight: r.weight,
        })),
        updatedAt: Date.now(),
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-brand-blue-lighter/40 text-brand-blue-primary flex items-center justify-center">
          <School className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Schoology categories
          </h2>
          <p className="text-sm text-slate-500">
            Offered when a teacher pushes to a Schoology course with no grading
            categories.
          </p>
        </div>
      </div>

      {!rows ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
          Loading…
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r, i) => (
            <div key={r.key} className="flex items-center gap-2">
              <input
                aria-label={`Category ${i + 1} name`}
                value={r.title}
                maxLength={60}
                onChange={(e) =>
                  update(
                    rows.map((x) =>
                      x.key === r.key ? { ...x, title: e.target.value } : x
                    )
                  )
                }
                className={`${inputClass} flex-1 min-w-0`}
              />
              <input
                aria-label={`Category ${i + 1} weight`}
                type="number"
                min={0}
                max={100}
                step={1}
                value={r.weight}
                onChange={(e) =>
                  update(
                    rows.map((x) =>
                      x.key === r.key
                        ? {
                            ...x,
                            weight: Math.max(
                              0,
                              Math.min(
                                100,
                                Math.round(Number(e.target.value) || 0)
                              )
                            ),
                          }
                        : x
                    )
                  )
                }
                className={`${inputClass} w-20 text-right`}
              />
              <span className="text-sm text-slate-500" aria-hidden>
                %
              </span>
              <button
                type="button"
                aria-label={`Remove ${r.title || `category ${i + 1}`}`}
                onClick={() => update(rows.filter((x) => x.key !== r.key))}
                className="p-1.5 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          <div className="flex items-center justify-between">
            <button
              type="button"
              disabled={rows.length >= 10}
              onClick={() =>
                update([...rows, { key: ++rowKey, title: '', weight: 0 }])
              }
              className="inline-flex items-center gap-1 text-sm font-bold text-brand-blue-primary disabled:opacity-50"
            >
              <Plus className="w-4 h-4" /> Add category
            </button>
            <span
              className={`text-sm font-bold ${total === 100 ? 'text-slate-500' : 'text-amber-700'}`}
            >
              Total {total}%
            </span>
          </div>
          {error && <p className="text-sm text-brand-red-primary">{error}</p>}
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={!valid || saving}
              onClick={() => void save()}
              className="inline-flex items-center gap-2 text-sm font-bold text-white bg-brand-blue-primary hover:bg-brand-blue-dark px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Save
            </button>
            {saved && <span className="text-sm text-emerald-600">Saved</span>}
          </div>
        </div>
      )}
    </div>
  );
};
