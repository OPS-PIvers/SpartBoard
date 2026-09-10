import React, { useCallback, useEffect, useState } from 'react';
import {
  collection,
  doc,
  getCountFromServer,
  getDocs,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import { BookOpenCheck, Loader2 } from 'lucide-react';
import { db } from '@/config/firebase';
import type { StandardBenchmark } from '@/types';
import {
  STANDARD_SETS,
  chunk,
  diffCatalog,
  toBenchmarkDoc,
  type StandardSetEntry,
} from '@/utils/standardsCatalog';

const BATCH_SIZE = 450;

interface SetState {
  count: number | null;
  revision: string | null;
  running: boolean;
  summary: string | null;
  error: string | null;
}

const initialState: SetState = {
  count: null,
  revision: null,
  running: false,
  summary: null,
  error: null,
};

const toMessage = (err: unknown) =>
  err instanceof Error ? err.message : String(err);

const setQuery = (set: string) =>
  query(collection(db, 'standards_catalog'), where('set', '==', set));

const fetchCount = async (set: string) =>
  (await getCountFromServer(setQuery(set))).data().count;

// Upserts added + changed benchmarks in batches; never deletes.
const seedSet = async (entry: StandardSetEntry) => {
  const file = await entry.load();
  const incoming = file.benchmarks.map(toBenchmarkDoc);
  const snap = await getDocs(setQuery(entry.set));
  const existing = new Map<string, StandardBenchmark>();
  snap.forEach((d) => existing.set(d.id, d.data() as StandardBenchmark));
  const diff = diffCatalog(existing, incoming);
  for (const slice of chunk([...diff.added, ...diff.updated], BATCH_SIZE)) {
    const batch = writeBatch(db);
    for (const bench of slice) {
      batch.set(doc(db, 'standards_catalog', bench.id), bench);
    }
    await batch.commit();
  }
  return diff;
};

const StandardSetRow: React.FC<{ entry: StandardSetEntry }> = ({ entry }) => {
  const [state, setState] = useState<SetState>(initialState);
  const patch = (next: Partial<SetState>) =>
    setState((prev) => ({ ...prev, ...next }));

  const refresh = useCallback(async () => {
    try {
      const [count, file] = await Promise.all([
        fetchCount(entry.set),
        entry.load(),
      ]);
      patch({ count, revision: file.revision, error: null });
    } catch (err) {
      patch({ error: toMessage(err) });
    }
  }, [entry]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleSeed = async () => {
    patch({ running: true, summary: null, error: null });
    try {
      const diff = await seedSet(entry);
      patch({
        summary: `Added ${diff.added.length}, updated ${diff.updated.length}, unchanged ${diff.unchangedCount}.`,
      });
      await refresh();
    } catch (err) {
      patch({ error: toMessage(err) });
    } finally {
      patch({ running: false });
    }
  };

  return (
    <div className="flex items-center justify-between gap-4 p-3 rounded-lg bg-slate-50 border border-slate-100">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-800">{entry.label}</p>
        <p className="text-xs text-slate-500 mt-0.5">
          {entry.subject.toUpperCase()}
          {state.revision ? ` · ${state.revision}` : ''}
          {' · '}
          {state.count === null ? 'Counting…' : `${state.count} in Firestore`}
        </p>
        {state.summary && (
          <p className="text-xs text-green-700 mt-1">{state.summary}</p>
        )}
        {state.error && (
          <p className="text-xs text-red-600 mt-1" role="alert">
            {state.error}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={handleSeed}
        disabled={state.running}
        className="shrink-0 inline-flex items-center gap-2 px-3 py-2 bg-brand-blue-primary text-white text-sm rounded-lg hover:bg-brand-blue-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {state.running && <Loader2 className="w-4 h-4 animate-spin" />}
        {state.running ? 'Seeding…' : 'Seed / re-seed'}
      </button>
    </div>
  );
};

export const StandardsPanel: React.FC = () => (
  <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-4">
    <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
      <BookOpenCheck className="w-4 h-4 text-brand-blue-primary" />
      <div>
        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-widest">
          Standards
        </h4>
        <p className="text-xxs text-slate-500 mt-0.5">
          Seed the standards catalog from the bundled sets. Re-seeding adds and
          updates benchmarks; nothing is deleted.
        </p>
      </div>
    </div>
    <div className="space-y-3">
      {STANDARD_SETS.map((entry) => (
        <StandardSetRow key={entry.set} entry={entry} />
      ))}
    </div>
  </div>
);
