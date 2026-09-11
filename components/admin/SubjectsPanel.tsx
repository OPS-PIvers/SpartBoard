// Admin card for `admin_settings/subjects`: the content areas teachers pick in their profile.
import React, { useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import {
  Archive,
  ArchiveRestore,
  Library,
  Loader2,
  Lock,
  Pencil,
  Plus,
} from 'lucide-react';
import { db } from '@/config/firebase';
import {
  SUBJECTS_DOC,
  isCatalogSubjectId,
  subjectIdFromLabel,
  type Subject,
} from '@/config/subjects';
import { useSubjects } from '@/hooks/useSubjects';

const inputClass =
  'rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40';

export const SubjectsPanel: React.FC = () => {
  const { subjects, loading } = useSubjects();
  const [newLabel, setNewLabel] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const persist = async (next: Subject[]) => {
    setSaving(true);
    setError(null);
    try {
      await setDoc(doc(db, 'admin_settings', SUBJECTS_DOC), {
        subjects: next,
        updatedAt: Date.now(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const add = async () => {
    const label = newLabel.trim();
    const base = subjectIdFromLabel(label);
    if (!label || !base) return;
    let id = base;
    let n = 2;
    while (subjects.some((s) => s.id === id)) id = `${base}-${n++}`;
    setNewLabel('');
    await persist([...subjects, { id, label }]);
  };

  const rename = async (id: string) => {
    const label = editLabel.trim();
    setEditingId(null);
    if (!label) return;
    await persist(subjects.map((s) => (s.id === id ? { ...s, label } : s)));
  };

  const setArchived = async (id: string, archived: boolean) => {
    if (isCatalogSubjectId(id)) return;
    await persist(
      subjects.map((s) => {
        if (s.id !== id) return s;
        const { archived: _old, ...rest } = s;
        return archived ? { ...rest, archived: true } : rest;
      })
    );
  };

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-brand-blue-lighter/40 text-brand-blue-primary flex items-center justify-center">
          <Library className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">Content areas</h2>
          <p className="text-xs text-slate-600">
            Subjects teachers can mark as taught in their profile. Archived
            subjects stay on existing profiles and targets but can no longer be
            picked. Subjects with a standards catalog cannot be archived.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
          Loading…
        </div>
      ) : (
        <>
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {subjects.map((subject) => {
              const locked = isCatalogSubjectId(subject.id);
              const editing = editingId === subject.id;
              return (
                <li
                  key={subject.id}
                  className="flex items-center gap-3 px-4 py-2.5"
                >
                  <div className="flex-1 min-w-0">
                    {editing ? (
                      <input
                        autoFocus
                        aria-label={`Rename ${subject.label}`}
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void rename(subject.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        onBlur={() => void rename(subject.id)}
                        className={`${inputClass} w-full`}
                      />
                    ) : (
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`text-sm font-semibold truncate ${
                            subject.archived
                              ? 'text-slate-400 line-through'
                              : 'text-slate-900'
                          }`}
                        >
                          {subject.label}
                        </span>
                        <span className="font-mono text-xxs text-slate-500">
                          {subject.id}
                        </span>
                        {locked && (
                          <Lock
                            className="w-3.5 h-3.5 text-slate-400"
                            aria-label="Has a standards catalog"
                          />
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(subject.id);
                      setEditLabel(subject.label);
                    }}
                    disabled={saving || editing}
                    aria-label={`Rename ${subject.label}`}
                    className="p-1.5 rounded text-slate-500 hover:bg-slate-100 disabled:opacity-40"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void setArchived(subject.id, !subject.archived)
                    }
                    disabled={saving || locked}
                    aria-label={
                      subject.archived
                        ? `Restore ${subject.label}`
                        : `Archive ${subject.label}`
                    }
                    title={
                      locked
                        ? 'Subjects with a standards catalog cannot be archived'
                        : undefined
                    }
                    className="p-1.5 rounded text-slate-500 hover:bg-slate-100 disabled:opacity-40"
                  >
                    {subject.archived ? (
                      <ArchiveRestore className="w-4 h-4" />
                    ) : (
                      <Archive className="w-4 h-4" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          <form
            className="mt-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void add();
            }}
          >
            <input
              aria-label="New content area"
              placeholder="Add a content area"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              className={`${inputClass} flex-1`}
            />
            <button
              type="submit"
              disabled={saving || !newLabel.trim()}
              className="inline-flex items-center gap-1.5 rounded-md bg-brand-blue-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-blue-dark disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              Add
            </button>
          </form>

          {error && (
            <p role="alert" className="mt-3 text-sm text-red-600">
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
};
