// Teacher list of District library items that target them (docs/plans/QUIZ_MCA_PRACTICE.md M27-M28).
import React, { useState } from 'react';
import {
  Check,
  ChevronDown,
  Library,
  ListChecks,
  Loader2,
  Plus,
  X,
} from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { tourFieldAttr } from '@/config/tourAnchors';
import type { DistrictLibraryItem } from '@/types/districtLibrary';

/** Each distinct source credited in an item's question notes, with how many questions it covers. */
function itemSources(
  item: Pick<DistrictLibraryItem, 'questionNotes'>
): { attribution: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const note of Object.values(item.questionNotes ?? {})) {
    const text = note.attribution?.trim();
    if (text) counts.set(text, (counts.get(text) ?? 0) + 1);
  }
  return [...counts]
    .map(([attribution, count]) => ({ attribution, count }))
    .sort(
      (a, b) => b.count - a.count || a.attribution.localeCompare(b.attribution)
    );
}

export interface DistrictLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: DistrictLibraryItem[];
  /** Quiz items already in the library, by item id. */
  addedQuizItemIds: ReadonlySet<string>;
  /** Bank items already in the bank picker, by item id. */
  addedBankIds: ReadonlySet<string>;
  onAdd: (item: DistrictLibraryItem) => Promise<void>;
  onRemoveBank: (item: DistrictLibraryItem) => Promise<void>;
}

export const DistrictLibraryModal: React.FC<DistrictLibraryModalProps> = ({
  isOpen,
  onClose,
  items,
  addedQuizItemIds,
  addedBankIds,
  onAdd,
  onRemoveBank,
}) => {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState<string | null>(null);

  const run = async (id: string, action: () => Promise<void>) => {
    setBusyId(id);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusyId(null);
    }
  };

  const isAdded = (item: DistrictLibraryItem) =>
    item.kind === 'quiz'
      ? addedQuizItemIds.has(item.id)
      : addedBankIds.has(item.id);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="District library"
      maxWidth="max-w-2xl"
      contentClassName="px-6 pb-6 overflow-y-auto"
    >
      <p className="text-sm text-slate-600 mb-4">
        Added items stay read-only and get the district&apos;s corrections.
      </p>
      {error && (
        <p role="alert" className="mb-3 text-sm text-red-600">
          {error}
        </p>
      )}
      <ul className="divide-y divide-slate-200 border-y border-slate-200">
        {items.map((item) => {
          const added = isAdded(item);
          const busy = busyId === item.id;
          const KindIcon = item.kind === 'quiz' ? ListChecks : Library;
          const sources = itemSources(item);
          return (
            <li key={item.id} className="flex items-start gap-3 py-3">
              <KindIcon
                className="w-5 h-5 mt-0.5 shrink-0 text-brand-blue-primary"
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-slate-900">
                  {item.title}
                </div>
                <div className="text-xs text-slate-500">
                  {item.kind === 'quiz' ? 'Quiz' : 'Question bank'} ·{' '}
                  {item.questionCount}{' '}
                  {item.questionCount === 1 ? 'question' : 'questions'}
                  {item.sourceName ? ` · ${item.sourceName}` : ''}
                </div>
                {item.description && (
                  <p className="mt-1 text-xs text-slate-600">
                    {item.description}
                  </p>
                )}
                {sources.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        setSourcesOpen((prev) =>
                          prev === item.id ? null : item.id
                        )
                      }
                      aria-expanded={sourcesOpen === item.id}
                      {...tourFieldAttr(
                        'quiz.district-library.sources',
                        'quiz',
                        item.id
                      )}
                      className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-brand-blue-primary hover:underline"
                    >
                      Sources
                      <ChevronDown
                        className={`w-3.5 h-3.5 transition-transform ${
                          sourcesOpen === item.id ? 'rotate-180' : ''
                        }`}
                        aria-hidden
                      />
                    </button>
                    {sourcesOpen === item.id && (
                      <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
                        {sources.map((s) => (
                          <li key={s.attribution}>
                            {s.attribution}
                            {s.count > 1 ? ` (${s.count} questions)` : ''}
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>
              {added ? (
                <div className="flex items-center gap-2 shrink-0">
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                    <Check className="w-3.5 h-3.5" aria-hidden />
                    {item.kind === 'quiz' ? 'In your library' : 'In your banks'}
                  </span>
                  {item.kind === 'bank' && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => run(item.id, () => onRemoveBank(item))}
                      {...tourFieldAttr(
                        'quiz.district-library.remove',
                        'quiz',
                        item.id
                      )}
                      title="Remove from your banks"
                      aria-label={`Remove ${item.title} from your banks`}
                      className="touch-target-expand rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
                    >
                      <X className="w-4 h-4" aria-hidden />
                    </button>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  disabled={busy || busyId !== null}
                  onClick={() => run(item.id, () => onAdd(item))}
                  {...tourFieldAttr(
                    'quiz.district-library.add',
                    'quiz',
                    item.id
                  )}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-brand-blue-primary px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-blue-dark disabled:opacity-50"
                >
                  {busy ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Plus className="w-3.5 h-3.5" aria-hidden />
                  )}
                  Add
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </Modal>
  );
};
